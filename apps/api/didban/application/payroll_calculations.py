"""Create immutable runs, validate current approval and record bounded payments."""

from __future__ import annotations
from decimal import Decimal
from psycopg.types.json import Jsonb
from ..errors import ApiError, missing, conflict
from ..infrastructure import payroll as store
from ..domain.payroll.calculation import calculate, PayrollValidation, number
from ..domain.payroll.validation import valid_date
from ..domain.payroll.fingerprint import digest
from .auth import response


class PayrollCalculationCommands:
    def _create_run(self, conn, company, actor, body):
        start, end = valid_date(body["period_start"]), valid_date(body["period_end"])
        if end < start or (end - start).days > 365:
            raise PayrollValidation("invalid_payroll_period")
        conn.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
            (company + ":payroll-approval",),
        )
        rule = conn.execute(
            "SELECT r.* FROM app.payroll_rule_sets r JOIN app.payroll_rule_reviews v ON v.company_id=r.company_id AND v.rule_id=r.id WHERE r.company_id=%s AND r.id=%s AND r.effective_from<=%s AND r.effective_to>=%s",
            (company, body["rule_id"], start, end),
        ).fetchone()
        if not rule:
            raise PayrollValidation("reviewed_effective_rules_required")
        previous = None
        if body["supersedes_id"]:
            previous = conn.execute(
                "SELECT r.* FROM app.payroll_runs r JOIN app.payroll_run_approvals a ON a.company_id=r.company_id AND a.run_id=r.id WHERE r.company_id=%s AND r.id=%s",
                (company, body["supersedes_id"]),
            ).fetchone()
            if (
                not previous
                or previous["kind"] != body["kind"]
                or previous["period_start"] != start
                or previous["period_end"] != end
                or sorted(body["employee_ids"])
                != sorted(i["employee_id"] for i in previous["content"]["items"])
            ):
                raise PayrollValidation("invalid_payroll_correction_scope")
        items = []
        for employee_id in body["employee_ids"]:
            person = store.employee(conn, company, employee_id, True)
            if not person:
                raise missing()
            if valid_date(person["profile"]["hired_on"]) > end or (
                person["profile"].get("ended_on")
                and valid_date(person["profile"]["ended_on"]) < start
            ):
                raise PayrollValidation("employee_outside_employment_period")
            contract = conn.execute(
                "SELECT * FROM app.payroll_contracts WHERE company_id=%s AND employee_id=%s AND effective_from<=%s AND (effective_to IS NULL OR effective_to>=%s) ORDER BY created_at DESC,id DESC LIMIT 1",
                (company, employee_id, start, end),
            ).fetchone()
            if not contract:
                raise PayrollValidation("effective_contract_required")
            employment_start = max(start, valid_date(person["profile"]["hired_on"]))
            employment_end = (
                min(end, valid_date(person["profile"]["ended_on"]))
                if person["profile"].get("ended_on")
                else end
            )
            if conn.execute(
                "SELECT 1 FROM app.payroll_contracts WHERE company_id=%s AND employee_id=%s AND effective_from>%s AND effective_from<=%s",
                (company, employee_id, start, end),
            ).fetchone():
                raise PayrollValidation("contract_changes_require_split_period")
            work = conn.execute(
                "SELECT * FROM app.payroll_work_records WHERE company_id=%s AND employee_id=%s AND period_start=%s AND period_end=%s ORDER BY revision DESC LIMIT 1",
                (company, employee_id, start, end),
            ).fetchone()
            if not work:
                raise PayrollValidation("work_record_required")
            inputs = dict(work["content"])
            if number(inputs["worked_days"]) > Decimal(
                (employment_end - employment_start).days + 1
            ):
                raise PayrollValidation("work_exceeds_employment_days")
            if number(inputs["period_days"]) != Decimal((end - start).days + 1):
                raise PayrollValidation("work_period_day_mismatch")
            if body["kind"] == "monthly":
                cutoff = person["profile"].get("opening_as_of")
                if cutoff and valid_date(cutoff) >= start:
                    raise PayrollValidation("opening_cutoff_overlaps_period")
                prior = conn.execute(
                    "SELECT r.id,r.content FROM app.payroll_runs r JOIN app.payroll_run_approvals a ON a.company_id=r.company_id AND a.run_id=r.id WHERE r.company_id=%s AND r.kind='monthly' AND r.period_end<%s AND r.content->'employee_ids' ? %s AND (%s::date IS NULL OR r.period_end>%s::date) ORDER BY r.period_end DESC,r.created_at DESC LIMIT 1",
                    (company, start, employee_id, cutoff, cutoff),
                ).fetchone()
                balance = (
                    next(
                        (
                            i["result"]["leave_balance_days"]
                            for i in prior["content"]["items"]
                            if i["employee_id"] == employee_id
                        ),
                        None,
                    )
                    if prior
                    else None
                )
                if balance is None:
                    if valid_date(person["profile"]["hired_on"]) < start and (
                        not person["profile"].get("opening_as_of")
                        or not person["profile"].get("opening_source")
                        or "opening_leave_days" not in person["profile"]
                    ):
                        raise PayrollValidation("opening_leave_balance_required")
                    balance = person["profile"].get("opening_leave_days", "0")
                    cutoff = person["profile"].get("opening_as_of")
                    if cutoff and valid_date(cutoff) >= start:
                        raise PayrollValidation("opening_cutoff_overlaps_period")
                if "leave_opening_days" in inputs and number(
                    inputs["leave_opening_days"]
                ) != number(balance):
                    raise PayrollValidation("leave_opening_mismatch")
                inputs["leave_opening_days"] = balance
                prior_runs = conn.execute(
                    "SELECT r.content,r.period_start,r.period_end,r.created_at FROM app.payroll_runs r JOIN app.payroll_run_approvals a ON a.company_id=r.company_id AND a.run_id=r.id WHERE r.company_id=%s AND r.kind='monthly' AND r.period_end<%s AND r.content->'employee_ids' ? %s ORDER BY r.created_at DESC",
                    (company, start, employee_id),
                ).fetchall()
                latest_scopes = {}
                for prior_run in prior_runs:
                    if cutoff and prior_run["period_end"] <= valid_date(cutoff):
                        continue
                    latest_scopes.setdefault(
                        (prior_run["period_start"], prior_run["period_end"]), prior_run
                    )
                for installment, opening in (
                    ("loan_installment", "opening_loan"),
                    ("advance_offset", "opening_advance"),
                ):
                    previous_recovered = sum(
                        (
                            number(
                                next(
                                    i
                                    for i in old["content"]["items"]
                                    if i["employee_id"] == employee_id
                                )["result"].get(installment, "0")
                            )
                            for old in latest_scopes.values()
                        ),
                        Decimal(0),
                    )
                    if number(
                        inputs.get(installment, "0")
                    ) + previous_recovered > number(
                        person["profile"].get(opening, "0")
                    ):
                        raise PayrollValidation("deduction_exceeds_opening_balance")
            if number(inputs.get("prior_paid_special", "0")) and not inputs.get(
                "prior_paid_reference"
            ):
                raise PayrollValidation("prior_paid_reference_required")
            result = calculate(
                contract["content"], inputs, rule["content"], kind=body["kind"]
            )
            items.append(
                {
                    "employee_id": employee_id,
                    "personnel_code": person["personnel_code"],
                    "profile": person["profile"],
                    "employee_version": person["row_version"],
                    "contract_id": str(contract["id"]),
                    "work_id": str(work["id"]),
                    "work_revision": work["revision"],
                    "effective_work": inputs,
                    "result": result,
                }
            )
        keys = (
            "gross",
            "net",
            "employer_cost",
            "employee_insurance",
            "employer_insurance",
            "tax",
            "deductions",
        )
        totals = {
            k: str(sum((Decimal(i["result"][k]) for i in items), Decimal(0)))
            for k in keys
        }
        legal_review = conn.execute(
            "SELECT * FROM app.payroll_legal_reviews r WHERE company_id=%s AND rule_id=%s AND NOT EXISTS(SELECT 1 FROM app.payroll_legal_revocations v WHERE v.company_id=r.company_id AND v.review_id=r.id)",
            (company, rule["id"]),
        ).fetchone()
        content = {
            "legal_verified": bool(
                legal_review
                and legal_review["rule_content_hash"] == digest(rule["content"])
            ),
            "legal_review_id": str(legal_review["id"]) if legal_review else None,
            "employee_ids": body["employee_ids"],
            "items": items,
            "totals": totals,
            "formula_version": "explicit-payroll-v1",
            "rule_snapshot": rule["content"],
            "rule_review_required": True,
        }
        if previous:
            content["delta_totals"] = {
                k: str(Decimal(totals[k]) - Decimal(previous["content"]["totals"][k]))
                for k in keys
            }
            content["delta_items"] = {
                i["employee_id"]: str(
                    Decimal(i["result"]["net"])
                    - Decimal(
                        next(
                            p
                            for p in previous["content"]["items"]
                            if p["employee_id"] == i["employee_id"]
                        )["result"]["net"]
                    )
                )
                for i in items
            }
        row = conn.execute(
            "INSERT INTO app.payroll_runs(company_id,period_start,period_end,kind,rule_id,input_hash,content,actor_id,supersedes_id) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
            (
                company,
                start,
                end,
                body["kind"],
                rule["id"],
                digest(content),
                Jsonb(content),
                actor,
                body["supersedes_id"],
            ),
        ).fetchone()
        return response(store.run_view(conn, company, row), 201)

    def _approve(self, conn, company, actor, run, view, access):
        if view["approved"]:
            raise conflict("payroll_already_approved")
        legal_review = conn.execute(
            "SELECT * FROM app.payroll_legal_reviews r WHERE company_id=%s AND rule_id=%s AND NOT EXISTS(SELECT 1 FROM app.payroll_legal_revocations v WHERE v.company_id=r.company_id AND v.review_id=r.id)",
            (company, run["rule_id"]),
        ).fetchone()
        if (
            not legal_review
            or not run["content"].get("legal_verified")
            or str(legal_review["id"]) != run["content"].get("legal_review_id")
            or legal_review["rule_content_hash"]
            != digest(run["content"]["rule_snapshot"])
        ):
            raise ApiError(
                409,
                "payroll_legal_pack_not_verified",
                "قواعد قانونی این محاسبه هنوز تأیید مستقل نشده است.",
            )
        for item in run["content"]["items"]:
            previous = conn.execute(
                """SELECT r.* FROM app.payroll_runs r JOIN app.payroll_run_approvals a ON a.company_id=r.company_id AND a.run_id=r.id
            WHERE r.company_id=%s AND r.period_start<=%s AND r.period_end>=%s AND r.kind=%s AND r.content->'employee_ids' ? %s ORDER BY a.created_at DESC LIMIT 1""",
                (
                    company,
                    run["period_end"],
                    run["period_start"],
                    run["kind"],
                    item["employee_id"],
                ),
            ).fetchone()
            if (previous and str(previous["id"]) != str(run["supersedes_id"])) or (
                run["supersedes_id"] and not previous
            ):
                raise conflict("payroll_scope_already_approved")
            live = store.employee(conn, company, item["employee_id"], True)
            if not live or live["row_version"] != item["employee_version"]:
                raise conflict("payroll_employee_changed")
            current_contract = conn.execute(
                "SELECT id FROM app.payroll_contracts WHERE company_id=%s AND employee_id=%s AND effective_from<=%s AND (effective_to IS NULL OR effective_to>=%s) ORDER BY created_at DESC,id DESC LIMIT 1",
                (company, item["employee_id"], run["period_start"], run["period_end"]),
            ).fetchone()
            changed_mid_period = conn.execute(
                "SELECT 1 FROM app.payroll_contracts WHERE company_id=%s AND employee_id=%s AND effective_from>%s AND effective_from<=%s",
                (company, item["employee_id"], run["period_start"], run["period_end"]),
            ).fetchone()
            if (
                not current_contract
                or str(current_contract["id"]) != item["contract_id"]
                or changed_mid_period
            ):
                raise conflict("payroll_contract_changed")
            if run["kind"] == "monthly":
                previous_leave = conn.execute(
                    "SELECT r.content FROM app.payroll_runs r JOIN app.payroll_run_approvals a ON a.company_id=r.company_id AND a.run_id=r.id WHERE r.company_id=%s AND r.kind='monthly' AND r.period_end<%s AND r.content->'employee_ids' ? %s ORDER BY r.period_end DESC,r.created_at DESC LIMIT 1",
                    (company, run["period_start"], item["employee_id"]),
                ).fetchone()
                current_opening = (
                    next(
                        (
                            i["result"]["leave_balance_days"]
                            for i in previous_leave["content"]["items"]
                            if i["employee_id"] == item["employee_id"]
                        ),
                        None,
                    )
                    if previous_leave
                    else live["profile"].get("opening_leave_days", "0")
                )
                if number(
                    item["effective_work"].get("leave_opening_days", "0")
                ) != number(current_opening):
                    raise conflict("payroll_leave_context_changed")
            recovery_rows = conn.execute(
                "SELECT r.* FROM app.payroll_runs r JOIN app.payroll_run_approvals a ON a.company_id=r.company_id AND a.run_id=r.id WHERE r.company_id=%s AND r.content->'employee_ids' ? %s ORDER BY a.created_at DESC",
                (company, item["employee_id"]),
            ).fetchall()
            recovery_scopes = {}
            for old in recovery_rows:
                scope = (old["period_start"], old["period_end"], old["kind"])
                if run["supersedes_id"] and scope == (
                    run["period_start"],
                    run["period_end"],
                    run["kind"],
                ):
                    continue
                cutoff = live["profile"].get("opening_as_of")
                if cutoff and old["period_end"] <= valid_date(cutoff):
                    continue
                recovery_scopes.setdefault(scope, old)
            for installment, opening in (
                ("loan_installment", "opening_loan"),
                ("advance_offset", "opening_advance"),
            ):
                recovered = sum(
                    (
                        number(
                            next(
                                i
                                for i in old["content"]["items"]
                                if i["employee_id"] == item["employee_id"]
                            )["result"].get(installment, "0")
                        )
                        for old in recovery_scopes.values()
                    ),
                    Decimal(0),
                )
                if recovered + number(item["result"].get(installment, "0")) > number(
                    live["profile"].get(opening, "0")
                ):
                    raise conflict("payroll_deduction_capacity_changed")
            latest = conn.execute(
                "SELECT id FROM app.payroll_work_records WHERE company_id=%s AND employee_id=%s AND period_start=%s AND period_end=%s ORDER BY revision DESC LIMIT 1",
                (company, item["employee_id"], run["period_start"], run["period_end"]),
            ).fetchone()
            if not latest or str(latest["id"]) != item["work_id"]:
                raise conflict("payroll_work_changed")
            if not run["supersedes_id"] and run["kind"] in (
                "eidi",
                "sanavat",
                "termination",
            ):
                earlier = conn.execute(
                    """SELECT r.content FROM app.payroll_runs r JOIN app.payroll_run_approvals a ON a.company_id=r.company_id AND a.run_id=r.id
                WHERE r.company_id=%s AND ((r.kind=%s) OR (r.kind='sanavat' AND %s='termination') OR (r.kind='termination' AND %s='sanavat')) AND r.period_start<=%s AND r.period_end>=%s AND r.content->'employee_ids' ? %s""",
                    (
                        company,
                        run["kind"],
                        run["kind"],
                        run["kind"],
                        run["period_end"],
                        run["period_start"],
                        item["employee_id"],
                    ),
                ).fetchall()
                if earlier:
                    raise conflict("payroll_special_period_overlap")
        authority = (
            "finance_manager"
            if access.role(company) == "finance_manager"
            else "explicit_payroll_permission"
        )
        conn.execute(
            "INSERT INTO app.payroll_run_approvals(company_id,run_id,actor_id,authority,legal_review_id) VALUES(%s,%s,%s,%s,%s)",
            (company, run["id"], actor, authority, legal_review["id"]),
        )
        return response(store.run_view(conn, company, run), 201)

    def _payment(self, conn, company, actor, run, view, body):
        if not view["approved"]:
            raise conflict("payroll_not_approved")
        item = next(
            (
                i
                for i in run["content"]["items"]
                if i["employee_id"] == body["employee_id"]
            ),
            None,
        )
        if not item:
            raise missing()
        capacity = (
            number(
                run["content"]["delta_items"][body["employee_id"]], nonnegative=False
            )
            if "delta_items" in run["content"]
            else number(item["result"]["net"])
        )
        paid = conn.execute(
            "SELECT coalesce(sum(amount),0) AS amount FROM app.payroll_payment_links WHERE company_id=%s AND run_id=%s AND employee_id=%s",
            (company, run["id"], body["employee_id"]),
        ).fetchone()["amount"]
        if number(body["amount"]) + paid > capacity:
            raise conflict("payroll_payment_exceeds_capacity")
        if body["bank_movement_id"]:
            bank = conn.execute(
                "SELECT * FROM app.bank_movements WHERE company_id=%s AND id=%s FOR UPDATE",
                (company, body["bank_movement_id"]),
            ).fetchone()
            if not bank:
                raise missing()
            # Imported bank amount/direction schema is deliberately read explicitly.
            used = conn.execute(
                "SELECT coalesce(sum(amount),0) AS amount FROM app.payroll_payment_links WHERE company_id=%s AND bank_movement_id=%s",
                (company, body["bank_movement_id"]),
            ).fetchone()["amount"]
            if Decimal(str(bank["amount"])) >= 0 or abs(
                Decimal(str(bank["amount"]))
            ) < used + number(body["amount"]):
                raise conflict("payroll_bank_capacity_or_direction")
        row = conn.execute(
            "INSERT INTO app.payroll_payment_links(company_id,run_id,employee_id,actor_id,amount,paid_on,reference,bank_movement_id) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
            (
                company,
                run["id"],
                body["employee_id"],
                actor,
                body["amount"],
                body["paid_on"],
                body["reference"],
                body["bank_movement_id"],
            ),
        ).fetchone()
        return response(
            {
                k: row[k]
                for k in (
                    "id",
                    "run_id",
                    "employee_id",
                    "amount",
                    "paid_on",
                    "reference",
                    "bank_movement_id",
                )
            },
            201,
        )
