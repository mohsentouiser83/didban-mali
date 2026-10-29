"""Payroll commands: scoped access, exact inputs, immutable calculations and approval."""

from __future__ import annotations
import base64
import hashlib
from psycopg.types.json import Jsonb
from ..errors import ApiError, missing, forbidden, conflict
from ..infrastructure.company_modules import require_module
from ..infrastructure import payroll as store
from ..domain.payroll.calculation import (
    calculate,
    validate_rules,
    PayrollValidation,
)
from ..domain.payroll.validation import (
    employee_profile,
    contract_content,
    work_content,
    primary_sources,
)
from ..adapters.payroll_import import parse_import
from ..domain.payroll.fingerprint import digest
from .payroll_calculations import PayrollCalculationCommands
from ..domain.payroll.validation import valid_date
from ..domain.settlements import exact_context
from .auth import response

PAYROLL_OPS = {
    "getPayrollFinancialOptions",
    "linkPayrollFinancial",
    "listPayrollEmployeeContracts",
    "listPayrollEmployeeWork",
    "listPayrollEmployeeRuns",
    "getPayrollEmployeeDetails",
    "listPayrollEmployees",
    "createPayrollEmployee",
    "updatePayrollEmployee",
    "listPayrollContracts",
    "createPayrollContract",
    "listPayrollWork",
    "savePayrollWork",
    "listPayrollRules",
    "createPayrollRule",
    "validatePayrollRule",
    "listPayrollRuns",
    "createPayrollRun",
    "getPayrollRun",
    "approvePayrollRun",
    "recordPayrollPayment",
    "exportPayrollRun",
    "getPayrollSummary",
    "previewPayrollImport",
    "commitPayrollImport",
}
READS = {op for op in PAYROLL_OPS if op.startswith(("get", "list"))} | {
    "exportPayrollRun"
}


class PayrollService(PayrollCalculationCommands):
    def __init__(self, intake):
        self.intake = intake

    @exact_context
    def execute(
        self, op, actor, company, ids, body, key, expected, request_id, limit, cursor
    ):
        with self.intake.db.transaction(
            identity=False, actor=str(actor["id"]), company=company
        ) as conn:
            access = self.intake.authorize(conn, actor, company, False)
            grants = conn.execute(
                "SELECT app.payroll_allowed(%s,'view') AS view,app.payroll_allowed(%s,'manage') AS manage,app.payroll_allowed(%s,'approve') AS approve",
                (company, company, company),
            ).fetchone()
            if not grants["view"] or (
                op not in READS
                and not grants["approve" if op == "approvePayrollRun" else "manage"]
            ):
                raise forbidden()
            if op not in READS:
                require_module(conn, company, "payroll")

            def action():
                try:
                    result = self._execute(
                        conn,
                        op,
                        actor,
                        company,
                        ids,
                        body,
                        expected,
                        access,
                        limit,
                        cursor,
                    )
                except PayrollValidation as exc:
                    messages = {
                        "reviewed_effective_rules_required": "قواعد بازبینی‌شده برای این بازه موجود نیست.",
                        "effective_contract_required": "قرارداد معتبر برای کل بازه ثبت نشده است.",
                        "work_record_required": "کارکرد این بازه ثبت نشده است.",
                        "opening_leave_balance_required": "مانده مرخصی ابتدای بازه و مرجع آن لازم است.",
                        "work_period_day_mismatch": "تعداد روزهای بازه با تاریخ‌ها تطابق ندارد.",
                        "work_exceeds_employment_days": "روزهای مزد از مدت همکاری در بازه بیشتر است.",
                        "deduction_exceeds_opening_balance": "قسط یا مساعده از مانده ثبت‌شده بیشتر است.",
                        "contract_changes_require_split_period": "تغییر قرارداد داخل بازه است؛ بازه را تفکیک کنید.",
                        "rule_fixture_mismatch": "محاسبه قواعد با نمونه مرجع تطابق ندارد.",
                        "opening_balance_source_required": "برای مانده شروع، تاریخ و مرجع را ثبت کنید.",
                        "part_time_hours_required": "ساعت موظف روزانه قرارداد پاره‌وقت لازم است.",
                    }
                    raise ApiError(
                        422,
                        str(exc),
                        messages.get(
                            str(exc),
                            "اطلاعات لازم برای محاسبه حقوق معتبر یا کامل نیست.",
                        ),
                    ) from exc
                if op not in READS:
                    access.audit(
                        company,
                        str(actor["id"]),
                        "payroll." + op,
                        "company",
                        company,
                        request_id,
                        {"operation": op},
                    )
                return result

            if op in READS:
                return action()
            return self.intake.replay.run(
                conn,
                identity=False,
                scope=company + ":" + str(actor["id"]),
                actor=str(actor["id"]),
                company=company,
                route=op + ":" + str(ids),
                key=key,
                payload={"body": body, "version": expected},
                action=action,
            )

    def _execute(
        self, conn, op, actor, company, ids, body, expected, access, limit, cursor
    ):
        actor_id = str(actor["id"])
        lists = {
            "listPayrollEmployees": ("payroll_employees", store.employee_view),
            "listPayrollContracts": ("payroll_contracts", store.contract_view),
            "listPayrollWork": ("payroll_work_records", store.work_view),
            "listPayrollRules": (
                "payroll_rule_sets",
                lambda row: store.rule_view(conn, company, row),
            ),
            "listPayrollRuns": (
                "payroll_runs",
                lambda row: store.run_view(conn, company, row),
            ),
        }
        scoped = {
            "listPayrollEmployeeContracts": "listPayrollContracts",
            "listPayrollEmployeeWork": "listPayrollWork",
            "listPayrollEmployeeRuns": "listPayrollRuns",
        }
        if op in lists or op in scoped:
            table, present = lists[scoped.get(op, op)]
            employee_id = ids.get("employee_id") if op in scoped else None
            if employee_id and not store.employee(conn, company, employee_id):
                raise missing()
            resource = (
                "payroll-list:" + table + (":" + employee_id if employee_id else "")
            )
            position = self.intake.security.read_cursor(
                cursor, resource, str(actor["id"]), company
            )
            rows = store.list_rows(
                conn, company, table, position, limit + 1, employee_id
            )
            return response(
                {
                    "items": [present(r) for r in rows[:limit]],
                    "next_cursor": self.intake.security.cursor(
                        resource, str(actor["id"]), company, rows[limit - 1]
                    )
                    if len(rows) > limit
                    else None,
                }
            )
        if op == "getPayrollEmployeeDetails":
            person = store.employee(conn, company, ids["employee_id"])
            if not person:
                raise missing()
            resource = "payroll-employee-payments:" + ids["employee_id"]
            position = self.intake.security.read_cursor(
                cursor, resource, str(actor["id"]), company
            )
            content = store.employee_details(conn, company, person, position, limit)
            next_row = content.pop("_next_payment_row")
            content["payment_next_cursor"] = (
                self.intake.security.cursor(
                    resource, str(actor["id"]), company, next_row
                )
                if next_row
                else None
            )
            return response({"content": content})
        if op == "getPayrollSummary":
            return response(store.summary(conn, company))
        if op in ("createPayrollEmployee", "updatePayrollEmployee"):
            employee_profile(body["profile"])
            old = (
                store.employee(conn, company, ids["employee_id"], True)
                if op == "updatePayrollEmployee"
                else None
            )
            if op == "updatePayrollEmployee":
                if not old:
                    raise missing()
                if old["row_version"] != expected:
                    raise conflict()
            row = store.save_employee(conn, company, body, actor_id, old)
            return response(
                store.employee_view(row), 200 if old else 201, etag=row["row_version"]
            )
        if op == "createPayrollContract":
            person = store.employee(conn, company, body["employee_id"], True)
            if not person:
                raise missing()
            contract_content(body["content"])
            start, end = (
                valid_date(body["effective_from"]),
                valid_date(body["effective_to"]) if body["effective_to"] else None,
            )
            if start < valid_date(person["profile"]["hired_on"]) or (
                end and end < start
            ):
                raise PayrollValidation("invalid_contract_dates")
            row = conn.execute(
                "INSERT INTO app.payroll_contracts(company_id,employee_id,effective_from,effective_to,content,actor_id) VALUES(%s,%s,%s,%s,%s,%s) RETURNING *",
                (
                    company,
                    body["employee_id"],
                    start,
                    end,
                    Jsonb(body["content"]),
                    actor_id,
                ),
            ).fetchone()
            return response(store.contract_view(row), 201)
        if op == "savePayrollWork":
            if not store.employee(conn, company, body["employee_id"], True):
                raise missing()
            work_content(body["content"])
            start, end = (
                valid_date(body["period_start"]),
                valid_date(body["period_end"]),
            )
            if end < start or (end - start).days > 365:
                raise PayrollValidation("invalid_work_period")
            return response(
                store.work_view(store.save_work(conn, company, body, actor_id)), 201
            )
        if op == "createPayrollRule":
            validate_rules(body["content"])
            if not primary_sources(body["content"]["source_urls"]):
                raise PayrollValidation("primary_rule_sources_required")
            row = conn.execute(
                "INSERT INTO app.payroll_rule_sets(company_id,name,effective_from,effective_to,content,actor_id) VALUES(%s,%s,%s,%s,%s,%s) RETURNING *",
                (
                    company,
                    body["name"],
                    body["effective_from"],
                    body["effective_to"],
                    Jsonb(body["content"]),
                    actor_id,
                ),
            ).fetchone()
            return response(store.rule_view(conn, company, row), 201)
        if op == "validatePayrollRule":
            if access.role(company) != "finance_manager":
                raise forbidden()
            rule = conn.execute(
                "SELECT * FROM app.payroll_rule_sets WHERE company_id=%s AND id=%s",
                (company, ids["rule_id"]),
            ).fetchone()
            if not rule:
                raise missing()
            checked = []
            for fixture in body["fixtures"]:
                if any(
                    not isinstance(fixture.get(k), dict)
                    for k in ("contract", "work", "expected")
                ):
                    raise PayrollValidation("invalid_rule_fixture")
                contract_content(fixture["contract"])
                work_content(fixture["work"])
                result = calculate(
                    fixture["contract"],
                    fixture["work"],
                    rule["content"],
                    kind=fixture.get("kind", "monthly"),
                )
                targets = fixture.get("expected", {})
                if not targets or any(result.get(k) != v for k, v in targets.items()):
                    raise PayrollValidation("rule_fixture_mismatch")
                checked.append(
                    {
                        "input_hash": digest(fixture),
                        "result_hash": digest(result),
                        "matched_fields": sorted(targets),
                    }
                )
            conn.execute(
                "INSERT INTO app.payroll_rule_reviews(company_id,rule_id,actor_id,reference,fixture_results) VALUES(%s,%s,%s,%s,%s)",
                (company, rule["id"], actor_id, body["reference"], Jsonb(checked)),
            )
            return response(store.rule_view(conn, company, rule), 201)
        if op == "createPayrollRun":
            return self._create_run(conn, company, actor_id, body)
        if op in (
            "getPayrollRun",
            "approvePayrollRun",
            "recordPayrollPayment",
            "exportPayrollRun",
            "linkPayrollFinancial",
            "getPayrollFinancialOptions",
        ):
            conn.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                (company + ":payroll-approval",),
            )
            run = conn.execute(
                "SELECT * FROM app.payroll_runs WHERE company_id=%s AND id=%s",
                (company, ids["payroll_run_id"]),
            ).fetchone()
            if not run:
                raise missing()
            view = store.run_view(conn, company, run)
            if op == "getPayrollRun":
                return response(view)
            if op == "approvePayrollRun":
                return self._approve(conn, company, actor_id, run, view, access)
            if op == "getPayrollFinancialOptions":
                from .payroll_financial import financial_options

                return response({"content": financial_options(conn, company, run)})
            if op == "linkPayrollFinancial":
                if not view["approved"]:
                    raise conflict("payroll_not_approved")
                from .payroll_financial import link_financial

                return response(
                    {"content": link_financial(conn, company, actor_id, run, body)}, 201
                )
            if op == "recordPayrollPayment":
                return self._payment(conn, company, actor_id, run, view, body)
            if body["format"] in ("insurance", "tax"):
                raise ApiError(
                    409,
                    "official_payroll_export_not_verified",
                    "قالب رسمی خروجی بیمه یا مالیات هنوز اعتبارسنجی نشده است.",
                )
            from ..adapters.payroll_export import export_run

            data, media, suffix = export_run(
                view | {"company_name": access.company(company)["name"]},
                body["format"],
                self.intake.settings,
            )
            return response(
                {
                    "filename": "payroll-" + str(run["id"]) + "." + suffix,
                    "media_type": media,
                    "data_base64": base64.b64encode(data).decode(),
                    "sha256": hashlib.sha256(data).hexdigest(),
                }
            )
        if op == "previewPayrollImport":
            data, content = parse_import(
                body,
                lambda employee_id, code: store.resolve_import_employee(
                    conn, company, employee_id, code
                ),
            )
            row = conn.execute(
                "INSERT INTO app.payroll_import_previews(company_id,actor_id,content,input_hash,original_bytes,original_name) VALUES(%s,%s,%s,%s,%s,%s) RETURNING *",
                (
                    company,
                    actor_id,
                    Jsonb(content),
                    hashlib.sha256(data).hexdigest(),
                    data,
                    body["filename"],
                ),
            ).fetchone()
            return response({k: row[k] for k in ("id", "input_hash", "content")}, 201)
        if op == "commitPayrollImport":
            preview = conn.execute(
                "SELECT * FROM app.payroll_import_previews WHERE company_id=%s AND id=%s",
                (company, ids["preview_id"]),
            ).fetchone()
            if not preview:
                raise missing()
            conn.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                (company + ":payroll-import",),
            )
            if preview["content"]["errors"]:
                raise conflict("payroll_import_has_errors")
            if conn.execute(
                "SELECT 1 FROM app.payroll_import_commits WHERE company_id=%s AND preview_id=%s",
                (company, preview["id"]),
            ).fetchone():
                raise conflict("payroll_import_already_committed")
            for row in preview["content"]["rows"]:
                if preview["content"]["kind"] == "employees":
                    store.save_employee(conn, company, row, actor_id)
                else:
                    if not store.employee(conn, company, row["employee_id"], True):
                        raise missing()
                    store.save_work(conn, company, row, actor_id)
            conn.execute(
                "INSERT INTO app.payroll_import_commits(company_id,preview_id,actor_id) VALUES(%s,%s,%s)",
                (company, preview["id"], actor_id),
            )
            return response({"ok": True})
        raise missing()
