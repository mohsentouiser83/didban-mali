"""Explicit invoice-row aggregation and overlap handling with full source lineage."""

from collections import defaultdict
from decimal import Decimal
from typing import Literal

from app.financial.normalization import normalize_text
from app.moadian.engine import identifier
from app.moadian.schemas import InvoiceSnapshot


def invoice_identity(item: InvoiceSnapshot) -> tuple[str, ...]:
    if item.tax_id:
        return ("tax", identifier(item.tax_id))
    return (
        "business",
        identifier(item.invoice_no),
        identifier(item.party_id) if item.party_id else normalize_text(item.party_name),
        item.issue_date.isoformat(),
    )


def provenance(item: InvoiceSnapshot) -> list[dict[str, object]]:
    return item.source_rows or [
        {
            "batch_id": str(item.batch_id),
            "row_id": str(item.row_id),
            "row_number": item.row_number,
            "sheet": item.sheet,
        }
    ]


def aggregate_invoice_rows(
    invoices: list[InvoiceSnapshot],
    mode: Literal["records", "line_totals", "repeated_totals"],
) -> list[InvoiceSnapshot]:
    if mode == "records":
        return invoices
    groups: dict[tuple[str, ...], list[InvoiceSnapshot]] = defaultdict(list)
    ungrouped: list[InvoiceSnapshot] = []
    for invoice in invoices:
        if not invoice.tax_id and not (
            invoice.invoice_no and (invoice.party_id or normalize_text(invoice.party_name))
        ):
            ungrouped.append(
                invoice.model_copy(
                    update={
                        "import_limitations": [
                            *invoice.import_limitations,
                            "تجمیع اقلام بدون شماره مالیاتی یا مشخصات طرف معامله قابل تأیید نیست.",
                        ]
                    }
                )
            )
        else:
            groups[invoice_identity(invoice)].append(invoice)
    result = list(ungrouped)
    for items in groups.values():
        first = items[0]
        conflicts = any(
            (
                item.issue_date,
                item.party_id,
                normalize_text(item.party_name),
                item.subject,
                item.reference_tax_id,
                item.status,
            )
            != (
                first.issue_date,
                first.party_id,
                normalize_text(first.party_name),
                first.subject,
                first.reference_tax_id,
                first.status,
            )
            for item in items[1:]
        )
        limitations = [reason for item in items for reason in item.import_limitations]
        if conflicts:
            limitations.append("مشخصات ردیف‌های یک فاکتور ناسازگار است.")
        gross = first.gross_amount
        tax = first.tax_amount
        if mode == "line_totals":
            gross = str(sum((Decimal(i.gross_amount) for i in items), Decimal(0)))
            tax = (
                str(
                    sum(
                        (Decimal(i.tax_amount) for i in items if i.tax_amount is not None),
                        Decimal(0),
                    )
                )
                if all(i.tax_amount is not None for i in items)
                else None
            )
        elif any((i.gross_amount, i.tax_amount) != (gross, tax) for i in items):
            limitations.append("مبالغ کل تکرارشده در ردیف‌های فاکتور برابر نیست.")
        result.append(
            first.model_copy(
                update={
                    "gross_amount": gross,
                    "tax_amount": tax,
                    "import_limitations": list(dict.fromkeys(limitations)),
                    "source_rows": [row for item in items for row in provenance(item)],
                }
            )
        )
    return result


def merge_overlapping_snapshots(
    invoices: list[InvoiceSnapshot],
) -> tuple[list[InvoiceSnapshot], int]:
    groups: dict[tuple[str, ...], list[InvoiceSnapshot]] = defaultdict(list)
    for invoice in invoices:
        groups[invoice_identity(invoice)].append(invoice)
    result: list[InvoiceSnapshot] = []
    copies = 0
    for items in groups.values():
        # Repetitions inside one file remain duplicates, not silently removed.
        if len({item.batch_id for item in items}) != len(items):
            result.extend(items)
            continue
        first = items[0]

        def content(i: InvoiceSnapshot) -> tuple[object, ...]:
            return (
                identifier(i.invoice_no),
                identifier(i.tax_id),
                i.issue_date,
                normalize_text(i.party_name),
                identifier(i.party_id),
                Decimal(i.gross_amount),
                Decimal(i.tax_amount) if i.tax_amount is not None else None,
                i.subject,
                identifier(i.reference_tax_id),
                i.status,
                tuple(i.import_limitations),
            )

        if all(content(item) == content(first) for item in items[1:]):
            copies += len(items) - 1
            result.append(
                first.model_copy(
                    update={
                        "source_rows": [row for item in items for row in provenance(item)],
                    }
                )
            )
        else:
            result.extend(
                item.model_copy(
                    update={
                        "import_limitations": [
                            *item.import_limitations,
                            "نسخه‌های متفاوت یک فاکتور در فایل‌های انتخاب‌شده وجود دارد.",
                        ],
                    }
                )
                for item in items
            )
    return result, copies
