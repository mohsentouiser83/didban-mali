from starlette.routing import Match

from app.imports.routes import router


def test_mapping_templates_reaches_static_route_before_batch_lookup():
    path = router.prefix + "/templates"
    path = path.replace("{company_id}", "00000000-0000-0000-0000-000000000001")
    scope = {"type": "http", "path": path, "method": "GET", "root_path": ""}
    matched = next(route for route in router.routes if route.matches(scope)[0] == Match.FULL)
    assert matched.name == "list_mapping_templates"
