"""Explicit, durable declarations; no completeness inferred from observed rows."""

from datetime import date
from ..infrastructure.financial import digest

KINDS = ("ledger", "bank", "sales_invoices", "purchase_invoices", "settlements")
LABELS = dict(zip(KINDS, ("دفتر", "بانک", "فاکتور فروش", "فاکتور خرید", "تسویه‌ها")))


def requirements(rows, period, previous):
    present = {r.kind for r in rows}
    questions = []

    def add(key, text, choices):
        questions.append((key, text, tuple(choices)))

    for p in [period] + ([previous] if previous else []):
        for kind in KINDS:
            if kind in present:
                add(
                    "coverage|" + kind + "|" + p.id,
                    f"پوشش {LABELS[kind]} از {p.starts_on} تا {p.ends_on} چگونه است؟",
                    ("declared_complete", "partial", "unknown"),
                )
        if "ledger" in present:
            add(
                "income_tax|" + p.id,
                f"مالیات سود دوره {p.starts_on} تا {p.ends_on} در دفتر ثبت شده یا صفر است؟",
                ("recognized", "zero_confirmed", "unknown"),
            )
            add(
                "cogs|" + p.id,
                f"بهای تمام‌شده دوره {p.starts_on} تا {p.ends_on} ثبت شده یا لازم نیست؟",
                ("recognized", "not_required", "unknown"),
            )
    if "ledger" in present:
        add(
            "ledger_opening_complete",
            "مانده‌های افتتاحیه دفتر برای حساب‌های موجود کامل هستند؟",
            ("affirmed", "unknown"),
        )
    if present & {"sales_invoices", "purchase_invoices"}:
        add(
            "invoice_openings_included",
            "تمام فاکتورهای باز ابتدای دوره در داده‌ها وجود دارند؟",
            ("affirmed", "unknown"),
        )
        if "settlements" in present:
            add(
                "settlements_complete",
                "تاریخچه تسویه فاکتورهای موجود تا تاریخ گزارش کامل است؟",
                ("affirmed", "unknown"),
            )
        if "ledger" in present:
            add(
                "comparable_parties",
                "شناسه طرف حساب و دامنه تجاری دفتر و فاکتورها یکسان است؟",
                ("affirmed", "unknown"),
            )
    bank = [r for r in rows if r.kind == "bank" and r.state == "valid"]
    labels = sorted(
        {r.sheet for r in bank}
        | {str(r.values["bank_account"]) for r in bank if r.values.get("bank_account")}
        | {
            str(r.values["account"])
            for r in rows
            if r.kind == "ledger"
            and r.values.get("role") == "bank"
            and r.values.get("account")
        }
        | {
            str(r.values["source_role"])
            for r in rows
            if r.kind == "ledger"
            and r.values.get("role") == "bank"
            and r.values.get("source_role")
        }
    )
    groups = sorted({r.file_id + ":" + r.sheet for r in bank})
    for group in groups:
        rs = [r for r in bank if r.file_id + ":" + r.sheet == group]
        token = digest(group)[:20]
        source_label = " · ".join(x for x in (rs[0].source_name, rs[0].sheet) if x)
        account_hints = sorted(
            {str(r.values["bank_account"]) for r in rs if r.values.get("bank_account")}
        )
        if len(account_hints) > 1:
            # One binding cannot safely identify several source accounts. A new
            # per-account source is required; choosing one must not merge them.
            continue
        if len(account_hints) == 1:
            source_label += " · " + account_hints[0]
        add(
            "binding|" + token,
            "این شیت بانک متعلق به کدام حساب است؟ " + source_label,
            (*labels, "unknown"),
        )
        for r in rs:
            if (
                r.values.get("row_type") == "opening"
                and r.values.get("balance") is not None
            ):
                add(
                    "anchor|" + token + "|row:" + str(r.row_number),
                    f"مانده {r.values['balance']} در {r.values['date']} برای {source_label} مربوط به کدام لحظه است؟",
                    ("start_of_day", "end_of_day", "unknown"),
                )
    if bank:
        add(
            "bank_accounts_complete",
            "تمام حساب‌های بانکی مشمول مانده نقد در شیت‌های انتخاب‌شده حضور دارند؟",
            ("affirmed", "unknown"),
        )
    earliest = min(
        period.starts_on, previous.starts_on if previous else period.starts_on
    )
    for kind in ("ledger", "bank"):
        openings = [
            date.fromisoformat(r.values["date"])
            for r in rows
            if r.kind == kind
            and r.state == "valid"
            and r.values.get("date")
            and (
                r.values.get("row_type") == "opening"
                or r.values.get("entry_type") == "opening"
            )
        ]
        if openings and min(openings) < earliest:
            start = str(min(openings))
            end = str(earliest)
            add(
                "history|" + kind + "|" + start + "|" + end,
                f"پوشش {LABELS[kind]} از {start} تا {end} کامل است؟",
                ("declared_complete", "partial", "unknown"),
            )
    invoice_dates = [
        date.fromisoformat(r.values["issued_on"])
        for r in rows
        if r.kind in ("sales_invoices", "purchase_invoices")
        and r.state == "valid"
        and r.values.get("issued_on")
        and r.values["issued_on"] <= str(period.cutoff)
    ]
    if "settlements" in present and invoice_dates and min(invoice_dates) < earliest:
        start = str(min(invoice_dates))
        end = str(earliest)
        add(
            "history|settlements|" + start + "|" + end,
            f"تاریخ و مبلغ تمام تسویه‌های فاکتورها از {start} تا {end} کامل است؟",
            ("declared_complete", "partial", "unknown"),
        )
    return questions


def declarations(rows, period, previous, answers, actors=None):
    actors = actors or {}
    result = {
        "coverage": {},
        "income_tax": {},
        "cogs": {},
        "bank_bindings": {},
        "bank_anchors": {},
    }
    for p in [period] + ([previous] if previous else []):
        for kind in KINDS:
            value = answers.get("coverage|" + kind + "|" + p.id, "unknown")
            result["coverage"].setdefault(kind, []).append(
                {
                    "state": "complete" if value == "declared_complete" else value,
                    "provenance": "user_declaration"
                    if value != "unknown"
                    else "unknown",
                    "scope_key": kind,
                    "actor_id": actors.get("coverage|" + kind + "|" + p.id),
                    "starts_on": str(p.starts_on),
                    "ends_on": str(p.ends_on),
                }
            )
        for kind in ("income_tax", "cogs"):
            result[kind][p.id] = answers.get(kind + "|" + p.id, "unknown")
    for key in (
        "ledger_opening_complete",
        "invoice_openings_included",
        "settlements_complete",
        "comparable_parties",
    ):
        result[key] = answers.get(key) == "affirmed"
    for key, value in answers.items():
        if key.startswith("history|"):
            _, kind, start, end = key.split("|")
            result["coverage"].setdefault(kind, []).append(
                {
                    "state": "complete" if value == "declared_complete" else value,
                    "provenance": "user_declaration",
                    "scope_key": kind,
                    "actor_id": actors.get(key),
                    "starts_on": start,
                    "ends_on": end,
                }
            )
    bank = [r for r in rows if r.kind == "bank" and r.state == "valid"]
    conflicted = set()
    for group in sorted({r.file_id + ":" + r.sheet for r in bank}):
        source_accounts = {
            str(r.values["bank_account"])
            for r in bank
            if r.file_id + ":" + r.sheet == group and r.values.get("bank_account")
        }
        if len(source_accounts) > 1:
            continue
        token = digest(group)[:20]
        binding = answers.get("binding|" + token, "unknown")
        if binding == "unknown" or binding in conflicted:
            continue
        result["bank_bindings"][group] = binding
        candidates = []
        for r in bank:
            if r.file_id + ":" + r.sheet != group:
                continue
            cutoff = answers.get(
                "anchor|" + token + "|row:" + str(r.row_number),
                answers.get("anchor|" + token + "|" + r.normalized_id, "unknown"),
            )
            if cutoff != "unknown":
                candidates.append(
                    {
                        "date": r.values["date"],
                        "balance": r.values["balance"],
                        "cutoff": cutoff,
                    }
                )
        # Multiple opening anchors must agree, otherwise leave the account unavailable.
        for candidate in candidates:
            old = result["bank_anchors"].get(binding)
            if old and old != candidate:
                conflicted.add(binding)
                result["bank_anchors"].pop(binding, None)
                break
            result["bank_anchors"][binding] = candidate
    if answers.get("bank_accounts_complete") == "affirmed":
        result["bank_accounts"] = sorted(set(result["bank_bindings"].values()))
    # Adjacent explicit complete intervals form one complete span; never bridge a gap.
    from datetime import date, timedelta

    for kind, scopes in result["coverage"].items():
        merged = []
        for scope in sorted(scopes, key=lambda c: c["starts_on"]):
            if (
                merged
                and merged[-1]["state"] == scope["state"] == "complete"
                and date.fromisoformat(scope["starts_on"])
                <= date.fromisoformat(merged[-1]["ends_on"]) + timedelta(days=1)
            ):
                if merged[-1].get("actor_id") != scope.get("actor_id"):
                    merged[-1]["actor_id"] = None
                merged[-1]["ends_on"] = max(merged[-1]["ends_on"], scope["ends_on"])
            else:
                merged.append(dict(scope))
        result["coverage"][kind] = merged
    return result
