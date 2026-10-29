"""Ledger structure, account paths and posting controls; never source-code guesses."""

from __future__ import annotations
from collections import defaultdict
from dataclasses import dataclass, field
from decimal import Decimal, localcontext
from .normalization import InvalidValue, identifier, money, financial_date, text
from .source_profiles import header_key, header_mapping
from .source_tables import Sheet, Row

POLICY = "ledger-understanding-v1"
ROLE_NAMES = {
    "bank": ("بانکها", "بانکهای ریالی", "موجودی بانک", "بانک"),
    "cash": ("صندوق", "موجودی صندوق"),
    "other_ar": ("بدهکاران", "سایر دریافتنی ها", "سایر حسابهای دریافتنی"),
    "trade_ar": ("حسابهای دریافتنی تجاری", "دریافتنی تجاری"),
    "trade_ap": ("حسابهای پرداختنی تجاری", "پرداختنی تجاری"),
    "other_liability": (
        "بستانکاران",
        "سایر حسابهای پرداختنی",
        "سایر پرداختنی",
        "اسناد پرداختنی",
        "پیش دریافت",
    ),
    "payroll_payable": ("حقوق پرداختنی", "بیمه پرداختنی"),
    "tax_payable": ("مالیات عملکرد پرداختنی", "مالیات پرداختنی"),
    "vat_receivable": ("اعتبار ارزش افزوده خرید", "اعتبار ارزش افزوده"),
    "vat_payable": ("مالیات ارزش افزوده فروش", "مالیات ارزش افزوده"),
    "inventory": ("موجودی مواد و کالا", "موجودی کالا"),
    "fixed_asset": ("اموال و اثاثیه", "دارایی ثابت"),
    "other_asset": ("پیش پرداخت رهن", "سپرده های نقدی بانکی"),
    "capital": ("سرمایه",),
    "other_equity": (
        "تراز افتتاحیه",
        "سود و زیان انباشته",
        "سود وزیان جاری",
        "سود و زیان جاری",
    ),
    "revenue": ("فروش", "درآمد فروش"),
    "other_income": ("سایر درآمدها", "سود بانکی"),
    "expense": (
        "هزینه های عمومی و اداری",
        "اجاره",
        "هزینه حقوق و دستمزد",
        "حقوق و دستمزد",
        "هزینه تولید",
        "سایر هزینه ها",
    ),
    "purchases": ("خرید",),
    "cogs": ("بهای تمام شده کالای فروش رفته",),
    "income_tax_expense": ("هزینه مالیات عملکرد", "هزینه مالیات بر درآمد"),
}
ROLE_INDEX = {
    header_key(label): role for role, labels in ROLE_NAMES.items() for label in labels
}


def named_role(labels: list[str]) -> str | None:
    # A specific subaccount such as payroll overrides a broad payable parent.
    return next(
        (
            ROLE_INDEX[header_key(label)]
            for label in reversed(labels)
            if header_key(label) in ROLE_INDEX
        ),
        None,
    )


def numeric(value) -> Decimal:
    return Decimal(money(value if text(value) else "0", "IRR"))


@dataclass
class LedgerLayout:
    table: Sheet
    header: Row
    mapping: dict[str, int]
    records: list[Row]
    structural: list[tuple[Row, str]]
    derived: dict[str, dict]
    controls: list[dict] = field(default_factory=list)


def ledger_layout(table: Sheet) -> LedgerLayout | None:
    with localcontext() as context:
        context.prec = 96
        return _ledger_layout(table)


def _ledger_layout(table: Sheet) -> LedgerLayout | None:
    for header in table.rows[:100]:
        if header.formulas:
            continue
        mapping = header_mapping(header.values)
        if not {"entry_id", "date", "account", "debit", "credit"} <= mapping.keys():
            continue
        keys = [header_key(value) for value in header.values]

        def unique(labels):
            matches = [
                i + 1
                for i, key in enumerate(keys)
                if key in {header_key(label) for label in labels}
            ]
            return matches[0] if len(matches) == 1 else None

        names = [
            unique(labels)
            for labels in [("نام کل",), ("نام معین",), ("نام تفصیلی", "نام تفضیلی")]
        ]
        code_columns = [
            mapping["account"],
            unique(("کد معین",)),
            unique(("کد تفصیلی", "کد تفضیلی")),
        ]
        name_columns = [column for column in names if column]
        if not name_columns and mapping.get("account_name"):
            name_columns = [mapping["account_name"]]
        if not name_columns:
            continue

        def cell(row, column):
            return (
                row.values[column - 1] if column and len(row.values) >= column else None
            )

        records, structural = [], []
        derived = {}
        totals = []
        for row in table.rows:
            if row.number <= header.number or not any(
                text(value) for value in row.values
            ):
                continue
            ids = [
                text(cell(row, mapping[key])) for key in ("entry_id", "date", "account")
            ]
            if not any(ids) and not row.formulas:
                try:
                    debit, credit = (
                        numeric(cell(row, mapping["debit"])),
                        numeric(cell(row, mapping["credit"])),
                    )
                except InvalidValue:
                    records.append(row)
                    continue
                if debit == credit == 0:
                    structural.append((row, "annotation_without_posting"))
                    continue
                # Only a fully reconciled footer can be excluded as a total.
                if row.number == max(
                    r.number for r in table.rows if any(text(v) for v in r.values)
                ):
                    totals.append((row, debit, credit))
                    continue
            if row.values == header.values and not row.formulas:
                structural.append((row, "repeated_header"))
                continue
            records.append(row)
            labels = [
                text(cell(row, column))
                for column in name_columns
                if text(cell(row, column))
            ]
            codes = [
                text(cell(row, column))
                for column in code_columns
                if text(cell(row, column))
            ]
            try:
                date_value = text(cell(row, mapping["date"])).replace(".", "/")
                date_iso = financial_date(date_value)
                for key in ("debit", "credit"):
                    if mapping[key] in row.formulas:
                        raise InvalidValue("formula_not_evaluated")
                    numeric(cell(row, mapping[key]))
                account = "/".join(codes)
                # Flat exports identify distinct parties by their source account label.
                if not any(code_columns[1:]) and len(labels):
                    account += ":" + header_key(labels[-1])
                derived[str(row.number)] = {
                    "account": identifier(account),
                    "date": date_value,
                    "date_iso": date_iso,
                    "account_name": " / ".join(labels),
                    "account_source_code": codes[0] if codes else None,
                    "account_leaf_name": labels[-1] if labels else None,
                    "account_role": named_role(labels),
                    "entry_type": "regular",
                    "labels": labels,
                }
            except InvalidValue:
                pass
        try:
            debit = sum(
                (numeric(cell(row, mapping["debit"])) for row in records), Decimal(0)
            )
            credit = sum(
                (numeric(cell(row, mapping["credit"])) for row in records), Decimal(0)
            )
        except InvalidValue:
            debit = credit = None
        for row, stated_debit, stated_credit in totals:
            if debit is not None and debit == stated_debit and credit == stated_credit:
                structural.append((row, "reconciled_footer"))
            else:
                records.append(row)
        roles_by_account = defaultdict(set)
        for plan in derived.values():
            if plan["account_role"]:
                roles_by_account[plan["account"]].add(plan["account_role"])
        for plan in derived.values():
            if len(roles_by_account[plan["account"]]) > 1:
                plan["source_account_conflict"] = True
        controls = [
            {
                "key": "ledger_structure",
                "outcome": "passed" if len(derived) == len(records) else "failed",
                "evidence": {
                    "policy": POLICY,
                    "header_row": header.number,
                    "account_code_columns": [c for c in code_columns if c],
                    "account_name_columns": name_columns,
                    "debit": str(debit),
                    "credit": str(credit),
                    "structural_rows": [
                        {"row": row.number, "reason": reason}
                        for row, reason in structural
                    ],
                },
            }
        ]
        classify_entries(records, mapping, derived)
        return LedgerLayout(
            table, header, mapping, records, structural, derived, controls
        )
    return None


def classify_entries(records, mapping, derived):
    for plan in derived.values():
        plan["entry_type"] = "regular"
        for key in (
            "entry_evidence",
            "periodic_inventory_transfer",
            "income_tax_charge",
        ):
            plan.pop(key, None)
    groups = defaultdict(list)
    for row in records:
        if str(row.number) in derived:
            groups[text(row.values[mapping["entry_id"] - 1])].append(row)
    balances = defaultdict(Decimal)
    nominal = {
        "revenue",
        "other_income",
        "expense",
        "cogs",
        "purchases",
        "income_tax_expense",
    }
    # Physical exports can be unsorted; date order is semantic, document IDs are not numeric sequences.
    ordered = sorted(
        groups.values(),
        key=lambda rs: (
            derived[str(rs[0].number)]["date_iso"],
            min(r.number for r in rs),
        ),
    )
    for group in ordered:
        plans = [derived[str(row.number)] for row in group]
        delta = defaultdict(Decimal)
        for row, plan in zip(group, plans):
            delta[plan["account"]] += numeric(
                row.values[mapping["debit"] - 1]
            ) - numeric(row.values[mapping["credit"] - 1])
        balanced = sum(delta.values(), Decimal(0)) == 0 and len(group) >= 2
        roles = {plan["account"]: plan["account_role"] for plan in plans}
        labels = [label for plan in plans for label in plan["labels"]]
        if (
            balanced
            and not balances
            and any(
                header_key(label) == header_key("تراز افتتاحیه") for label in labels
            )
        ):
            for plan in plans:
                plan["entry_type"] = "opening"
                plan["entry_evidence"] = "balanced_explicit_opening_label"
        elif (
            balanced
            and balances
            and any(plan["account_role"] == "capital" for plan in plans)
            and all(balances[key] + delta.get(key, Decimal(0)) == 0 for key in balances)
            and all(
                balances.get(key, Decimal(0)) + value == 0
                for key, value in delta.items()
            )
        ):
            for plan in plans:
                plan["entry_type"] = "closing_transfer"
                plan["entry_evidence"] = "complete_reversal_of_source_account_balances"
        elif (
            balanced
            and any(role in nominal for role in roles.values())
            and all(
                balances[account] + value == 0
                for account, value in delta.items()
                if roles.get(account) in nominal
            )
            and all(
                roles.get(account) in nominal | {"inventory", "other_equity"}
                for account in delta
            )
        ):
            for plan in plans:
                plan["entry_type"] = (
                    "real_cogs_adjustment"
                    if plan["account_role"] == "inventory"
                    else "profit_loss_transfer"
                )
                plan["entry_evidence"] = "balanced_nominal_account_reversal"
                if plan["account_role"] == "inventory":
                    plan["periodic_inventory_transfer"] = True
        elif balanced and {plan["account_role"] for plan in plans} == {
            "other_equity",
            "tax_payable",
        }:
            profit = [
                row
                for row, plan in zip(group, plans)
                if any(
                    header_key(label)
                    in {header_key("سود وزیان جاری"), header_key("سود و زیان جاری")}
                    for label in plan["labels"]
                )
            ]
            retained = [
                plan
                for plan in plans
                if any(
                    header_key(label) == header_key("سود و زیان انباشته")
                    for label in plan["labels"]
                )
            ]
            if len(profit) == 1 and retained:
                profit_plan = derived[str(profit[0].number)]
                if (
                    balances[profit_plan["account"]] < 0
                    and delta[profit_plan["account"]]
                    == -balances[profit_plan["account"]]
                ):
                    for row, plan in zip(group, plans):
                        plan["entry_type"] = "real_adjustment"
                        plan["entry_evidence"] = "balanced_current_profit_allocation"
                        if (
                            plan["account_role"] == "tax_payable"
                            and numeric(row.values[mapping["credit"] - 1]) > 0
                            and numeric(row.values[mapping["debit"] - 1]) == 0
                        ):
                            plan["income_tax_charge"] = str(
                                numeric(row.values[mapping["credit"] - 1])
                            )
        for key, value in delta.items():
            balances[key] += value
