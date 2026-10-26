"""Deterministic, evidence-based interpretation into immutable staging, not a ledger."""

from __future__ import annotations
from decimal import Decimal, localcontext
import hashlib
import json

from .source_tables import Sheet, raw_value
from .normalization import (
    InvalidValue,
    money,
    financial_date,
    identifier,
    currency,
    text,
)
from .interpretation_types import Analysis, Question, CanonicalRow, InterpretedSheet
from .source_controls import check_groups
from .source_profiles import (
    PROFILES,
    MONEY,
    DATES,
    ROLES,
    header_mapping,
    candidates,
    header_key,
)


def fingerprint(value: object) -> str:
    return hashlib.sha256(
        json.dumps(
            value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
        ).encode()
    ).hexdigest()


def analyze(tables: list[Sheet], settings: dict) -> Analysis:
    result = Analysis([], [])
    for table in tables:
        nonempty = [
            r
            for r in table.rows
            if any(v is not None and str(v).strip() for v in r.values)
        ]
        if not nonempty:
            continue
        selected = settings.get("sheets", {}).get(table.name, {})
        header = None
        mapping = {}
        kinds = []
        for row in nonempty[:20]:
            found = header_mapping(row.values)
            options = candidates(found)
            if options or selected.get("header_row") == row.number:
                header, mapping, kinds = row, found, options
                break
        header = header or max(
            nonempty[:20], key=lambda r: len(header_mapping(r.values))
        )
        if selected.get("header_row"):
            header = next(
                (r for r in nonempty if r.number == selected["header_row"]), header
            )
            mapping = selected.get("mapping", {})
            kinds = candidates(mapping)
        width = max(len(r.values) for r in nonempty)
        preview = {
            "sheet_name": table.name,
            "header_row": header.number,
            "columns": [
                str(header.values[i] or "")[:256] if i < len(header.values) else ""
                for i in range(width)
            ],
            "header_candidates": [
                {
                    "row_number": r.number,
                    "columns": [
                        str(v if v is not None else "")[:256] for v in r.values
                    ],
                }
                for r in nonempty[:20]
            ],
            "sample_rows": [
                [(raw_value(v)[:256] if v is not None else None) for v in r.values]
                for r in nonempty
                if r.number > header.number
            ][:3],
            "mapping": [
                {"target_field": k, "source_column": str(v)} for k, v in mapping.items()
            ],
            "source_kinds": kinds,
        }
        result.previews.append(preview)
        if selected.get("source_kind") == "ignore":
            result.sheets.append(
                InterpretedSheet(
                    table.name,
                    header.number,
                    {},
                    "ignore",
                    None,
                    None,
                    "human",
                    [],
                    [
                        {
                            "key": "excluded_by_user",
                            "outcome": "unknown",
                            "evidence": {"reason": selected.get("reason", "")},
                        }
                    ],
                    True,
                    len(nonempty),
                )
            )
            continue
        kind = selected.get("source_kind")
        if not kind:
            if len(kinds) == 1:
                kind = kinds[0]
            elif len(kinds) == 2:
                label = header_key(table.name)
                direction = (
                    "sales"
                    if label in ("فروش", "sales")
                    else "purchase"
                    if label in ("خرید", "purchases", "purchase")
                    else None
                )
                kind = next(
                    (k for k in kinds if direction and k.startswith(direction)), None
                )
        if not kind:
            result.question = Question(
                "interpretation_kind" if kinds else "interpretation_mapping",
                table.name,
                "source_kind",
                f"نوع داده شیت «{table.name}» چیست؟"
                if kinds
                else f"ستون‌های شیت «{table.name}» نیاز به نگاشت دارند.",
                tuple(kinds),
            )
            return result
        if (
            kind not in PROFILES
            or not set(PROFILES[kind][0]) <= mapping.keys()
            or any(
                not isinstance(v, int) or not 1 <= v <= width for v in mapping.values()
            )
            or len(set(mapping.values())) != len(mapping)
        ):
            result.question = Question(
                "interpretation_mapping",
                table.name,
                "mapping",
                f"نگاشت ستون‌های شیت «{table.name}» را اصلاح کنید.",
                (),
            )
            return result
        if kind == "bank" and not (
            "amount" in mapping or {"deposit", "withdrawal"} <= mapping.keys()
        ):
            result.question = Question(
                "interpretation_mapping",
                table.name,
                "mapping",
                "ستون مبلغ یا هر دو ستون واریز و برداشت لازم است.",
                (),
            )
            return result
        if selected.get("header_row") and not any(
            r.number == selected["header_row"] for r in nonempty
        ):
            result.question = Question(
                "interpretation_mapping",
                table.name,
                "mapping",
                "ردیف سربرگ انتخاب‌شده در فایل موجود نیست.",
                (),
            )
            return result
        unit = selected.get("unit")
        if "currency" not in mapping and not unit:
            header_units = {
                currency(token)
                for column in mapping.values()
                for token in str(
                    header.values[column - 1] if column <= len(header.values) else ""
                )
                .replace("(", " ")
                .replace(")", " ")
                .split()
            }
            header_units.discard(None)
            declarations = {
                currency(text(v).split(":")[-1].strip())
                for r in nonempty
                if r.number < header.number
                for v in r.values
            }
            declarations.discard(None)
            declarations |= header_units
            if len(declarations) == 1:
                unit = declarations.pop()
            else:
                result.question = Question(
                    "interpretation_unit",
                    table.name,
                    "unit",
                    f"واحد مبالغ شیت «{table.name}» چیست؟",
                    ("IRR", "IRT"),
                )
                return result
        if (
            "currency" in mapping
            and not unit
            and any(
                len(r.values) < mapping["currency"]
                or r.values[mapping["currency"] - 1] is None
                or not str(r.values[mapping["currency"] - 1]).strip()
                for r in nonempty
                if r.number > header.number
            )
        ):
            result.question = Question(
                "interpretation_unit",
                table.name,
                "unit",
                f"واحد ردیف‌های بدون واحد در شیت «{table.name}» چیست؟",
                ("IRR", "IRT"),
            )
            return result
        rows = []
        for row in nonempty:
            if row.number <= header.number:
                continue
            raw = [raw_value(v) for v in row.values]
            values = {}
            errors = []

            def cell(name):
                index = mapping.get(name)
                return (
                    row.values[index - 1]
                    if index and index <= len(row.values)
                    else None
                )

            actual_unit = (
                currency(cell("currency"))
                if cell("currency") is not None and str(cell("currency")).strip()
                else unit
            )
            # Missing per-row units cannot silently inherit a neighboring row.
            if not actual_unit:
                errors.append(
                    "unsupported_unit" if cell("currency") else "missing_unit"
                )
            for target, column in mapping.items():
                if target == "currency":
                    continue
                value = cell(target)
                if column in row.formulas:
                    errors.append("formula_not_evaluated")
                    values[target] = None
                    continue
                required = target in PROFILES[kind][0]
                if value is None or not str(value).strip():
                    values[target] = None
                    if required:
                        errors.append("missing_" + target)
                    continue
                try:
                    if target in MONEY:
                        values[target] = money(value, actual_unit or "")
                        if (
                            target not in ("amount", "balance")
                            and Decimal(values[target]) < 0
                        ):
                            raise InvalidValue("negative_" + target)
                    elif target in DATES:
                        values[target] = financial_date(value, selected.get("calendar"))
                    elif target == "confirmed":
                        if text(value).lower() not in (
                            "true",
                            "false",
                            "1",
                            "0",
                            "بله",
                            "خیر",
                        ):
                            raise InvalidValue("invalid_boolean")
                        values[target] = text(value).lower() in ("true", "1", "بله")
                    else:
                        values[target] = identifier(value)
                except InvalidValue as error:
                    errors.append(str(error))
                    values[target] = None
            if kind == "bank":
                if "deposit" in mapping and "withdrawal" in mapping:
                    deposit, withdrawal = (
                        values.get("deposit"),
                        values.get("withdrawal"),
                    )
                    if deposit is None and withdrawal is None:
                        errors.append("missing_amount")
                    elif any(
                        e in errors
                        for e in ("invalid_money", "unsupported_unit", "money_range")
                    ):
                        pass
                    else:
                        with localcontext() as ctx:
                            ctx.prec = 96
                            incoming, outgoing = (
                                Decimal(deposit or "0"),
                                Decimal(withdrawal or "0"),
                            )
                            if incoming and outgoing:
                                errors.append("two_sided_bank_movement")
                            derived = format(incoming - outgoing, "f")
                            if values.get("amount") is not None and Decimal(
                                values["amount"]
                            ) != Decimal(derived):
                                errors.append("conflicting_bank_amount")
                            values["amount"] = derived
                if values.get("amount") is None:
                    errors.append("missing_amount")
                if values.get("row_type") not in (None, "opening", "movement"):
                    errors.append("unknown_bank_row_type")
                if (
                    values.get("row_type") == "opening"
                    and Decimal(values.get("amount") or "0") != 0
                ):
                    errors.append("opening_has_movement")
            if kind == "ledger":
                debit, credit = (
                    Decimal(values.get("debit") or "0"),
                    Decimal(values.get("credit") or "0"),
                )
                if debit and credit:
                    errors.append("two_sided_journal_line")
                source_role = values.get("role")
                account = values.get("account")
                override = selected.get("account_roles", {}).get(account)
                automatic = selected.get("model_account_roles", {}).get(account)
                role = (
                    override
                    or automatic
                    or {
                        "operating_expense": "expense",
                        "payroll_expense": "expense",
                        "bank_fee": "expense",
                    }.get(source_role, source_role)
                )
                if role and role.startswith("bank_"):
                    role = "bank"
                if account and role not in ROLES:
                    result.question = Question(
                        "interpretation_account_role",
                        table.name,
                        "account_role",
                        f"نقش حساب «{account}» در شیت «{table.name}» چیست؟",
                        tuple(sorted(ROLES - {"calibration_only"})),
                        account,
                    )
                    return result
                values["source_role"] = source_role
                values["role"] = role
                values["role_provenance"] = (
                    "user_declaration"
                    if override
                    else "validated_policy"
                    if automatic
                    else "explicit_source_field"
                )
                if automatic and not override:
                    values["role_evidence"] = {
                        "source_row": row.number,
                        "account_name": cell("account_name"),
                        **selected["model_proposal"],
                    }
                    values["role_controls_passed"] = False
            if kind in (
                "sales_invoices",
                "purchase_invoices",
                "moadian_sales",
                "moadian_purchases",
            ):
                if (
                    values.get("vat") is not None
                    and values.get("gross") is not None
                    and Decimal(values["vat"]) > Decimal(values["gross"])
                ):
                    errors.append("vat_exceeds_gross")
                if (
                    values.get("due_on")
                    and values.get("issued_on")
                    and values["due_on"] < values["issued_on"]
                ):
                    errors.append("due_before_issue")
            if kind.startswith("moadian_") and values.get("kind") not in (
                "original",
                "corrective",
                "cancellation",
                "return",
            ):
                errors.append("unknown_tax_document_kind")
            if kind == "settlements" and values.get("direction") not in (
                "receipt",
                "payment",
            ):
                errors.append("invalid_direction")
            if kind == "planned_payments" and Decimal(
                values.get("paid_as_of") or "0"
            ) > Decimal(values.get("total_obligation") or "0"):
                errors.append("paid_exceeds_obligation")
            rows.append(
                CanonicalRow(row.number, raw, values, list(dict.fromkeys(errors)))
            )
            rows[-1].values["original_unit"] = actual_unit or (
                text(cell("currency")) or None
            )
            rows[-1].values["unit"] = "IRR" if actual_unit else None
        controls = check_groups(kind, rows, mapping, header.number)
        if kind == "ledger" and all(
            c["outcome"] == "passed" for c in controls if c["key"] != "coverage"
        ):
            for row in rows:
                if row.values.get("role_provenance") == "validated_policy":
                    row.values["role_controls_passed"] = not row.errors
        if selected.get("model_proposal"):
            controls.append(
                {
                    "key": "model_proposal_validation",
                    "outcome": "passed",
                    "evidence": selected["model_proposal"],
                }
            )
        for row in rows:
            row.errors = list(dict.fromkeys(row.errors))
            row.state = "rejected" if row.errors else "valid"
            semantic = {
                k: v
                for k, v in row.values.items()
                if k
                not in (
                    "row_id",
                    "original_unit",
                    "description",
                    "source_role",
                    "role_provenance",
                    "role_evidence",
                    "role_controls_passed",
                )
            }
            row.fingerprint = fingerprint(
                {
                    "kind": kind,
                    "sheet_scope": None,
                    "values": semantic,
                }
            )
            keys = [
                row.values.get(k)
                for k in (
                    {
                        "ledger": ["entry_id", "account", "party_id", "date"],
                        "bank": ["bank_account", "reference", "date"],
                        "sales_invoices": ["invoice_id", "party_id"],
                        "purchase_invoices": ["invoice_id", "party_id"],
                        "moadian_sales": ["tax_id"],
                        "moadian_purchases": ["tax_id"],
                        "settlements": ["event_id"],
                        "receipt_history": ["event_id"],
                        "planned_payments": ["plan_id"],
                    }[kind]
                )
            ]
            row.logical_key = (
                fingerprint([kind, keys])
                if all(keys) and kind not in ("ledger", "bank")
                else None
            )
        result.sheets.append(
            InterpretedSheet(
                table.name,
                header.number,
                mapping,
                kind,
                unit,
                selected.get("calendar"),
                "human"
                if "mapping" in selected and not selected.get("model_proposal")
                else "validated_automatic",
                rows,
                controls,
            )
        )
    return result
