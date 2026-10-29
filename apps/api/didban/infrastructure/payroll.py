"""Company-scoped payroll persistence; immutable runs and append-only inputs."""

from __future__ import annotations
from decimal import Decimal
from datetime import date
from psycopg.types.json import Jsonb
from ..domain.settlements import exact_context


def resolve_import_employee(conn, company, employee_id, personnel_code):
    """Resolve only inside the authorized company; both identifiers must agree."""
    from ..domain.payroll.calculation import PayrollValidation

    rows = conn.execute(
        """SELECT id,personnel_code,profile->>'name' AS employee_name
        FROM app.payroll_employees WHERE company_id=%s
        AND (id=%s::uuid OR personnel_code=nullif(%s,''))""",
        (company, employee_id or None, personnel_code),
    ).fetchall()
    by_id = next((r for r in rows if str(r["id"]) == employee_id), None)
    by_code = next((r for r in rows if r["personnel_code"] == personnel_code), None)
    if employee_id and not by_id:
        raise PayrollValidation("employee_id_not_found")
    if personnel_code and not by_code:
        raise PayrollValidation("personnel_code_not_found")
    if by_id and by_code and by_id["id"] != by_code["id"]:
        raise PayrollValidation("employee_identity_mismatch")
    row = by_id or by_code
    if not row:
        raise PayrollValidation("employee_identity_required")
    return {
        "employee_id": str(row["id"]),
        "personnel_code": row["personnel_code"],
        "employee_name": row["employee_name"],
    }


def employee_view(row):
    return {
        "id": row["id"],
        "personnel_code": row["personnel_code"],
        "profile": row["profile"],
        "version": row["row_version"],
    }


def contract_view(row):
    return {
        k: row[k]
        for k in ("id", "employee_id", "effective_from", "effective_to", "content")
    }


def work_view(row):
    return {
        k: row[k]
        for k in (
            "id",
            "employee_id",
            "period_start",
            "period_end",
            "content",
            "revision",
        )
    }


def rule_view(conn, company, row):
    reviewed = bool(
        conn.execute(
            "SELECT 1 FROM app.payroll_rule_reviews WHERE company_id=%s AND rule_id=%s",
            (company, row["id"]),
        ).fetchone()
    )
    return {
        k: row[k] for k in ("id", "name", "effective_from", "effective_to", "content")
    } | {
        "reviewed": reviewed,
        "legal_verified": bool(
            conn.execute(
                "SELECT 1 FROM app.payroll_legal_reviews r WHERE company_id=%s AND rule_id=%s AND NOT EXISTS(SELECT 1 FROM app.payroll_legal_revocations v WHERE v.company_id=r.company_id AND v.review_id=r.id)",
                (company, row["id"]),
            ).fetchone()
        ),
    }


def run_view(conn, company, row):
    approved = bool(
        conn.execute(
            "SELECT 1 FROM app.payroll_run_approvals WHERE company_id=%s AND run_id=%s",
            (company, row["id"]),
        ).fetchone()
    )
    return {
        k: row[k]
        for k in (
            "id",
            "period_start",
            "period_end",
            "kind",
            "rule_id",
            "input_hash",
            "content",
            "supersedes_id",
            "created_at",
        )
    } | {"approved": approved}


def list_rows(conn, company, table, position=None, limit=100, employee_id=None):
    allowed = {
        "payroll_employees",
        "payroll_contracts",
        "payroll_work_records",
        "payroll_rule_sets",
        "payroll_runs",
    }
    if table not in allowed:
        raise ValueError("unsupported_payroll_table")
    after = " AND (created_at,id)>(%s,%s)" if position else ""
    clause = (
        " AND content->'employee_ids' ? %s"
        if employee_id and table == "payroll_runs"
        else " AND employee_id=%s"
        if employee_id
        else ""
    )
    params = [company]
    if employee_id:
        params.append(employee_id)
    if position:
        params.extend(position)
    params.append(limit)
    return conn.execute(
        "SELECT * FROM app."
        + table
        + " WHERE company_id=%s"
        + clause
        + after
        + " ORDER BY created_at,id LIMIT %s",
        params,
    ).fetchall()


def employee(conn, company, employee_id, lock=False):
    return conn.execute(
        "SELECT * FROM app.payroll_employees WHERE company_id=%s AND id=%s"
        + (" FOR UPDATE" if lock else ""),
        (company, employee_id),
    ).fetchone()


def save_employee(conn, company, body, actor, existing=None):
    if existing:
        row = conn.execute(
            "UPDATE app.payroll_employees SET personnel_code=%s,profile=%s,changed_by=%s WHERE company_id=%s AND id=%s RETURNING *",
            (
                body["personnel_code"].strip(),
                Jsonb(body["profile"]),
                actor,
                company,
                existing["id"],
            ),
        ).fetchone()
    else:
        row = conn.execute(
            "INSERT INTO app.payroll_employees(company_id,personnel_code,profile,changed_by) VALUES(%s,%s,%s,%s) RETURNING *",
            (company, body["personnel_code"].strip(), Jsonb(body["profile"]), actor),
        ).fetchone()
    conn.execute(
        "INSERT INTO app.payroll_employee_history(company_id,employee_id,actor_id,profile,version) VALUES(%s,%s,%s,%s,%s)",
        (company, row["id"], actor, Jsonb(body), row["row_version"]),
    )
    return row


def save_work(conn, company, body, actor):
    conn.execute(
        "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
        (company + ":payroll-work:" + str(body["employee_id"]),),
    )
    return conn.execute(
        """INSERT INTO app.payroll_work_records(company_id,employee_id,period_start,period_end,content,actor_id,revision)
    SELECT %s,%s,%s,%s,%s,%s,coalesce(max(revision),0)+1 FROM app.payroll_work_records WHERE company_id=%s AND employee_id=%s AND period_start=%s AND period_end=%s RETURNING *""",
        (
            company,
            body["employee_id"],
            body["period_start"],
            body["period_end"],
            Jsonb(body["content"]),
            actor,
            company,
            body["employee_id"],
            body["period_start"],
            body["period_end"],
        ),
    ).fetchone()


@exact_context
def summary(conn, company):
    import jdatetime
    from datetime import timedelta

    today = conn.execute(
        "SELECT (clock_timestamp() AT TIME ZONE timezone)::date AS day FROM app.companies WHERE id=%s",
        (company,),
    ).fetchone()["day"]
    jalali = jdatetime.date.fromgregorian(date=today)
    period_start = jdatetime.date(jalali.year, jalali.month, 1).togregorian()
    next_month = (
        jdatetime.date(jalali.year + 1, 1, 1)
        if jalali.month == 12
        else jdatetime.date(jalali.year, jalali.month + 1, 1)
    )
    period_end = min(today, next_month.togregorian() - timedelta(days=1))
    movement = conn.execute(
        "SELECT count(*) FILTER(WHERE (profile->>'hired_on')::date BETWEEN %s AND %s) AS hires,count(*) FILTER(WHERE nullif(profile->>'ended_on','')::date BETWEEN %s AND %s) AS departures FROM app.payroll_employees WHERE company_id=%s",
        (period_start, period_end, period_start, period_end, company),
    ).fetchone()
    active = conn.execute(
        "SELECT count(*) AS n FROM app.payroll_employees e JOIN app.companies c ON c.id=e.company_id WHERE e.company_id=%s AND (e.profile->>'hired_on')::date<=(clock_timestamp() AT TIME ZONE c.timezone)::date AND (e.profile->>'ended_on' IS NULL OR e.profile->>'ended_on'='' OR (e.profile->>'ended_on')::date>=(clock_timestamp() AT TIME ZONE c.timezone)::date)",
        (company,),
    ).fetchone()["n"]
    runs = conn.execute(
        """SELECT r.* FROM app.payroll_runs r JOIN app.payroll_run_approvals a ON a.company_id=r.company_id AND a.run_id=r.id
    WHERE r.company_id=%s""",
        (company,),
    ).fetchall()
    paid = conn.execute(
        "SELECT coalesce(sum(amount),0) AS amount,count(DISTINCT employee_id) AS n FROM app.payroll_payment_links WHERE company_id=%s",
        (company,),
    ).fetchone()
    totals = {
        key: sum(
            (
                Decimal(r["content"].get("delta_totals", r["content"]["totals"])[key])
                for r in runs
            ),
            Decimal(0),
        )
        for key in ("gross", "net", "employer_cost")
    }
    return {
        "active_employees": active,
        "period_start": str(period_start),
        "period_end": str(period_end),
        "hires": movement["hires"],
        "departures": movement["departures"],
        "employees_paid": paid["n"],
        "approved_runs": len(runs),
        **{k: str(v) for k, v in totals.items()},
        "paid": str(paid["amount"]),
        "unpaid": str(totals["net"] - paid["amount"]),
    }


@exact_context
def payroll_analysis_snapshot(conn, company, as_of_date):
    if not conn.execute(
        "SELECT app.payroll_allowed(%s,'view') AS allowed", (company,)
    ).fetchone()["allowed"]:
        return {"status": "unavailable", "reason": "payroll_permission_required"}
    period_rows = conn.execute(
        "SELECT DISTINCT r.period_start,r.period_end FROM app.payroll_runs r JOIN app.payroll_run_approvals a ON a.company_id=r.company_id AND a.run_id=r.id WHERE r.company_id=%s AND r.period_end<=%s AND r.kind='monthly' ORDER BY r.period_end DESC,r.period_start DESC LIMIT 2",
        (company, as_of_date),
    ).fetchall()
    periods = [(r["period_start"], r["period_end"]) for r in period_rows]
    rows = []
    for start, end in periods:
        rows.extend(
            conn.execute(
                "SELECT r.* FROM app.payroll_runs r JOIN app.payroll_run_approvals a ON a.company_id=r.company_id AND a.run_id=r.id WHERE r.company_id=%s AND r.period_start=%s AND r.period_end=%s AND r.kind='monthly' ORDER BY r.created_at,r.id",
                (company, start, end),
            ).fetchall()
        )
    result = []
    for period in periods:
        selected = [r for r in rows if (r["period_start"], r["period_end"]) == period]
        cost = sum(
            (
                Decimal(
                    r["content"].get("delta_totals", r["content"]["totals"])[
                        "employer_cost"
                    ]
                )
                for r in selected
            ),
            Decimal(0),
        )
        ids = sorted(
            {item["employee_id"] for r in selected for item in r["content"]["items"]}
        )
        current_items = {}
        for selected_run in selected:
            for item in selected_run["content"]["items"]:
                current_items[item["employee_id"]] = item
        components = {}
        for item in current_items.values():
            for line in item["result"]["lines"]:
                if line["key"] == "unpaid_wages_carry":
                    continue
                components[line["key"]] = components.get(
                    line["key"], Decimal(0)
                ) + Decimal(line["amount"])
            components["employer_insurance"] = components.get(
                "employer_insurance", Decimal(0)
            ) + Decimal(item["result"]["employer_insurance"])
        result.append(
            {
                "components": {k: str(v) for k, v in components.items()},
                "period_start": period[0].isoformat(),
                "period_end": period[1].isoformat(),
                "employer_cost": str(cost),
                "employee_count": len(ids),
                "run_ids": [str(r["id"]) for r in selected],
                "employee_scope": ids,
            }
        )
    comparable = (
        len(result) == 2
        and result[0]["employee_scope"] == result[1]["employee_scope"]
        and (periods[0][1] - periods[0][0]).days == (periods[1][1] - periods[1][0]).days
    )
    return {
        "status": "available" if comparable else "limited" if result else "unavailable",
        "reason": None if comparable else "comparison_scope_or_period_missing",
        "periods": result,
        "basis": "approved_payroll_runs",
    }


@exact_context
def employee_details(conn, company, person, position=None, limit=100):
    cutoff = conn.execute(
        "SELECT (clock_timestamp() AT TIME ZONE timezone)::date AS day FROM app.companies WHERE id=%s",
        (company,),
    ).fetchone()["day"]
    rows = conn.execute(
        "SELECT r.* FROM app.payroll_runs r JOIN app.payroll_run_approvals a ON a.company_id=r.company_id AND a.run_id=r.id WHERE r.company_id=%s AND r.period_end<=%s AND r.content->'employee_ids' ? %s ORDER BY r.period_end DESC,a.created_at DESC",
        (company, cutoff, str(person["id"])),
    ).fetchall()
    net = Decimal(0)
    latest_scopes = {}
    latest_leave = None
    for row in rows:
        item = next(
            i for i in row["content"]["items"] if i["employee_id"] == str(person["id"])
        )
        net += (
            Decimal(row["content"]["delta_items"][str(person["id"])])
            if "delta_items" in row["content"]
            else Decimal(item["result"]["net"])
        )
        opening_cutoff = person["profile"].get("opening_as_of")
        if not opening_cutoff or row["period_end"] > date.fromisoformat(opening_cutoff):
            latest_scopes.setdefault(
                (row["period_start"], row["period_end"], row["kind"]), item
            )
        if latest_leave is None and row["kind"] in ("monthly", "termination"):
            latest_leave = {
                "days": item["result"]["leave_balance_days"],
                "as_of_date": str(row["period_end"]),
            }
    paid = conn.execute(
        "SELECT coalesce(sum(amount),0) AS amount FROM app.payroll_payment_links WHERE company_id=%s AND employee_id=%s AND paid_on<=%s",
        (company, person["id"], cutoff),
    ).fetchone()["amount"]
    recovered = {
        key: sum(
            (Decimal(i["result"].get(key, "0")) for i in latest_scopes.values()),
            Decimal(0),
        )
        for key in ("loan_installment", "advance_offset")
    }
    history = conn.execute(
        "SELECT profile,version,created_at FROM app.payroll_employee_history WHERE company_id=%s AND employee_id=%s ORDER BY created_at,id",
        (company, person["id"]),
    ).fetchall()
    after = " AND (created_at,id)>(%s,%s)" if position else ""
    payments = conn.execute(
        "SELECT id,amount,paid_on,reference,created_at FROM app.payroll_payment_links WHERE company_id=%s AND employee_id=%s"
        + after
        + " ORDER BY created_at,id LIMIT %s",
        (company, person["id"], *position, limit + 1)
        if position
        else (company, person["id"], limit + 1),
    ).fetchall()
    return {
        "as_of_date": str(cutoff),
        "approved_run_count": len(rows),
        "contract_count": conn.execute(
            "SELECT count(*) AS n FROM app.payroll_contracts WHERE company_id=%s AND employee_id=%s",
            (company, person["id"]),
        ).fetchone()["n"],
        "work_count": conn.execute(
            "SELECT count(*) AS n FROM app.payroll_work_records WHERE company_id=%s AND employee_id=%s",
            (company, person["id"]),
        ).fetchone()["n"],
        "history_run_count": conn.execute(
            "SELECT count(*) AS n FROM app.payroll_runs WHERE company_id=%s AND content->'employee_ids' ? %s",
            (company, str(person["id"])),
        ).fetchone()["n"],
        "net": str(net),
        "paid": str(paid),
        "unpaid": str(net - paid),
        "loan_remaining": str(
            max(
                Decimal(0),
                Decimal(person["profile"]["opening_loan"])
                - recovered["loan_installment"],
            )
        )
        if "opening_loan" in person["profile"]
        else None,
        "advance_remaining": str(
            max(
                Decimal(0),
                Decimal(person["profile"]["opening_advance"])
                - recovered["advance_offset"],
            )
        )
        if "opening_advance" in person["profile"]
        else None,
        "leave": latest_leave
        or {
            "days": person["profile"].get("opening_leave_days"),
            "as_of_date": person["profile"].get("opening_as_of"),
            "basis": "opening",
        },
        "payments": [
            {k: str(p[k]) for k in ("id", "amount", "paid_on", "reference")}
            for p in payments[:limit]
        ],
        "_next_payment_row": payments[limit - 1] if len(payments) > limit else None,
        "profile_versions": [
            {"version": r["version"], "created_at": str(r["created_at"])}
            for r in history
        ],
    }
