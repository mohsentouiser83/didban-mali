"""Conservative one-to-one comparison of two explicitly selected invoice snapshots."""

from collections import Counter, defaultdict
from decimal import Decimal

from app.financial.normalization import normalize_text
from app.imports.mapping import normalize_digits
from app.moadian.schemas import ComparisonItem, InvoiceSnapshot, MatchStatus


def identifier(value: str) -> str:
    return normalize_digits(value).strip().upper()


def party_key(item: InvoiceSnapshot) -> str:
    return identifier(item.party_id) if item.party_id else normalize_text(item.party_name)


def comparison_fields(a: InvoiceSnapshot, b: InvoiceSnapshot) -> tuple[list[str], list[str]]:
    differences: list[str] = []
    limitations: list[str] = []
    for label, left, right in (
        ("موضوع صورتحساب", a.subject, b.subject),
        ("وضعیت صورتحساب", a.status, b.status),
    ):
        if not left or not right:
            limitations.append(f"{label} یکی از فایل‌ها موجود نیست.")
    if Decimal(a.gross_amount) != Decimal(b.gross_amount):
        differences.append("مبلغ کل")
    if a.tax_amount is None or b.tax_amount is None:
        limitations.append("مالیات یکی از فایل‌ها موجود نیست؛ مالیات تطبیق نشد.")
    elif Decimal(a.tax_amount) != Decimal(b.tax_amount):
        differences.append("مالیات")
    if a.issue_date != b.issue_date:
        differences.append("تاریخ")
    if a.party_id and b.party_id:
        if identifier(a.party_id) != identifier(b.party_id):
            differences.append("شناسه طرف معامله")
    elif a.party_name and b.party_name:
        if normalize_text(a.party_name) != normalize_text(b.party_name):
            differences.append("طرف معامله")
        limitations.append("شناسه طرف معامله کامل نیست؛ نام مقایسه شد.")
    else:
        limitations.append("طرف معامله یکی از فایل‌ها موجود نیست؛ طرف معامله تطبیق نشد.")
    return differences, limitations


def compare_invoices(
    internal: list[InvoiceSnapshot], portal: list[InvoiceSnapshot]
) -> list[ComparisonItem]:
    all_items = internal + portal
    referenced = {identifier(i.reference_tax_id) for i in all_items if i.reference_tax_id}
    internal_ids = Counter(identifier(i.tax_id) for i in internal if i.tax_id)
    portal_ids = Counter(identifier(i.tax_id) for i in portal if i.tax_id)

    # Duplicate business keys cannot be resolved by amount or file order.
    def business_key(i: InvoiceSnapshot) -> tuple[str, str, str]:
        return identifier(i.invoice_no), party_key(i), i.issue_date.isoformat()

    internal_keys = Counter(business_key(i) for i in internal if i.invoice_no and party_key(i))
    portal_keys = Counter(business_key(i) for i in portal if i.invoice_no and party_key(i))

    results: list[ComparisonItem] = []
    safe_internal: list[InvoiceSnapshot] = []
    safe_portal: list[InvoiceSnapshot] = []
    for side, source, ids, keys, safe in (
        ("internal", internal, internal_ids, internal_keys, safe_internal),
        ("portal", portal, portal_ids, portal_keys, safe_portal),
    ):
        for item in source:
            subject = normalize_text(normalize_digits(item.subject))
            state = normalize_text(item.status)
            reason = ""
            if item.import_limitations:
                reason = "؛ ".join(item.import_limitations)
            elif (item.tax_id and ids[identifier(item.tax_id)] > 1) or (
                item.invoice_no and party_key(item) and keys[business_key(item)] > 1
            ):
                reason = "شناسه یا کلید فاکتور در فایل تکراری است."
            elif (
                subject not in {"", "1", "اصلی", "original"}
                or item.reference_tax_id
                or identifier(item.tax_id) in referenced
            ):
                reason = "زنجیره اصلاح، ابطال یا برگشت نیازمند بررسی است."
            elif state not in {
                "",
                "تایید شده",
                "تأیید شده",
                "تایید سیستمی",
                "تأیید سیستمی",
                "در انتظار واکنش",
                "عدم نیاز به واکنش",
                "approved",
                "systemic approved",
                "awaiting reaction",
                "no need reaction",
                "صادرشده",
            }:
                reason = "وضعیت صورتحساب نیازمند بررسی است."
            if reason:
                results.append(
                    ComparisonItem(
                        status="review",
                        reason=reason,
                        internal=item if side == "internal" else None,
                        portal=item if side == "portal" else None,
                    )
                )
            else:
                safe.append(item)

    review_items = [r.internal or r.portal for r in results]
    review_ids = {identifier(i.tax_id) for i in review_items if i and i.tax_id}
    review_keys = {business_key(i) for i in review_items if i and i.invoice_no and party_key(i)}
    for side, safe in (("internal", safe_internal), ("portal", safe_portal)):
        retained = []
        for item in safe:
            if (item.tax_id and identifier(item.tax_id) in review_ids) or (
                item.invoice_no and party_key(item) and business_key(item) in review_keys
            ):
                results.append(
                    ComparisonItem(
                        status="review",
                        reason="فاکتور متناظر تکراری یا نیازمند بررسی است.",
                        internal=item if side == "internal" else None,
                        portal=item if side == "portal" else None,
                    )
                )
            else:
                retained.append(item)
        safe[:] = retained

    tax_index = {identifier(i.tax_id): i for i in safe_portal if i.tax_id}
    business_index: dict[tuple[str, str, str], list[InvoiceSnapshot]] = defaultdict(list)
    for item in safe_portal:
        if item.invoice_no and party_key(item):
            business_index[business_key(item)].append(item)
    used: set[object] = set()
    # Reserve all exact ID matches before proposing any fallback matches.
    exact_ids = {identifier(i.tax_id) for i in safe_internal if i.tax_id}
    for item in safe_internal:
        match = tax_index.get(identifier(item.tax_id)) if item.tax_id else None
        status: MatchStatus = "matched"
        if match is None and item.invoice_no and party_key(item):
            candidates = [
                p
                for p in business_index.get(business_key(item), [])
                if p.row_id not in used
                and identifier(p.tax_id) not in exact_ids
                and not (item.tax_id and p.tax_id)
            ]
            if len(candidates) == 1:
                match = candidates[0]
                status = "suggested"
        if match is None:
            results.append(ComparisonItem(status="internal_only", internal=item))
            continue
        used.add(match.row_id)
        differences, limitations = comparison_fields(item, match)
        results.append(
            ComparisonItem(
                status="difference" if differences and status == "matched" else status,
                internal=item,
                portal=match,
                differences=differences,
                limitations=limitations,
                reason="شماره فاکتور، طرف معامله و تاریخ مشابه‌اند؛ تأیید لازم است."
                if status == "suggested"
                else "",
            )
        )
    results.extend(
        ComparisonItem(status="portal_only", portal=p) for p in safe_portal if p.row_id not in used
    )
    return results
