"""An optional latest report is empty content, without hiding access failures."""

from test_api_delivery import scenario


def test_optional_latest_result_preserves_scope_and_existing_reports(tmp_path):
    scenario(tmp_path, r'''
owner=client_for("owner")
outsider=client_for("outsider")
empty="/api/v1/companies/company-b/results/latest"
response=outsider.get(empty+"?view=summary&allow_missing=true")
assert response.status_code==204,response.text
assert response.content==b""
assert response.headers["cache-control"]=="no-store"
required=outsider.get(empty)
assert required.status_code==404 and required.json()["code"]=="no_result"
assert owner.get(empty+"?allow_missing=true").status_code==404
assert TestClient(app).get(empty+"?allow_missing=true").status_code==401
existing=owner.get(base+"/results/latest?view=summary")
optional=owner.get(base+"/results/latest?view=summary&allow_missing=true")
assert optional.status_code==200 and optional.json()==existing.json()
period=command(owner,"POST",base+"/financial-periods",{"name":"بدون گزارش","start":"2026-10-01","end":"2026-10-31"})
assert period.status_code==201,period.text
response=owner.get(base+"/results/latest",params={"period_id":period.json()["id"],"allow_missing":"true"})
assert response.status_code==204,response.text
''')
