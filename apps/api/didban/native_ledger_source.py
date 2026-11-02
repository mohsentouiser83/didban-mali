"""Read-only line projection of an exact frozen native statement, never imported facts."""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select
from sqlalchemy.orm import Session

from .errors import require
from .native_assistant_service import native_context
from .native_reporting_models import NativeStatementRun
from .operation_models import OperationDraft
from .posting_models import NativeJournal
from .services import get_entity


@dataclass(frozen=True)
class NativeSourceLine:
    id: str
    journal_id: str
    line_index: int
    date: date
    account: str
    party_id: str
    role: str | None
    reference: str | None
    debit: Decimal
    credit: Decimal
    entry_type: str
    source_row_id: str


def statement_source(db: Session, company: str, statement_id: str) -> dict:
    run = get_entity(db, NativeStatementRun, company, statement_id)
    snapshot = run.snapshot
    require(snapshot.get("basis") == "native_book", "native_basis", "مبنای دفتر اصلی معتبر نیست.", 409)
    roles = {item["account_id"]: item.get("role") for item in snapshot["role_assignments"]}
    profit_ids = set(snapshot["profit_journal_ids"])
    movement_ids = set(snapshot["movement_journal_ids"])
    ids = snapshot["journal_ids"]
    journals = []
    for offset in range(0, len(ids), 500):
        journals.extend(
            db.scalars(
                select(NativeJournal).where(
                    NativeJournal.company_id == company, NativeJournal.id.in_(ids[offset : offset + 500])
                )
            )
        )
    require(len(journals) == len(ids), "native_journal_missing", "شواهد گزارش اصلی کامل نیست.", 409)
    operations = {}
    draft_ids = [journal.draft_id for journal in journals]
    for offset in range(0, len(draft_ids), 500):
        operations.update(
            {
                row.draft_id: row
                for row in db.scalars(
                    select(OperationDraft).where(
                        OperationDraft.company_id == company,
                        OperationDraft.draft_id.in_(draft_ids[offset : offset + 500]),
                    )
                )
            }
        )

    rows = []
    for journal in journals:
        operation = operations.get(journal.draft_id)
        reference = operation.source_reference if operation else None
        for index, item in enumerate(journal.snapshot["lines"]):
            role = roles.get(item["account_id"])
            entry_type = (
                "normal"
                if journal.id in profit_ids
                else "closing"
                if journal.id in movement_ids
                else "opening"
            )
            rows.append(
                NativeSourceLine(
                    id=str(uuid5(NAMESPACE_URL, f"didban-native-line:{company}:{journal.id}:{index}")),
                    journal_id=journal.id,
                    line_index=index,
                    date=journal.date,
                    account=item["code"],
                    party_id=item.get("party_id") or "",
                    role="operating_expense" if role == "expense" else role,
                    reference=reference,
                    debit=Decimal(item["debit"]),
                    credit=Decimal(item["credit"]),
                    entry_type=entry_type,
                    source_row_id="native-statement:" + run.id,
                )
            )
    metrics = []
    for metric in native_context(run)["metrics"]:
        key = metric["metric_key"]
        metrics.append(
            metric
            | {
                "basis": "ledger",
                "scope": "commercial_receivables"
                if key == "ar_ledger"
                else "commercial_payables"
                if key == "ap_trade_ledger"
                else "company",
            }
        )
    return {
        "source": "native_statement",
        "native_statement_id": run.id,
        "manifest_id": None,
        "digest": run.digest,
        "company_id": company,
        "metrics": metrics,
        "rows": rows,
        "start": date.fromisoformat(snapshot["period"]["start"]),
        "end": date.fromisoformat(snapshot["as_of"]),
        "period": snapshot["period"],
        "snapshot": snapshot,
    }
