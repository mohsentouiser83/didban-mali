"""Historical company preferences cannot block the integrated product."""

from test_api_delivery import scenario


def test_old_settings_are_retained_without_operational_gates(tmp_path):
    scenario(
        tmp_path,
        r"""
owner=client_for("owner"); viewer=client_for("viewer"); outsider=client_for("outsider")
with transaction("company-a") as db:
    db.add(m.CompanyModule(company_id="company-a",key="cashflow",enabled=False))
    db.add(m.CompanyModule(company_id="company-a",key="employees",enabled=False))
assert owner.get(base+"/modules").status_code==404
assert command(owner,"PATCH",base+"/modules/cashflow",{"enabled":True}).status_code==404
assert viewer.get(base+"/planned-payments").status_code==200
assert outsider.get(base+"/planned-payments").status_code==404
assert viewer.get(base+"/employee-reports").status_code==200
assert owner.get(base+f"/reports/{report_ids[0]}").status_code==200
with transaction("company-a") as db:
    assert db.scalar(select(m.CompanyModule).where(m.CompanyModule.key=="cashflow")).enabled is False
""",
    )
