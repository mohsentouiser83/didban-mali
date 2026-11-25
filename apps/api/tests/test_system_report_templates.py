"""Editable system definitions keep tenant, version, financial and snapshot boundaries."""

from copy import deepcopy

import pytest
from sqlalchemy import func, select
from test_posting import approval, data
from test_posting import book as book

from didban import models as m
from didban.accounting_service import save_draft
from didban.errors import DomainError
from didban.posting_service import post_batch
from didban.report_builder_models import SavedReportDefinition
from didban.report_studio_schemas import StudioLayoutSpec, StudioUpdateDefinitionInput
from didban.report_studio_service import get_definition, list_definitions, preview, save
from didban.system_report_templates import definitions


def test_defaults_are_stable_company_scoped_and_listing_does_not_write(book):
    first = list_definitions(book, "c")
    assert len(first) == 5
    assert first == list_definitions(book, "c")
    assert all(row["can_delete"] is False for row in first)
    assert not {row["id"] for row in first} & {row["id"] for row in list_definitions(book, "other")}
    assert book.scalar(select(func.count()).select_from(SavedReportDefinition)) == 0


def test_edit_updates_same_system_template_and_rejects_stale_or_foreign_versions(book):
    default = definitions("c")[0]
    original = deepcopy(default["spec"])
    layout = StudioLayoutSpec.model_validate(original)
    layout.global_filters.period_id = "p"
    layout.title = "روزنامه ویرایش‌شده"
    payload = StudioUpdateDefinitionInput(name=layout.title, spec=layout)
    owner = book.get(m.User, "owner")
    result = save(book, "c", owner, payload, default["id"], 1)
    assert result["id"] == default["id"] and result["version"] == 2
    assert result["system_key"] == "journals" and result["can_delete"] is False
    assert len(list_definitions(book, "c")) == 5
    assert get_definition(book, "c", result["id"])["spec"]["title"] == layout.title
    with pytest.raises(DomainError, match="تغییر") as stale:
        save(book, "c", owner, payload, default["id"], 1)
    assert stale.value.status == 409
    with pytest.raises(DomainError) as foreign:
        get_definition(book, "other", default["id"])
    assert foreign.value.status == 404
    assert definitions("c")[0]["spec"] == original


def test_journal_template_uses_only_final_period_journals_and_exact_toman(book):
    user = book.get(m.User, "finance_manager")
    draft = save_draft(book, "c", user, data(book))
    posted = post_batch(book, "c", user, [approval(book, draft)])["items"][0]
    save_draft(book, "c", user, data(book, amount="1"))
    spec = StudioLayoutSpec.model_validate(definitions("c")[0]["spec"])
    spec.global_filters.period_id = "p"
    widget = spec.sections[0].widgets[0]
    widget.unit, widget.limit = "TOMAN", 1
    result = preview(book, "c", spec)["sections"][0]["widgets"][0]["data"]
    assert result["rows"][0]["debit"] == "9007199254740993"
    assert result["total_count"] == 2 and len(result["rows"]) == 1
    assert result["source"]["journal_ids"] == [posted["id"]]
    spec.global_filters.date_from = "2026-11-02"
    assert preview(book, "c", spec)["sections"][0]["widgets"][0]["data"]["total_count"] == 0


def test_all_default_sources_render_without_inventing_missing_financial_data(book):
    for definition in definitions("c"):
        spec = StudioLayoutSpec.model_validate(definition["spec"])
        spec.global_filters.period_id = "p"
        result = preview(book, "c", spec)
        assert result["sections"]
        if definition["system_key"] == "statements":
            metrics = result["sections"][0]["widgets"][0]["data"]["rows"]
            missing = [row for row in metrics if row["value"] is None]
            assert missing and all(row["reason"] for row in missing)
        elif definition["system_key"] in {"dimensions", "payroll", "cashflow"}:
            table = result["sections"][0]["widgets"][0]["data"]
            assert table["rows"] == [] and table["reason"]


def test_cash_template_keeps_missing_balance_and_exact_unit_conversion(book):
    book.add(
        m.ResultManifest(
            id="cash",
            company_id="c",
            period_id="p",
            session_id="session",
            digest="cash-digest",
            selection={},
            metrics=[],
            details={
                "daily_cash": [
                    {"date": "2026-11-01", "inflow": "90071992547409931", "outflow": "0", "balance": None},
                ]
            },
        )
    )
    book.flush()
    spec = StudioLayoutSpec.model_validate(definitions("c")[-1]["spec"])
    spec.global_filters.period_id = "p"
    spec.sections[0].widgets[0].unit = "TOMAN"
    table = preview(book, "c", spec)["sections"][0]["widgets"][0]["data"]
    assert table["rows"][0]["inflow"] == "9007199254740993.1"
    assert table["rows"][0]["balance"] is None and table["reason"]
    spec.global_filters.date_from = "invalid"
    with pytest.raises(DomainError) as invalid:
        preview(book, "c", spec)
    assert invalid.value.code == "invalid_report_date"


def test_edit_does_not_mutate_a_previously_selected_fixed_dashboard(book):
    from didban.report_studio_service import get_active_dashboard

    user = book.get(m.User, "finance_manager")
    draft = save_draft(book, "c", user, data(book, amount="10"))
    post_batch(book, "c", user, [approval(book, draft)])
    definition = definitions("c")[0]
    layout = StudioLayoutSpec.model_validate(definition["spec"])
    layout.global_filters.period_id = "p"
    saved = save(
        book,
        "c",
        user,
        StudioUpdateDefinitionInput(name="روزنامه", spec=layout, is_dashboard=True),
        definition["id"],
        1,
    )
    frozen = deepcopy(get_active_dashboard(book, "c", "p")["dashboard"])
    next_draft = save_draft(book, "c", user, data(book, amount="20"))
    post_batch(book, "c", user, [approval(book, next_draft)])
    layout.sections[0].title = "عنوان تازه"
    save(
        book,
        "c",
        user,
        StudioUpdateDefinitionInput(name="قالب تازه", spec=layout),
        saved["id"],
        saved["version"],
    )
    assert get_active_dashboard(book, "c", "p")["dashboard"] == frozen
    assert preview(book, "c", layout)["sections"][0]["widgets"][0]["data"]["total_count"] == 4
