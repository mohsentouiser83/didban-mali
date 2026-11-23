"""Block Query Engine for Didban-Mali custom reports.

Safely evaluates and executes block specifications against registered entities,
enforcing company isolation, period date scoping, registry whitelisting,
dynamic filtering, grouping, aggregation, and visualization shaping.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import String, cast, func, select
from sqlalchemy.orm import Session

from .. import (
    accounting_models,
    cheque_models,
    dimensions_models,
    inventory_models,
    moadian_models,
)
from .. import models as m
from ..native_invoice_exports import invoice_rows
from ..native_invoice_models import NativeInvoiceSnapshot
from .field_registry import get_entity_registry


def _to_decimal(val: Any) -> Decimal:
    if val is None:
        return Decimal("0")
    try:
        return Decimal(str(val))
    except Exception:
        return Decimal("0")


class FinancialBlockQueryEngine:
    """Executes a single block query safely within company bounds."""

    @staticmethod
    def execute(
        db: Session,
        company_id: str,
        block: dict[str, Any],
        period: m.Period | None = None,
        limit: int = 200,
    ) -> dict[str, Any]:
        entity_type = block.get("entity_type", "journal_lines")
        reg = get_entity_registry(entity_type)
        if not reg:
            return {
                "entity_type": entity_type,
                "visualization": block.get("visualization", "data_table"),
                "columns": [],
                "rows": [],
                "total": 0,
                "chart_data": {"labels": [], "datasets": []},
                "metrics": [],
                "error": f"منبع داده '{entity_type}' تعریف نشده یا نامعتبر است.",
            }

        visualization = block.get("visualization", "data_table")
        filters = block.get("filters", [])
        sort_field = block.get("sort_field")
        sort_dir = block.get("sort_dir", "desc")
        req_limit = min(int(block.get("limit") or limit), 1000)

        # 1. Fetch raw entity records based on entity_type
        try:
            records = FinancialBlockQueryEngine._fetch_records(
                db=db,
                company_id=company_id,
                entity_type=entity_type,
                period=period,
                date_from=block.get("date_from"),
                date_to=block.get("date_to"),
            )
        except Exception as e:
            return {
                "entity_type": entity_type,
                "visualization": visualization,
                "columns": [],
                "rows": [],
                "total": 0,
                "chart_data": {"labels": [], "datasets": []},
                "metrics": [],
                "error": f"خطا در واکشی داده‌های {reg.title_fa}: {str(e)}",
            }

        # 2. In-memory safe filter application against FieldDef
        filtered = []
        for row in records:
            if FinancialBlockQueryEngine._match_filters(row, filters, reg):
                filtered.append(row)

        total = len(filtered)

        # 3. Handle Visualizations
        # A. Metric Strip (KPI cards)
        if visualization == "metric_strip":
            metrics = FinancialBlockQueryEngine._compute_metrics(
                filtered, block.get("metrics", []), reg, entity_type
            )
            return {
                "entity_type": entity_type,
                "visualization": visualization,
                "columns": [],
                "rows": [],
                "total": total,
                "chart_data": {"labels": [], "datasets": []},
                "metrics": metrics,
            }

        # B. Charts (bar, line, pie, donut, etc.)
        if visualization in {
            "bar_chart",
            "horizontal_bar",
            "stacked_bar",
            "line_chart",
            "area_chart",
            "pie_chart",
            "donut_chart",
        }:
            group_by = block.get("group_by") or (reg.groupable[0].key if reg.groupable else None)
            chart_data = FinancialBlockQueryEngine._compute_chart(
                filtered,
                group_by=group_by,
                agg=block.get("aggregation") or {"function": "count", "field": None},
                reg=reg,
            )
            return {
                "entity_type": entity_type,
                "visualization": visualization,
                "columns": [],
                "rows": [],
                "total": total,
                "chart_data": chart_data,
                "metrics": [],
            }

        # C. Data Table (default)
        selected_cols = block.get("columns", [])
        if not selected_cols:
            selected_cols = [f.key for f in reg.selectable[:6]]

        # Validate columns against selectable registry
        valid_cols = [c for c in selected_cols if reg.get_selectable(c)]
        if not valid_cols:
            valid_cols = [f.key for f in reg.selectable[:6]]

        # Sort
        if sort_field and reg.get_selectable(sort_field):
            reverse = sort_dir.lower() == "desc"

            def _sort_key(item: dict[str, Any]):
                v = item.get(sort_field)
                if v is None:
                    return "" if isinstance(v, str) else Decimal("-Infinity")
                if isinstance(v, (int, float, Decimal)):
                    return v
                return str(v)

            filtered.sort(key=_sort_key, reverse=reverse)

        # Pagination / Slice
        sliced = filtered[:req_limit]

        columns_meta = [
            {
                "key": col_key,
                "label_fa": reg.get_selectable(col_key).label_fa,
                "type": reg.get_selectable(col_key).field_type,
            }
            for col_key in valid_cols
        ]

        table_rows = []
        for r in sliced:
            table_rows.append({col: r.get(col) for col in valid_cols})

        return {
            "entity_type": entity_type,
            "visualization": visualization,
            "columns": columns_meta,
            "rows": table_rows,
            "total": total,
            "chart_data": {"labels": [], "datasets": []},
            "metrics": [],
        }

    # -------------------------------------------------------------------------
    # Record Loaders per Entity
    # -------------------------------------------------------------------------
    @staticmethod
    def _fetch_records(
        db: Session,
        company_id: str,
        entity_type: str,
        period: m.Period | None,
        date_from: str | None,
        date_to: str | None,
    ) -> list[dict[str, Any]]:
        # Calculate effective date bounds
        start_d: date | None = None
        end_d: date | None = None
        if date_from:
            try:
                start_d = date.fromisoformat(date_from[:10])
            except Exception:
                pass
        elif period:
            start_d = period.start

        if date_to:
            try:
                end_d = date.fromisoformat(date_to[:10])
            except Exception:
                pass
        elif period:
            end_d = period.end

        # 1. journal_lines
        if entity_type == "journal_lines":
            q = select(m.JournalLine).where(m.JournalLine.company_id == company_id)
            if start_d:
                q = q.where(m.JournalLine.date >= start_d)
            if end_d:
                q = q.where(m.JournalLine.date <= end_d)
            q = q.order_by(m.JournalLine.date.desc(), m.JournalLine.entry_id.desc())
            items = db.scalars(q).all()
            return [
                {
                    "id": row.id,
                    "entry_id": row.entry_id,
                    "date": row.date.isoformat() if row.date else "",
                    "account": row.account,
                    "party_id": row.party_id or "",
                    "debit": int(_to_decimal(row.debit)),
                    "credit": int(_to_decimal(row.credit)),
                    "entry_type": row.entry_type or "normal",
                    "reference": row.reference or "",
                }
                for row in items
            ]

        # 2. accounting_accounts
        if entity_type == "accounting_accounts":
            q = (
                select(accounting_models.Account)
                .where(accounting_models.Account.company_id == company_id)
                .order_by(accounting_models.Account.code.asc())
            )
            items = db.scalars(q).all()
            return [
                {
                    "id": row.id,
                    "code": row.code,
                    "name": row.name,
                    "nature": row.nature or "debit",
                    "active": bool(row.active),
                    "created_at": row.created_at.isoformat() if row.created_at else "",
                }
                for row in items
            ]

        # 3. invoices
        if entity_type == "invoices":
            # First attempt: load from NativeInvoiceSnapshot if available
            snap_q = (
                select(NativeInvoiceSnapshot)
                .where(NativeInvoiceSnapshot.company_id == company_id)
                .order_by(NativeInvoiceSnapshot.created_at.desc())
                .limit(1)
            )
            snap = db.scalar(snap_q)
            rows = []
            if snap and snap.payload:
                rows = invoice_rows(snap.payload)

            # Fallback to ResultManifest details or m.Invoice
            if not rows:
                inv_items = db.scalars(
                    select(m.Invoice)
                    .where(m.Invoice.company_id == company_id)
                    .order_by(m.Invoice.date.desc())
                ).all()
                rows = [
                    {
                        "id": inv.id,
                        "reference": inv.reference,
                        "direction": inv.direction,
                        "party_id": inv.party_id or "",
                        "date": inv.date.isoformat() if inv.date else "",
                        "due_date": inv.due_date.isoformat() if inv.due_date else "",
                        "amount": int(_to_decimal(inv.amount)),
                        "paid": int(_to_decimal(inv.settled_amount)),
                        "remaining": int(_to_decimal(inv.amount) - _to_decimal(inv.settled_amount)),
                        "total": int(_to_decimal(inv.amount)),
                        "status": "paid"
                        if _to_decimal(inv.settled_amount) >= _to_decimal(inv.amount)
                        else "unpaid",
                        "overdue": bool(inv.due_date and inv.due_date < date.today()),
                    }
                    for inv in inv_items
                ]
            else:
                for r in rows:
                    r["total"] = int(_to_decimal(r.get("amount")))
                    r["paid"] = int(_to_decimal(r.get("paid")))
                    r["remaining"] = int(_to_decimal(r.get("remaining")))
                    r["status"] = (
                        "paid" if r["remaining"] <= 0 else "overdue" if r.get("overdue") else "unpaid"
                    )

            if start_d or end_d:
                res = []
                for r in rows:
                    d_str = r.get("date")
                    if d_str:
                        try:
                            d = date.fromisoformat(str(d_str)[:10])
                            if start_d and d < start_d:
                                continue
                            if end_d and d > end_d:
                                continue
                        except Exception:
                            pass
                    res.append(r)
                return res
            return rows

        # 4. parties (derived from counterparties & ledger lines)
        if entity_type == "parties":
            j_q = select(
                m.JournalLine.party_id,
                func.sum(cast(m.JournalLine.debit, String)),
                func.sum(cast(m.JournalLine.credit, String)),
            ).where(
                m.JournalLine.company_id == company_id,
                m.JournalLine.party_id.is_not(None),
                m.JournalLine.party_id != "",
            )
            if start_d:
                j_q = j_q.where(m.JournalLine.date >= start_d)
            if end_d:
                j_q = j_q.where(m.JournalLine.date <= end_d)
            j_q = j_q.group_by(m.JournalLine.party_id)
            party_sums = db.execute(j_q).all()

            results = []
            for p_id, deb_sum, cred_sum in party_sums:
                d_val = _to_decimal(deb_sum)
                c_val = _to_decimal(cred_sum)
                balance = d_val - c_val
                status = "debtor" if balance > 0 else "creditor" if balance < 0 else "settled"
                results.append(
                    {
                        "id": p_id,
                        "party_id": p_id,
                        "name": p_id,
                        "balance": int(balance),
                        "status": status,
                        "debit_sum": int(d_val),
                        "credit_sum": int(c_val),
                    }
                )
            results.sort(key=lambda x: abs(x["balance"]), reverse=True)
            return results

        # 5. bank_movements
        if entity_type == "bank_movements":
            q = select(m.BankMovement).where(m.BankMovement.company_id == company_id)
            if start_d:
                q = q.where(m.BankMovement.date >= start_d)
            if end_d:
                q = q.where(m.BankMovement.date <= end_d)
            q = q.order_by(m.BankMovement.date.desc())
            items = db.scalars(q).all()
            return [
                {
                    "id": row.id,
                    "account": row.account,
                    "date": row.date.isoformat() if row.date else "",
                    "kind": row.kind,
                    "amount": int(_to_decimal(row.amount)),
                    "reference": row.reference or "",
                    "party_id": row.party_id or "",
                    "balance": int(_to_decimal(row.balance)),
                }
                for row in items
            ]

        # 6. cheques
        if entity_type == "cheques":
            q = select(cheque_models.Cheque).where(cheque_models.Cheque.company_id == company_id)
            if start_d:
                q = q.where(cheque_models.Cheque.due_date >= start_d)
            if end_d:
                q = q.where(cheque_models.Cheque.due_date <= end_d)
            q = q.order_by(cheque_models.Cheque.due_date.asc())
            items = db.scalars(q).all()
            return [
                {
                    "id": row.id,
                    "direction": row.direction,
                    "number": row.number,
                    "bank_name": row.bank_name,
                    "bank_account": row.bank_account or "",
                    "party_id": row.party_id or "",
                    "amount": int(_to_decimal(row.amount)),
                    "due_date": row.due_date.isoformat() if row.due_date else "",
                    "issue_date": row.issue_date.isoformat() if row.issue_date else "",
                    "state": row.state,
                    "endorsed_to": row.endorsed_to or "",
                }
                for row in items
            ]

        # 7. inventory_items
        if entity_type == "inventory_items":
            q = (
                select(inventory_models.InventoryItem)
                .where(inventory_models.InventoryItem.company_id == company_id)
                .order_by(inventory_models.InventoryItem.code.asc())
            )
            items = db.scalars(q).all()
            return [
                {
                    "id": row.id,
                    "code": row.code,
                    "name": row.name,
                    "active": bool(row.active),
                    "inventory_account_id": row.inventory_account_id or "",
                    "created_at": row.created_at.isoformat() if row.created_at else "",
                }
                for row in items
            ]

        # 8. inventory_movements
        if entity_type == "inventory_movements":
            q = select(inventory_models.InventoryMovement).where(
                inventory_models.InventoryMovement.company_id == company_id
            )
            if start_d:
                q = q.where(inventory_models.InventoryMovement.date >= start_d)
            if end_d:
                q = q.where(inventory_models.InventoryMovement.date <= end_d)
            q = q.order_by(inventory_models.InventoryMovement.date.desc())
            items = db.scalars(q).all()
            return [
                {
                    "id": row.id,
                    "item_id": row.item_id,
                    "warehouse_id": row.warehouse_id,
                    "kind": row.kind,
                    "date": row.date.isoformat() if row.date else "",
                    "quantity": int(row.quantity or 0),
                    "value_irr": int(_to_decimal(row.value_irr)),
                }
                for row in items
            ]

        # 9. personnel_records
        if entity_type == "personnel_records":
            q = select(m.PersonnelRecord).where(m.PersonnelRecord.company_id == company_id)
            if start_d:
                q = q.where(m.PersonnelRecord.date >= start_d)
            if end_d:
                q = q.where(m.PersonnelRecord.date <= end_d)
            q = q.order_by(m.PersonnelRecord.date.desc())
            items = db.scalars(q).all()
            return [
                {
                    "id": row.id,
                    "employee_id": row.employee_id,
                    "employee_name": row.employee_name or row.employee_id,
                    "kind": row.kind,
                    "date": row.date.isoformat() if row.date else "",
                    "amount": int(_to_decimal(row.original_amount or 0)),
                }
                for row in items
            ]

        # 10. dimensions
        if entity_type == "dimensions":
            q = (
                select(dimensions_models.Dimension)
                .where(dimensions_models.Dimension.company_id == company_id)
                .order_by(dimensions_models.Dimension.kind.asc(), dimensions_models.Dimension.code.asc())
            )
            items = db.scalars(q).all()
            return [
                {
                    "id": row.id,
                    "kind": row.kind,
                    "code": row.code,
                    "name": row.name,
                    "active": bool(row.active),
                    "created_at": row.created_at.isoformat() if row.created_at else "",
                }
                for row in items
            ]

        # 11. moadian_transmissions
        if entity_type == "moadian_transmissions":
            q = (
                select(moadian_models.MoadianTransmission)
                .where(moadian_models.MoadianTransmission.company_id == company_id)
                .order_by(moadian_models.MoadianTransmission.created_at.desc())
            )
            items = db.scalars(q).all()
            return [
                {
                    "id": row.id,
                    "tax_id": row.tax_id or "",
                    "invoice_reference": row.invoice_reference or "",
                    "seller_tax_number": row.seller_tax_number or "",
                    "uid": row.uid or "",
                    "created_at": row.created_at.isoformat() if row.created_at else "",
                }
                for row in items
            ]

        return []

    # -------------------------------------------------------------------------
    # In-memory Filter Evaluator
    # -------------------------------------------------------------------------
    @staticmethod
    def _match_filters(row: dict[str, Any], filters: list[dict[str, Any]], reg) -> bool:
        if not filters:
            return True

        for f in filters:
            field_key = f.get("field")
            if not field_key or not reg.get_filterable(field_key):
                continue

            op = f.get("operator", "=")
            target = f.get("value")
            actual = row.get(field_key)

            if not FinancialBlockQueryEngine._eval_cond(actual, op, target):
                return False

        return True

    @staticmethod
    def _eval_cond(actual: Any, op: str, target: Any) -> bool:
        if op == "is_null":
            return actual is None or actual == ""
        if op == "is_not_null":
            return actual is not None and actual != ""

        if actual is None:
            return False

        # Boolean
        if isinstance(actual, bool) or target in ("true", "false", True, False):
            act_b = bool(actual)
            tar_b = target in (True, "true", "True", 1, "1")
            return (act_b == tar_b) if op in ("=", "==") else (act_b != tar_b)

        # Numbers
        if isinstance(actual, (int, float, Decimal)):
            try:
                tar_num = _to_decimal(target)
                act_num = _to_decimal(actual)
                if op in ("=", "=="):
                    return act_num == tar_num
                if op == "!=":
                    return act_num != tar_num
                if op == ">":
                    return act_num > tar_num
                if op == ">=":
                    return act_num >= tar_num
                if op == "<":
                    return act_num < tar_num
                if op == "<=":
                    return act_num <= tar_num
                if op == "between" and isinstance(target, (list, tuple)) and len(target) == 2:
                    return _to_decimal(target[0]) <= act_num <= _to_decimal(target[1])
            except Exception:
                return False

        # Dates / Strings
        act_str = str(actual).strip()
        tar_str = str(target).strip() if target is not None else ""

        if op in ("=", "=="):
            return act_str.lower() == tar_str.lower()
        if op == "!=":
            return act_str.lower() != tar_str.lower()
        if op == "contains":
            return tar_str.lower() in act_str.lower()
        if op == "in" and isinstance(target, (list, tuple)):
            return any(str(t).lower() == act_str.lower() for t in target)
        if op == "between" and isinstance(target, (list, tuple)) and len(target) == 2:
            return str(target[0]) <= act_str <= str(target[1])

        return True

    # -------------------------------------------------------------------------
    # Visualizers: KPI Strip & Charts
    # -------------------------------------------------------------------------
    @staticmethod
    def _compute_metrics(
        records: list[dict[str, Any]],
        metrics_specs: list[dict[str, Any]],
        reg,
        entity_type: str,
    ) -> list[dict[str, Any]]:
        if not metrics_specs:
            # Default metric: record count
            return [
                {
                    "label_fa": f"تعداد کل رکوردهای {reg.title_fa}",
                    "value": len(records),
                    "unit": "عدد",
                }
            ]

        results = []
        for m_spec in metrics_specs:
            func_name = m_spec.get("function", "count")
            field_key = m_spec.get("field")
            label_fa = m_spec.get("label_fa") or func_name
            unit = m_spec.get("unit", "ریال" if "amount" in (field_key or "") else "عدد")

            if func_name == "count":
                results.append({"label_fa": label_fa, "value": len(records), "unit": unit})
            elif func_name == "sum" and field_key:
                val = sum(_to_decimal(r.get(field_key)) for r in records)
                results.append({"label_fa": label_fa, "value": int(val), "unit": unit})
            elif func_name == "avg" and field_key:
                val = (
                    (sum(_to_decimal(r.get(field_key)) for r in records) / len(records))
                    if records
                    else Decimal("0")
                )
                results.append({"label_fa": label_fa, "value": int(val), "unit": unit})
            elif func_name == "max" and field_key:
                val = max((_to_decimal(r.get(field_key)) for r in records), default=Decimal("0"))
                results.append({"label_fa": label_fa, "value": int(val), "unit": unit})
            elif func_name == "min" and field_key:
                val = min((_to_decimal(r.get(field_key)) for r in records), default=Decimal("0"))
                results.append({"label_fa": label_fa, "value": int(val), "unit": unit})

        return results

    @staticmethod
    def _compute_chart(
        records: list[dict[str, Any]],
        group_by: str | None,
        agg: dict[str, Any],
        reg,
    ) -> dict[str, Any]:
        if not group_by:
            group_by = reg.groupable[0].key if reg.groupable else None

        if not group_by:
            return {"labels": [], "datasets": []}

        agg_func = agg.get("function", "count")
        agg_field = agg.get("field")

        grouped: dict[str, list[dict[str, Any]]] = {}
        for r in records:
            key = str(r.get(group_by) or "نامشخص")
            if group_by == "date" and len(key) >= 7:
                key = key[:7]  # Group by YYYY-MM
            grouped.setdefault(key, []).append(r)

        labels = sorted(grouped.keys())
        values = []
        for lbl in labels:
            rows = grouped[lbl]
            if agg_func == "sum" and agg_field:
                val = int(sum(_to_decimal(r.get(agg_field)) for r in rows))
            elif agg_func == "avg" and agg_field:
                val = int(sum(_to_decimal(r.get(agg_field)) for r in rows) / len(rows)) if rows else 0
            else:
                val = len(rows)
            values.append(val)

        dataset_label = f"تعداد رکوردهای {reg.title_fa}"
        if agg_func == "sum" and agg_field:
            f_def = reg.get_selectable(agg_field)
            dataset_label = f"مجموع {f_def.label_fa if f_def else agg_field}"

        return {
            "labels": labels,
            "datasets": [
                {
                    "label": dataset_label,
                    "data": values,
                }
            ],
        }
