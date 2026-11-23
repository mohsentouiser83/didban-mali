"""Archived imports preserve the source bytes and the uploader's access boundary."""

from test_api_delivery import scenario


def test_table_and_chart_originals_are_recoverable_only_by_uploader(tmp_path):
    scenario(
        tmp_path,
        r"""
owner = client_for("owner")
manager = client_for("finance_manager")
viewer = client_for("viewer")
outsider = client_for("outsider")
path = base + "/document-archive/spreadsheets"
content = b"code,name\n101,Test chart\n"

def archive(client, key=None):
    return client.post(path, files={"file": ("sample.csv", content)}, headers={"Idempotency-Key": key or str(uuid4())})

key = str(uuid4())
response = archive(owner, key)
assert response.status_code == 201, response.text
spreadsheet = response.json()
assert spreadsheet == archive(owner, key).json() == archive(owner).json()
assert set(spreadsheet) == {"id", "name", "origin", "size", "created_at"}
assert spreadsheet["origin"] == "table" and spreadsheet["size"] == len(content)
assert archive(viewer).status_code == 403
assert owner.post(path, files={"file": ("invalid.pdf", b"%PDF-1.6")}, headers={"Idempotency-Key": str(uuid4())}).status_code == 415
download = path + "/" + spreadsheet["id"] + "/download"
assert owner.get(download).content == content
assert owner.get(download).headers["content-disposition"].startswith("attachment; ")
assert manager.get(download).status_code == 404
assert outsider.get(download).status_code == 404
assert manager.get(path).json()["items"] == []
chart_path = base + "/accounting/setup/chart-file"
chart_content = "کد حساب,نام حساب,ماهیت\n101,موجودی,بدهکار\n".encode()
chart = owner.post(chart_path, files={"file": ("chart.csv", chart_content)})
assert chart.status_code == 200, chart.text
files = owner.get(path).json()["items"]
assert [item["origin"] for item in files] == ["chart", "table"], files
assert owner.get(path + "/" + files[0]["id"] + "/download").content == chart_content
""",
    )
