"""Electronic Legal Ledgers (دفاتر قانونی الکترونیک - روزنامه، کل و معین)

Key financial invariants:
- Both original journals and reversal journals appear in their own posting dates.
  A reversal in a later period must never hide the original entry from earlier dates.
- Journal ID, system sequence, and sequential daily document numbering are invariant
  to date-range filtering (`from_date` / `to_date`).
- Opening balance (prior to `from_date`), period turnover (within `[from_date, to_date]`),
  and closing balance (`opening + turnover`) are tracked separately per account group.
- Unmapped accounts or unparseable amounts are explicitly flagged (never silently dropped
  or coerced to zero).
- Management Excel and flat ledger upload draft Excel preserve exact string numbers
  (no float / JavaScript Number precision loss) and leading zeros in account codes.
"""

import io
from datetime import date
from decimal import Decimal, InvalidOperation, localcontext
from typing import Any

import jdatetime
import openpyxl
from openpyxl.styles import Font
from sqlalchemy import select
from sqlalchemy.orm import Session

from .accounting_models import Account, AccountHierarchy
from .money_type import aggregate_money, canonical_money
from .posting_models import NativeJournal


def _parse_decimal(raw: Any) -> Decimal | None:
    if raw is None or raw == "":
        return None
    try:
        val = Decimal(str(raw))
    except (InvalidOperation, ValueError):
        return None
    if not val.is_finite():
        return None
    return val


def _jalali_str(value: date) -> str:
    j = jdatetime.date.fromgregorian(date=value)
    return f"{j.year:04d}/{j.month:02d}/{j.day:02d}"


def _balance_nature(signed: Decimal | None) -> str:
    if signed is None:
        return "نامعلوم"
    if signed > 0:
        return "بدهکار"
    if signed < 0:
        return "بستانکار"
    return "بی‌حساب"


def _resolve_account_chain(
    acc_id: str,
    line: dict[str, Any],
    accounts: dict[str, Account],
    hierarchies: dict[str, AccountHierarchy],
) -> dict[str, Any]:
    acc = accounts.get(acc_id)
    if acc is None:
        return {
            "found": False,
            "acc": None,
            "h": None,
            "chain": [],
            "general": None,
            "subsidiary": None,
            "detail": None,
            "line_code": str(line.get("code") or acc_id),
            "line_name": str(line.get("name") or "حساب نامشخص"),
        }

    chain: list[tuple[Account, AccountHierarchy | None]] = []
    cursor: Account | None = acc
    seen: set[str] = set()
    while cursor is not None and cursor.id not in seen:
        seen.add(cursor.id)
        ch = hierarchies.get(cursor.id)
        chain.append((cursor, ch))
        if not ch or not ch.parent_id:
            break
        cursor = accounts.get(ch.parent_id)

    general_node = next(((a, h) for a, h in chain if h and h.level == "general"), None)
    subsidiary_node = next(((a, h) for a, h in chain if h and h.level == "subsidiary"), None)
    detail_node = next(((a, h) for a, h in chain if h and h.level == "detail"), None)
    return {
        "found": True,
        "acc": acc,
        "h": hierarchies.get(acc.id),
        "chain": chain,
        "general": general_node[0] if general_node else None,
        "subsidiary": subsidiary_node[0] if subsidiary_node else None,
        "detail": detail_node[0] if detail_node else None,
        "line_code": str(line.get("code") or acc.code),
        "line_name": str(line.get("name") or acc.name),
    }


def _group_for_level(
    acc_id: str,
    resolved: dict[str, Any],
    level: str,
    accounts: dict[str, Account],
    hierarchies: dict[str, AccountHierarchy],
) -> tuple[str, dict[str, Any]]:
    if not resolved["found"]:
        return f"missing:{acc_id}", {
            "account_id": acc_id,
            "code": resolved["line_code"],
            "name": resolved["line_name"],
            "nature": "unknown",
            "level": level,
            "mapping_status": "missing_account",
        }

    acc: Account = resolved["acc"]
    h: AccountHierarchy | None = resolved["h"]
    if level == "general":
        if h is None:
            return acc.id, {
                "account_id": acc.id,
                "code": acc.code,
                "name": acc.name,
                "nature": acc.nature,
                "level": "unclassified",
                "mapping_status": "unclassified",
            }
        target = resolved["general"]
        if target is not None:
            return target.id, {
                "account_id": target.id,
                "code": target.code,
                "name": target.name,
                "nature": target.nature,
                "level": "general",
                "mapping_status": "mapped",
            }
        # Fallback: highest non-group node in chain (or self)
        non_group = [a for a, ch in resolved["chain"] if not ch or ch.level != "group"]
        fallback = non_group[-1] if non_group else acc
        return fallback.id, {
            "account_id": fallback.id,
            "code": fallback.code,
            "name": fallback.name,
            "nature": fallback.nature,
            "level": (hierarchies.get(fallback.id).level if hierarchies.get(fallback.id) else "unclassified"),
            "mapping_status": "missing_general_parent",
        }

    # Subsidiary level
    if h is None:
        return acc.id, {
            "account_id": acc.id,
            "code": acc.code,
            "name": acc.name,
            "nature": acc.nature,
            "level": "unclassified",
            "mapping_status": "unclassified",
        }
    target = resolved["subsidiary"]
    if target is not None:
        target_h = hierarchies.get(target.id)
        parent_acc = accounts.get(target_h.parent_id) if target_h and target_h.parent_id else None
        return target.id, {
            "account_id": target.id,
            "code": target.code,
            "name": target.name,
            "nature": target.nature,
            "level": "subsidiary",
            "parent_code": parent_acc.code if parent_acc else None,
            "parent_name": parent_acc.name if parent_acc else None,
            "mapping_status": "mapped",
        }
    parent_acc = accounts.get(h.parent_id) if h.parent_id else None
    return acc.id, {
        "account_id": acc.id,
        "code": acc.code,
        "name": acc.name,
        "nature": acc.nature,
        "level": h.level,
        "parent_code": parent_acc.code if parent_acc else None,
        "parent_name": parent_acc.name if parent_acc else None,
        "mapping_status": "missing_subsidiary_parent",
    }


def _collect_ledger_data(
    db: Session,
    company: str,
    level: str = "general",
    from_date: date | None = None,
    to_date: date | None = None,
    include_turnover: bool = True,
    auto_daily_numbering: bool = True,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    accounts = {
        acc.id: acc
        for acc in db.scalars(select(Account).where(Account.company_id == company))
    }
    hierarchies = {
        h.account_id: h
        for h in db.scalars(select(AccountHierarchy).where(AccountHierarchy.company_id == company))
    }

    all_journals = list(
        db.scalars(
            select(NativeJournal)
            .where(NativeJournal.company_id == company)
            .order_by(NativeJournal.date.asc(), NativeJournal.sequence.asc(), NativeJournal.id.asc())
        )
    )

    # Sequential daily numbering across all posted dates of the company so date filters
    # never alter a journal's daily_doc_no or journal_sequence.
    all_unique_dates = sorted({j.date for j in all_journals})
    date_to_daily_no = {d: i + 1 for i, d in enumerate(all_unique_dates)}

    prior_journals = [j for j in all_journals if from_date and j.date < from_date]
    journals = [
        j
        for j in all_journals
        if (not from_date or j.date >= from_date) and (not to_date or j.date <= to_date)
    ]

    opening_by_group: dict[str, dict[str, Any]] = {}
    entries_by_group: dict[str, list[dict[str, Any]]] = {}
    group_meta: dict[str, dict[str, Any]] = {}
    chronological_rows: list[dict[str, Any]] = []
    unknown_amount_lines_count = 0

    with localcontext() as ctx:
        ctx.prec = 60

        for j in prior_journals:
            snapshot = j.snapshot or {}
            for line in snapshot.get("lines", []):
                acc_id = str(line.get("account_id") or "")
                resolved = _resolve_account_chain(acc_id, line, accounts, hierarchies)
                group_key, meta = _group_for_level(acc_id, resolved, level, accounts, hierarchies)
                group_meta.setdefault(group_key, meta)
                bucket = opening_by_group.setdefault(
                    group_key, {"debit": Decimal(0), "credit": Decimal(0), "unknown": False}
                )
                debit = _parse_decimal(line.get("debit"))
                credit = _parse_decimal(line.get("credit"))
                if debit is None or credit is None:
                    bucket["unknown"] = True
                    unknown_amount_lines_count += 1
                else:
                    bucket["debit"] += debit
                    bucket["credit"] += credit

        for j in journals:
            daily_no = date_to_daily_no[j.date] if auto_daily_numbering else j.sequence
            snapshot = j.snapshot or {}
            journal_desc = snapshot.get("description") or f"سند حسابداری {j.sequence}"

            for line in snapshot.get("lines", []):
                acc_id = str(line.get("account_id") or "")
                resolved = _resolve_account_chain(acc_id, line, accounts, hierarchies)
                group_key, meta = _group_for_level(acc_id, resolved, level, accounts, hierarchies)
                group_meta.setdefault(group_key, meta)

                debit = _parse_decimal(line.get("debit"))
                credit = _parse_decimal(line.get("credit"))
                amount_unknown = debit is None or credit is None
                if amount_unknown:
                    unknown_amount_lines_count += 1

                line_desc = line.get("description") or journal_desc
                general_acc = resolved["general"]
                subsidiary_acc = resolved["subsidiary"]
                detail_acc = resolved["detail"]

                row_record = {
                    "journal_id": j.id,
                    "date": j.date.isoformat(),
                    "jalali_date": _jalali_str(j.date),
                    "daily_doc_no": daily_no,
                    "journal_sequence": j.sequence,
                    "journal_number": snapshot.get("number"),
                    "is_reversal": bool(j.reversal_of),
                    "reversal_of": j.reversal_of,
                    "account_id": acc_id,
                    "account_code": resolved["line_code"],
                    "account_name": resolved["line_name"],
                    "general_code": general_acc.code if general_acc else (meta["code"] if level == "general" else ""),
                    "general_name": general_acc.name if general_acc else (meta["name"] if level == "general" else ""),
                    "subsidiary_code": subsidiary_acc.code if subsidiary_acc else (meta["code"] if level == "subsidiary" else ""),
                    "subsidiary_name": subsidiary_acc.name if subsidiary_acc else (meta["name"] if level == "subsidiary" else ""),
                    "detail_code": detail_acc.code if detail_acc else "",
                    "detail_name": detail_acc.name if detail_acc else "",
                    "description": line_desc,
                    "party_id": line.get("party_id") or "",
                    "raw_debit": debit,
                    "raw_credit": credit,
                    "amount_unknown": amount_unknown,
                    "mapping_status": meta["mapping_status"],
                }
                entries_by_group.setdefault(group_key, []).append(row_record)
                chronological_rows.append(row_record)

        ledger_items = []
        total_debit = Decimal(0)
        total_credit = Decimal(0)
        opening_total_debit = Decimal(0)
        opening_total_credit = Decimal(0)
        unmapped_accounts_count = 0

        for group_key, meta in sorted(group_meta.items(), key=lambda x: (x[1]["code"], x[1]["account_id"])):
            if meta["mapping_status"] != "mapped":
                unmapped_accounts_count += 1
            opening = opening_by_group.get(
                group_key, {"debit": Decimal(0), "credit": Decimal(0), "unknown": False}
            )
            entries = entries_by_group.get(group_key, [])
            opening_unknown = bool(opening["unknown"])
            opening_debit = opening["debit"]
            opening_credit = opening["credit"]
            opening_signed: Decimal | None = None if opening_unknown else (opening_debit - opening_credit)
            if not opening_unknown:
                opening_total_debit += opening_debit
                opening_total_credit += opening_credit

            running_balance: Decimal | None = opening_signed
            group_debit = Decimal(0)
            group_credit = Decimal(0)
            group_unknown = opening_unknown

            processed_entries = []
            for entry in entries:
                d = entry["raw_debit"]
                c = entry["raw_credit"]
                if d is None or c is None:
                    group_unknown = True
                    running_balance = None
                else:
                    group_debit += d
                    group_credit += c
                    if running_balance is not None:
                        running_balance += d - c

                processed_entries.append(
                    {
                        "journal_id": entry["journal_id"],
                        "date": entry["date"],
                        "daily_doc_no": entry["daily_doc_no"],
                        "journal_sequence": entry["journal_sequence"],
                        "journal_number": entry["journal_number"],
                        "is_reversal": entry["is_reversal"],
                        "reversal_of": entry["reversal_of"],
                        "account_code": entry["account_code"],
                        "account_name": entry["account_name"],
                        "general_code": entry["general_code"],
                        "general_name": entry["general_name"],
                        "subsidiary_code": entry["subsidiary_code"],
                        "subsidiary_name": entry["subsidiary_name"],
                        "detail_code": entry["detail_code"],
                        "detail_name": entry["detail_name"],
                        "description": entry["description"],
                        "party_id": entry["party_id"],
                        "debit": canonical_money(d) if d is not None else None,
                        "credit": canonical_money(c) if c is not None else None,
                        "balance": aggregate_money(abs(running_balance)) if running_balance is not None else None,
                        "balance_nature": _balance_nature(running_balance),
                        "amount_unknown": entry["amount_unknown"],
                    }
                )

            total_debit += group_debit
            total_credit += group_credit

            item = {
                "account": meta,
                "opening_debit": aggregate_money(opening_debit) if not opening_unknown else None,
                "opening_credit": aggregate_money(opening_credit) if not opening_unknown else None,
                "opening_balance": aggregate_money(abs(opening_signed)) if opening_signed is not None else None,
                "opening_nature": _balance_nature(opening_signed),
                "total_debit": aggregate_money(group_debit) if group_debit else "0",
                "total_credit": aggregate_money(group_credit) if group_credit else "0",
                "final_balance": aggregate_money(abs(running_balance)) if running_balance is not None else None,
                "final_nature": _balance_nature(running_balance),
                "has_unknown_amounts": group_unknown,
            }
            if include_turnover:
                item["entries"] = processed_entries

            ledger_items.append(item)

    payload = {
        "level": level,
        "from_date": from_date.isoformat() if from_date else None,
        "to_date": to_date.isoformat() if to_date else None,
        "include_turnover": include_turnover,
        "auto_daily_numbering": auto_daily_numbering,
        "hierarchy_basis": "current_account_hierarchy",
        "dates_count": len({j.date for j in journals}),
        "total_journals": len(journals),
        "opening_total_debit": aggregate_money(opening_total_debit) if opening_total_debit else "0",
        "opening_total_credit": aggregate_money(opening_total_credit) if opening_total_credit else "0",
        "total_debit": aggregate_money(total_debit) if total_debit else "0",
        "total_credit": aggregate_money(total_credit) if total_credit else "0",
        "unmapped_accounts_count": unmapped_accounts_count,
        "unknown_amount_lines_count": unknown_amount_lines_count,
        "items": ledger_items,
    }
    return payload, chronological_rows


def get_electronic_ledger(
    db: Session,
    company: str,
    level: str = "general",  # "general" (کل) or "subsidiary" (معین)
    from_date: date | None = None,
    to_date: date | None = None,
    include_turnover: bool = True,
    auto_daily_numbering: bool = True,
) -> dict[str, Any]:
    payload, _ = _collect_ledger_data(
        db,
        company,
        level=level,
        from_date=from_date,
        to_date=to_date,
        include_turnover=include_turnover,
        auto_daily_numbering=auto_daily_numbering,
    )
    return payload


def _write_text_row(sheet, row_idx: int, values: list[Any], *, bold: bool = False) -> None:
    for col_idx, val in enumerate(values, start=1):
        cell = sheet.cell(row=row_idx, column=col_idx)
        text_val = "" if val is None else str(val)
        cell.value = text_val
        cell.data_type = "s"
        cell.number_format = "@"
        if bold:
            cell.font = Font(bold=True)


def export_electronic_ledger_xlsx(
    db: Session,
    company: str,
    level: str = "general",
    from_date: date | None = None,
    to_date: date | None = None,
    include_turnover: bool = True,
    auto_daily_numbering: bool = True,
    export_mode: str = "management",  # "management" | "upload_draft"
) -> bytes:
    payload, chronological_rows = _collect_ledger_data(
        db,
        company,
        level=level,
        from_date=from_date,
        to_date=to_date,
        include_turnover=include_turnover,
        auto_daily_numbering=auto_daily_numbering,
    )
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.views.sheetView[0].rightToLeft = True

    if export_mode == "upload_draft":
        sheet.title = "پیش‌نویس دفاتر"
        headers = [
            "ردیف فایل",
            "شناسه سند",
            "شماره سند سیستم",
            "شماره روزانه",
            "تاریخ (شمسی)",
            "کد کل",
            "عنوان کل",
            "کد معین",
            "عنوان معین",
            "کد تفصیلی",
            "عنوان تفصیلی",
            "شرح",
            "بدهکار (ریال)",
            "بستانکار (ریال)",
        ]
        _write_text_row(sheet, 1, headers, bold=True)
        row_idx = 2
        total_debit = Decimal(0)
        total_credit = Decimal(0)
        for file_row_no, entry in enumerate(chronological_rows, start=1):
            d = entry["raw_debit"]
            c = entry["raw_credit"]
            if d is not None:
                total_debit += d
            if c is not None:
                total_credit += c
            _write_text_row(
                sheet,
                row_idx,
                [
                    str(file_row_no),
                    entry["journal_id"],
                    str(entry["journal_sequence"]),
                    str(entry["daily_doc_no"]),
                    entry["jalali_date"],
                    entry["general_code"],
                    entry["general_name"],
                    entry["subsidiary_code"],
                    entry["subsidiary_name"],
                    entry["detail_code"],
                    entry["detail_name"],
                    entry["description"],
                    canonical_money(d) if d is not None else "نامعلوم",
                    canonical_money(c) if c is not None else "نامعلوم",
                ],
            )
            row_idx += 1
        _write_text_row(
            sheet,
            row_idx,
            [
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "جمع کل فایل",
                aggregate_money(total_debit),
                aggregate_money(total_credit),
            ],
            bold=True,
        )
        meta_sheet = workbook.create_sheet("وضعیت قالب")
        meta_sheet.views.sheetView[0].rightToLeft = True
        _write_text_row(meta_sheet, 1, ["ویژگی", "مقدار"], bold=True)
        _write_text_row(
            meta_sheet,
            2,
            ["وضعیت قالب", "پیش‌نویس داخلی — نیازمند تطبیق با قالب رسمی مصوب دوره سامانه دفاتر تجاری الکترونیک"],
        )
        _write_text_row(meta_sheet, 3, ["از تاریخ", payload["from_date"] or "ابتدای دوره"])
        _write_text_row(meta_sheet, 4, ["تا تاریخ", payload["to_date"] or "انتهای دوره"])
        _write_text_row(meta_sheet, 5, ["تعداد اسناد", str(payload["total_journals"])])
        _write_text_row(meta_sheet, 6, ["جمع بدهکار (ریال)", payload["total_debit"]])
        _write_text_row(meta_sheet, 7, ["جمع بستانکار (ریال)", payload["total_credit"]])
        _write_text_row(meta_sheet, 8, ["حساب‌های بدون نگاشت کل/معین", str(payload["unmapped_accounts_count"])])
        _write_text_row(meta_sheet, 9, ["ردیف‌های با مبلغ نامعلوم", str(payload["unknown_amount_lines_count"])])
    else:
        sheet.title = "دفتر کل" if level == "general" else "دفتر معین"
        headers = [
            "ردیف فایل",
            "کد حساب گروهبندی",
            "نام حساب گروهبندی",
            "سطح",
            "وضعیت نگاشت",
            "نوع ردیف",
            "تاریخ (شمسی)",
            "شماره روزانه",
            "شماره سند سیستم",
            "شناسه سند",
            "کد حساب ردیف",
            "نام حساب ردیف",
            "شرح",
            "طرف حساب",
            "بدهکار (ریال)",
            "بستانکار (ریال)",
            "مانده (ریال)",
            "تشخیص",
        ]
        _write_text_row(sheet, 1, headers, bold=True)
        row_idx = 2
        file_row_no = 0
        for group in payload["items"]:
            acc = group["account"]
            if payload["from_date"] and (group["opening_debit"] not in (None, "0") or group["opening_credit"] not in (None, "0")):
                file_row_no += 1
                _write_text_row(
                    sheet,
                    row_idx,
                    [
                        str(file_row_no),
                        acc["code"],
                        acc["name"],
                        acc["level"],
                        acc["mapping_status"],
                        "مانده ابتدای بازه",
                        _jalali_str(from_date) if from_date else "",
                        "",
                        "",
                        "",
                        acc["code"],
                        acc["name"],
                        "مانده انتقالی پیش از بازه",
                        "",
                        group["opening_debit"] or "نامعلوم",
                        group["opening_credit"] or "نامعلوم",
                        group["opening_balance"] or "نامعلوم",
                        group["opening_nature"],
                    ],
                )
                row_idx += 1
            entries = group.get("entries") or []
            if entries:
                for entry in entries:
                    file_row_no += 1
                    _write_text_row(
                        sheet,
                        row_idx,
                        [
                            str(file_row_no),
                            acc["code"],
                            acc["name"],
                            acc["level"],
                            acc["mapping_status"],
                            "برگشت سند" if entry["is_reversal"] else "گردش",
                            _jalali_str(date.fromisoformat(entry["date"])),
                            str(entry["daily_doc_no"]),
                            str(entry["journal_sequence"]),
                            entry["journal_id"],
                            entry["account_code"],
                            entry["account_name"],
                            entry["description"],
                            entry["party_id"] or "—",
                            entry["debit"] if entry["debit"] is not None else "نامعلوم",
                            entry["credit"] if entry["credit"] is not None else "نامعلوم",
                            entry["balance"] if entry["balance"] is not None else "نامعلوم",
                            entry["balance_nature"],
                        ],
                    )
                    row_idx += 1
            else:
                file_row_no += 1
                _write_text_row(
                    sheet,
                    row_idx,
                    [
                        str(file_row_no),
                        acc["code"],
                        acc["name"],
                        acc["level"],
                        acc["mapping_status"],
                        "خلاصه حساب",
                        "",
                        "",
                        "",
                        "",
                        acc["code"],
                        acc["name"],
                        "گردش و مانده حساب",
                        "",
                        group["total_debit"],
                        group["total_credit"],
                        group["final_balance"] or "نامعلوم",
                        group["final_nature"],
                    ],
                )
                row_idx += 1
        _write_text_row(
            sheet,
            row_idx,
            [
                "",
                "",
                "جمع گردش بازه",
                "",
                "",
                "جمع کل",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                payload["total_debit"],
                payload["total_credit"],
                "",
                "",
            ],
            bold=True,
        )

    out = io.BytesIO()
    workbook.save(out)
    return out.getvalue()
