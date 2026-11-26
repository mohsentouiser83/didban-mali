"""D36 confidentiality enforcement across Report Studio previews, PDF exports, fixed/live dashboards, and custom blocks."""

from pathlib import Path


def test_report_studio_and_custom_blocks_enforce_d36_payroll_access(tmp_path: Path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.accounting_models import AccountingPermission
from didban.system_report_templates import definitions

with transaction("company-a") as db:
    ps = m.ProcessingSession(
        company_id="company-a",
        period_id=period_id,
        actor_id=users["finance_manager"],
        state="completed",
    )
    db.add(ps)
    db.flush()
    sf = m.SourceFile(
        company_id="company-a",
        session_id=ps.id,
        name="payroll.xlsx",
        sha256="b" * 64,
        size=100,
        storage_key="k",
        scan_status="clean",
        row_count=1,
    )
    db.add(sf)
    db.flush()
    sr = m.SourceRow(
        company_id="company-a",
        file_id=sf.id,
        sheet="Sheet1",
        row_number=2,
        values={},
    )
    db.add(sr)
    db.flush()
    db.add(
        m.PersonnelRecord(
            company_id="company-a",
            session_id=ps.id,
            source_row_id=sr.id,
            kind="payroll",
            employee_id="EMP-101",
            employee_name="سارا رضایی",
            date=date(2026, 9, 15),
            original_unit="IRR",
            original_amount="45000000",
            values={
                "gross_pay": "50000000",
                "payroll_tax": "3000000",
                "employee_insurance": "2000000",
                "employer_insurance": "10000000",
                "other_deductions": "0",
                "net_pay": "45000000",
            },
        )
    )
    db.add(
        m.ResultManifest(
            company_id="company-a",
            session_id=ps.id,
            period_id=period_id,
            digest="c" * 64,
            selection={"row_ids": [sr.id], "period": {"start": "2026-09-01", "end": "2026-09-30"}},
            metrics=[{"metric_key": "cash", "label": "نقد", "value": "100", "unit": "IRR"}],
            details={},
        )
    )
    db.flush()

fm = client_for("finance_manager")
owner = client_for("owner")
advisor = client_for("advisor")
viewer = client_for("viewer")

company_defs = definitions("company-a")
payroll_tpl = next(d for d in company_defs if d["system_key"] == "payroll")
payroll_spec = dict(payroll_tpl["spec"])
payroll_spec["global_filters"] = dict(payroll_spec["global_filters"], period_id=period_id)

journals_tpl = next(d for d in company_defs if d["system_key"] == "journals")
journals_spec = dict(journals_tpl["spec"])
journals_spec["global_filters"] = dict(journals_spec["global_filters"], period_id=period_id)

# 1. Finance manager can preview payroll report and sees employee-level data
fm_prev = fm.post(base + "/report-studio/preview", json={"spec": payroll_spec})
assert fm_prev.status_code == 200, fm_prev.text
fm_rows = fm_prev.json()["sections"][0]["widgets"][0]["data"]["rows"]
assert len(fm_rows) == 1
assert fm_rows[0]["employee_name"] == "سارا رضایی"
assert fm_rows[0]["net_pay"] == "45000000"

# 2. Save payroll template and configure FIXED dashboard as finance manager
save_res = command(
    fm,
    "PATCH",
    f"{base}/report-studio/definitions/{payroll_tpl['id']}",
    {"name": "گزارش محرمانه حقوق", "spec": payroll_spec, "is_dashboard": True},
    version=1,
)
assert save_res.status_code == 200, save_res.text

# 3. Finance manager gets PDF export and fixed active dashboard
fm_pdf = fm.get(f"{base}/report-studio/definitions/{payroll_tpl['id']}/export?period_id={period_id}")
assert fm_pdf.status_code == 200
assert fm_pdf.content.startswith(b"%PDF")

fm_dash = fm.get(base + "/report-studio/active-dashboard")
assert fm_dash.status_code == 200
assert fm_dash.json()["mode"] == "fixed"
assert fm_dash.json()["dashboard"]["sections"][0]["widgets"][0]["data"]["rows"][0]["employee_id"] == "EMP-101"

# 4. Owner (without view_payroll), Advisor (without view_payroll), and Viewer are ALL blocked with 403
for role_name, client in (("owner", owner), ("advisor", advisor), ("viewer", viewer)):
    prev_r = client.post(base + "/report-studio/preview", json={"spec": payroll_spec})
    assert prev_r.status_code == 403, (role_name, prev_r.text)
    assert prev_r.json()["code"] == "payroll_access_required"

    pdf_r = client.get(f"{base}/report-studio/definitions/{payroll_tpl['id']}/export?period_id={period_id}")
    assert pdf_r.status_code == 403, (role_name, pdf_r.text)
    assert pdf_r.json()["code"] == "payroll_access_required"

    dash_r = client.get(base + "/report-studio/active-dashboard")
    assert dash_r.status_code == 403, (role_name, dash_r.text)
    assert dash_r.json()["code"] == "payroll_access_required"

    blk_r = client.post(
        base + "/report-builder/block-preview",
        json={"period_id": period_id, "block": {"entity_type": "personnel_records", "visualization": "data_table"}},
    )
    assert blk_r.status_code == 403, (role_name, blk_r.text)
    assert blk_r.json()["code"] == "payroll_access_required"

    # Non-payroll public report still works as usual!
    pub_r = client.post(base + "/report-studio/preview", json={"spec": journals_spec})
    assert pub_r.status_code == 200, (role_name, pub_r.text)

# 5. Grant view_payroll to advisor -> advisor can now read fixed dashboard, live dashboard, preview, PDF, and custom block
with transaction("company-a") as db:
    db.add(
        AccountingPermission(
            company_id="company-a",
            membership_id=members["advisor"],
            post_journal=False,
            reopen_period=False,
            view_payroll=True,
        )
    )

assert advisor.get(base + "/report-studio/active-dashboard").status_code == 200
assert advisor.post(base + "/report-studio/preview", json={"spec": payroll_spec}).status_code == 200
assert advisor.get(f"{base}/report-studio/definitions/{payroll_tpl['id']}/export?period_id={period_id}").status_code == 200
adv_blk = advisor.post(
    base + "/report-builder/block-preview",
    json={"period_id": period_id, "block": {"entity_type": "personnel_records", "visualization": "data_table"}},
)
assert adv_blk.status_code == 200
assert adv_blk.json()["rows"][0]["employee_name"] == "سارا رضایی"

# Switch active dashboard to LIVE mode and verify advisor sees it
set_live = command(fm, "POST", f"{base}/report-studio/definitions/{payroll_tpl['id']}/set-dashboard?mode=live")
assert set_live.status_code == 200
assert advisor.get(base + "/report-studio/active-dashboard").status_code == 200

# 6. Revoke view_payroll from advisor -> access to BOTH live and previously stored fixed dashboard is cut off, while history stays intact!
with transaction("company-a") as db:
    perm = db.scalar(
        select(AccountingPermission).where(
            AccountingPermission.company_id == "company-a",
            AccountingPermission.membership_id == members["advisor"],
        )
    )
    perm.view_payroll = False

assert advisor.get(base + "/report-studio/active-dashboard").status_code == 403
set_fixed = command(fm, "POST", f"{base}/report-studio/definitions/{payroll_tpl['id']}/set-dashboard?mode=fixed")
assert set_fixed.status_code == 200
assert advisor.get(base + "/report-studio/active-dashboard").status_code == 403

# Finance manager still sees stored fixed dashboard & personnel history intact
fm_still = fm.get(base + "/report-studio/active-dashboard")
assert fm_still.status_code == 200
assert fm_still.json()["dashboard"]["sections"][0]["widgets"][0]["data"]["rows"][0]["employee_name"] == "سارا رضایی"
""",
    )
