from decimal import Decimal

import pytest
from sqlalchemy import select
from test_workflow import bank_rows, invoice_rows, seed, session_job, source
from test_workflow import db as db

from didban.errors import DomainError
from didban.ingestion import Sheet, interpret
from didban.models import BankMovement, Interpretation, Invoice, SourceRow
from didban.normalization import normalize
from didban.services import allocate
from didban.workflow import process


def publish(db, bank_amount, invoice_amount="200000000000000000000000000000", *, settlements=None, other_bank=False):
    user, company, period = seed(db)
    session, job = session_job(db, user, company, period)
    source(db, session, "bank", [{**bank_rows()[1], "amount": bank_amount}])
    if other_bank:
        source(db, session, "bank", [{**bank_rows()[1], "amount": bank_amount, "account": "B"}])
    source(db, session, "sales", [{**invoice_rows()[0], "amount": invoice_amount}], sheet="فروش")
    if settlements:
        source(db, session, "settlements", settlements, sheet="تسویه")
    process(db, job)
    db.flush()
    bank = db.scalar(select(BankMovement).where(BankMovement.account == "A"))
    invoice = db.scalar(select(Invoice))
    return user, company, bank, invoice


def test_allocation_cannot_round_29_digit_bank_capacity_up(db):
    user, company, bank, invoice = publish(db, "99999999999999999999999999999")
    with pytest.raises(DomainError) as error:
        allocate(db, company.id, user, {"bank_id": bank.id, "invoice_id": invoice.id, "amount": "100000000000000000000000000000"})
    assert error.value.code == "allocation_capacity"
    accepted = allocate(db, company.id, user, {"bank_id": bank.id, "invoice_id": invoice.id, "amount": "99999999999999999999999999999"})
    assert Decimal(accepted["amount"]) == Decimal("99999999999999999999999999999")


def test_uppercase_and_custom_mapped_settlement_bank_reference_is_canonical():
    values = {"EVENT_ID": "E", "INVOICE_ID": "I", "DATE": "2026-09-01", "AMOUNT": "30", "DIRECTION": "receipt", "CURRENCY": "IRR", "BANK_REFERENCE": "R", "BANK_ACCOUNT": "A"}
    sheet = Sheet("CSV", list(values), [(2, values)])
    proposal = interpret(sheet, "settlements.csv")
    assert proposal["mapping"]["bank_reference"] == "BANK_REFERENCE"
    row = SourceRow(id="row", company_id="company", file_id="file", sheet="CSV", row_number=2, values=values)
    interpretation = Interpretation(company_id="company", file_id="file", sheet="CSV", provenance="human", **proposal)
    fact = normalize(row, interpretation, "session")
    assert fact.bank_reference == "R" and fact.bank_account == "A"
    row.values = {**values, "trace-custom": "CUSTOM"}
    interpretation.mapping = {**interpretation.mapping, "bank_reference": "trace-custom"}
    assert normalize(row, interpretation, "session").bank_reference == "CUSTOM"


def test_imported_payment_reference_blocks_manual_duplicate_and_distinct_banks_stay_independent(db):
    rows = [{"event_id": "E", "invoice_id": "OTHER", "date": "2026-09-05", "amount": "30", "direction": "receipt", "bank_reference": "R", "bank_account": "B"}]
    user, company, bank, invoice = publish(db, "100", "200", settlements=rows, other_bank=True)
    # Same reference in a separately selected canonical bank account is independent.
    assert allocate(db, company.id, user, {"bank_id": bank.id, "invoice_id": invoice.id, "amount": "50"})["amount"] == "50"
    other = db.scalar(select(BankMovement).where(BankMovement.account == "B"))
    with pytest.raises(DomainError) as error:
        allocate(db, company.id, user, {"bank_id": other.id, "invoice_id": invoice.id, "amount": "50"})
    assert error.value.code == "payment_already_imported"


def test_missing_or_unresolved_imported_bank_identity_never_frees_used_capacity(db):
    rows = [{"event_id": "E", "invoice_id": "OTHER", "date": "2026-09-05", "amount": "30", "direction": "receipt", "bank_reference": "", "bank_account": ""}]
    user, company, bank, invoice = publish(db, "100", "200", settlements=rows)
    with pytest.raises(DomainError) as error:
        allocate(db, company.id, user, {"bank_id": bank.id, "invoice_id": invoice.id, "amount": "100"})
    assert error.value.code == "imported_bank_identity_ambiguous"
