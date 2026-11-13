import pytest

from didban.errors import DomainError
from didban.ingestion import Sheet, interpret
from didban.models import Interpretation, SourceRow
from didban.normalization import normalize


def source(values):
    row = SourceRow(id="row", company_id="company", sheet="payroll", values=values)
    mapping = {key: key for key in values}
    interpretation = Interpretation(
        family="payroll", mapping=mapping, unit="TOMAN", calendar="gregorian", evidence={}
    )
    return normalize(row, interpretation, "session")


def values():
    return dict(
        employee_id="EMP1",
        employee_name="کارمند نمونه",
        date="2026-10-01",
        gross_pay="9007199254740993",
        net_pay="9007199254740987",
        payroll_tax="1",
        employee_insurance="2",
        employer_insurance="3",
        other_deductions="3",
    )


def test_payroll_exact_conversion_and_net_control():
    record = source(values())
    assert record.values["gross_pay"] == "90071992547409930"
    assert record.values["net_pay"] == "90071992547409870"
    assert record.employee_id == "EMP1"


def test_payroll_rejects_unbalanced_and_missing_amount():
    invalid = values() | {"net_pay": "1"}
    with pytest.raises(DomainError) as error:
        source(invalid)
    assert error.value.code == "payroll_not_balanced"
    with pytest.raises(DomainError):
        source(values() | {"employee_insurance": ""})


def test_people_family_recognition():
    data = values()
    result = interpret(Sheet("payroll", list(data), [(2, data)]), "payroll.csv")
    assert result["family"] == "payroll"
    employee = {key: data[key] for key in ("employee_id", "employee_name", "date")}
    assert (
        interpret(Sheet("employees", list(employee), [(2, employee)]), "employees.csv")["family"]
        == "employees"
    )


def test_personnel_report_uses_selected_rows_and_exact_totals():
    from datetime import date

    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    from didban import models as m
    from didban.personnel_service import personnel_result

    engine = create_engine("sqlite://")
    m.Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add(m.Company(id="c", name="نمونه"))
        db.add(m.Period(id="p", company_id="c", name="دوره", start=date(2026, 10, 1), end=date(2026, 10, 31)))
        db.add(
            m.ResultManifest(
                id="r",
                company_id="c",
                period_id="p",
                session_id="s",
                digest="digest",
                selection={"row_ids": ["chosen"]},
                metrics=[],
                details={},
            )
        )
        for row_id, company in [("chosen", "c"), ("excluded", "c"), ("chosen-other", "other")]:
            db.add(
                m.PersonnelRecord(
                    id=row_id,
                    company_id=company,
                    session_id="s",
                    source_row_id=row_id,
                    original_unit="IRR",
                    original_amount="",
                    kind="payroll",
                    employee_id="e",
                    employee_name="نمونه",
                    date=date(2026, 10, 1),
                    values={
                        key: "9007199254740993"
                        for key in (
                            "gross_pay",
                            "net_pay",
                            "payroll_tax",
                            "employee_insurance",
                            "employer_insurance",
                            "other_deductions",
                        )
                    },
                )
            )
        db.flush()
        result = personnel_result(db, "c", "payroll", "p")
        assert len(result["items"]) == 1
        assert result["totals"]["gross_pay"] == "9007199254740993"
        assert personnel_result(db, "c", "employees", "p")["totals"] is None


def test_native_payroll_and_employee_reports_acc_07():
    """ACC-07: Employee financial reports from supported native payroll operations and journals."""
    from datetime import date
    from uuid import uuid4

    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    from didban import models as m
    from didban.accounting_setup_models import CompanyAccountingSetup
    from didban.operation_models import OperationDraft
    from didban.personnel_service import personnel_result
    from didban.posting_models import NativeJournal

    engine = create_engine("sqlite://")
    m.Base.metadata.create_all(engine)

    with Session(engine) as db:
        c_id = f"c-pay-{uuid4().hex[:6]}"
        p_id = f"p-pay-{uuid4().hex[:6]}"
        db.add(m.Company(id=c_id, name="شرکت تست حقوق نیتیو"))
        db.add(CompanyAccountingSetup(company_id=c_id, mode="primary"))
        db.add(m.Period(id=p_id, company_id=c_id, name="دوره مالی", start=date(2026, 1, 1), end=date(2026, 12, 29)))

        # 1. Add posted payroll journal for Employee EMP-101
        draft_1 = str(uuid4())
        j_1 = NativeJournal(
            id=str(uuid4()),
            company_id=c_id,
            draft_id=draft_1,
            draft_version=1,
            period_id=p_id,
            date=date(2026, 5, 1),
            sequence=1,
            digest="d1",
            snapshot={},
            actor_id="u1",
            permission_provenance={"actor_id": "u1"},
        )
        op_1 = OperationDraft(
            id=str(uuid4()),
            company_id=c_id,
            draft_id=draft_1,
            kind="payroll",
            source_reference="PAY-001",
            payload={
                "party_id": "EMP-101",
                "party_name": "علی رضایی",
                "amounts": {
                    "gross": "50000000",
                    "employee_insurance": "3500000",
                    "employer_insurance": "11500000",
                    "payroll_tax": "2000000",
                    "other_deductions": "500000",
                    "net_pay": "44000000",
                },
            },
            actor_id="u1",
            policy_version="user-provisional-2026-11-02-v1",
        )

        # 2. Add aggregate unassigned payroll journal
        draft_agg = str(uuid4())
        j_agg = NativeJournal(
            id=str(uuid4()),
            company_id=c_id,
            draft_id=draft_agg,
            draft_version=1,
            period_id=p_id,
            date=date(2026, 5, 2),
            sequence=2,
            digest="d2",
            snapshot={},
            actor_id="u1",
            permission_provenance={"actor_id": "u1"},
        )
        op_agg = OperationDraft(
            id=str(uuid4()),
            company_id=c_id,
            draft_id=draft_agg,
            kind="payroll",
            source_reference="PAY-AGG-001",
            payload={
                "party_id": "",
                "amounts": {
                    "gross": "100000000",
                    "employee_insurance": "7000000",
                    "employer_insurance": "23000000",
                    "payroll_tax": "4000000",
                    "other_deductions": "1000000",
                    "net_pay": "88000000",
                },
            },
            actor_id="u1",
            policy_version="user-provisional-2026-11-02-v1",
        )

        # 3. Add payroll_payment journal paying EMP-101
        draft_pay = str(uuid4())
        j_pay = NativeJournal(
            id=str(uuid4()),
            company_id=c_id,
            draft_id=draft_pay,
            draft_version=1,
            period_id=p_id,
            date=date(2026, 5, 5),
            sequence=3,
            digest="d3",
            snapshot={},
            actor_id="u1",
            permission_provenance={"actor_id": "u1"},
        )
        op_pay = OperationDraft(
            id=str(uuid4()),
            company_id=c_id,
            draft_id=draft_pay,
            kind="payroll_payment",
            source_reference="PAY-DISB-001",
            payload={"party_id": "EMP-101", "amounts": {"amount": "44000000"}},
            actor_id="u1",
            policy_version="user-provisional-2026-11-02-v1",
        )

        db.add_all([j_1, op_1, j_agg, op_agg, j_pay, op_pay])
        db.flush()

        # Query native payroll report
        payroll_rep = personnel_result(db, c_id, "payroll", p_id, basis="native")
        assert payroll_rep["basis"] == "native"
        assert payroll_rep["status"] == "available"
        assert len(payroll_rep["items"]) == 2

        emp_item = next(it for it in payroll_rep["items"] if it["employee_id"] == "EMP-101")
        assert emp_item["employee_name"] == "علی رضایی"
        assert emp_item["values"]["gross_pay"] == "50000000"
        assert emp_item["values"]["net_pay"] == "44000000"
        assert emp_item["payment_status"] == "paid"
        assert emp_item["is_unassigned_aggregate"] is False

        agg_item = next(it for it in payroll_rep["items"] if it["employee_id"] == "unassigned_aggregate")
        assert agg_item["is_unassigned_aggregate"] is True
        assert agg_item["employee_name"] == "حقوق تجمیعی ثبت‌شده"
        assert agg_item["payment_status"] == "unpaid"

        # Verify totals
        assert payroll_rep["totals"]["gross_pay"] == "150000000"
        assert payroll_rep["totals"]["payroll_tax"] == "6000000"

        # Query employees directory
        emp_dir = personnel_result(db, c_id, "employees", p_id, basis="native")
        assert len(emp_dir["items"]) == 1  # Only named employee, aggregate excluded from directory
        assert emp_dir["items"][0]["employee_id"] == "EMP-101"

        # Query imported basis returns unavailable (no imported manifest) - strict separation
        imp_rep = personnel_result(db, c_id, "payroll", p_id, basis="imported")
        assert imp_rep["basis"] == "imported"
        assert imp_rep["status"] == "unavailable"

