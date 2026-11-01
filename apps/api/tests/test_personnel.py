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
