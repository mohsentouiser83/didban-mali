from test_api_delivery import scenario


def test_module_overrides_take_priority_per_company_and_operation(tmp_path):
    scenario(
        tmp_path,
        r"""
owner, viewer, manager = (client_for(role) for role in ("owner", "viewer", "finance_manager"))
periods = base + "/financial-periods"
viewer_path = base + "/members/" + members["viewer"]
manager_path = base + "/members/" + members["finance_manager"]
new_period = {"name": "مهر", "start": "2026-10-01", "end": "2026-10-31"}

assert command(viewer, "POST", periods, new_period).status_code == 403
assert command(viewer, "PATCH", viewer_path, {"module_access": {"periods": {"create": True}}}).status_code == 403
assert command(owner, "PATCH", viewer_path, {"module_access": {"unknown": {"create": True}}}).status_code == 422
grant = command(owner, "PATCH", viewer_path, {"module_access": {"periods": {"create": True, "view": False}}})
assert grant.status_code == 200, grant.text
assert command(owner, "PATCH", viewer_path, {"module_access": {}}).status_code == 409
assert viewer.get(periods).json()["code"] == "module_access_denied"
assert viewer.get(periods + "/options").json()["items"][0]["id"] == period_id
created = command(viewer, "POST", periods, new_period)
assert created.status_code == 201, created.text
detail = periods + "/" + created.json()["id"]
assert command(viewer, "PATCH", detail, new_period | {"name": "مهر جدید"}).status_code == 403
assert command(viewer, "DELETE", detail).status_code == 403
assert viewer.get(base + "/reports").status_code == 200

with transaction() as db:
    db.add(m.Membership(company_id="company-b", user_id=users["viewer"], role="viewer"))
    event = db.scalar(select(m.AuditEvent).where(m.AuditEvent.entity_id == members["viewer"], m.AuditEvent.action == "membership.changed"))
    assert event.details["before"] == {"module_access": {}}
    assert event.details["after"]["module_access"]["periods"]["view"] is False
assert viewer.get("/api/v1/companies/company-b/financial-periods").status_code == 200
assert command(viewer, "POST", "/api/v1/companies/company-b/financial-periods", new_period).status_code == 403

denied = command(owner, "PATCH", manager_path, {"module_access": {"periods": {"delete": False}, "reports": {"create": False}}})
assert denied.status_code == 200, denied.text
assert command(manager, "DELETE", detail).json()["code"] == "module_access_denied"
assert approve(manager).status_code in (200, 201)
restored = command(owner, "PATCH", manager_path, {"module_access": {}}, version=2)
assert restored.status_code == 200, restored.text
assert command(manager, "DELETE", detail).status_code == 200
""",
    )


def test_initial_password_minimum_is_enforced_by_account_creation(tmp_path):
    scenario(
        tmp_path,
        r"""
owner = client_for("owner")
body = {"email": "new@example.test", "name": "عضو جدید"}
assert command(owner, "POST", "/api/v1/admin/users", body | {"password": "12345678901"}).status_code == 422
assert command(owner, "POST", "/api/v1/admin/users", body | {"password": "123456789012"}).status_code == 201
""",
    )
