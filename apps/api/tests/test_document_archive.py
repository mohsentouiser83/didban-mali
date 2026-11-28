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


def test_company_documents_merge_pages_without_exposing_private_originals(tmp_path):
    scenario(
        tmp_path,
        r"""
from datetime import datetime, timezone
from didban.bot_intake_models import BotIntake
from didban.document_archive_models import ArchivedSpreadsheet

stamp = datetime(2026, 9, 5, 10, tzinfo=timezone.utc)
with transaction("company-a") as db:
    for actor in ("owner", "finance_manager"):
        connection = m.BotConnection(
            company_ref="company-a", user_id=users[actor],
            provider="telegram", expires_at=stamp,
        )
        db.add(connection)
        db.flush()
        db.add_all([
            ArchivedSpreadsheet(
                id=actor, company_id="company-a", actor_id=users[actor],
                created_at=stamp, name=f"{actor}.csv", origin="chart",
                sha256="a"*64, size=100, scan_status="clean", content=b"file",
            ),
            BotIntake(
                id=actor, company_id="company-a", actor_id=users[actor],
                created_at=stamp, name=f"{actor}.pdf", kind="pdf",
                provider="telegram", update_id=actor, connection_id=connection.id,
                sha256="b"*64, size=200, scan_status="clean",
                storage_key=actor, state="awaiting_review",
            ),
        ])
    db.add(m.SourceFile(
        id="owner", company_id="company-a", session_id=source_session,
        created_at=stamp, name="processing.csv", sha256="c"*64, size=300,
        storage_key="processing", row_count=4, scan_status="clean",
    ))

path = base + "/document-archive"
owner = client_for("owner")
page = owner.get(path, params={"limit": 1}).json()
items = list(page["items"])
for _ in range(2):
    assert page["next_cursor"]
    response = owner.get(path, params={"limit": 1, "cursor": page["next_cursor"]})
    assert response.status_code == 200, response.text
    page = response.json()
    items.extend(page["items"])
assert not page["next_cursor"]
assert [item["kind"] for item in items] == ["spreadsheet", "source", "bot"]
assert [item["name"] for item in items] == ["owner.csv", "processing.csv", "owner.pdf"]
assert all("storage_key" not in item and "actor_id" not in item for item in items)
assert items[1]["row_count"] == 4 and items[1]["period_name"] == "شهریور"
assert items[2]["state"] == "awaiting_review"
assert [item["name"] for item in client_for("viewer").get(path).json()["items"]] == ["processing.csv"]
assert client_for("outsider").get(path).status_code == 404
assert owner.get(path, params={"cursor": "bad"}).status_code == 422
""",
    )
