"""Validate dates and prepare statements from immutable report source selections."""

from ..domain.financial import FinancialRow, PeriodSpec
from ..domain.financial.common import day
from ..domain.management import management_report
from ..domain.management.templates import validate_template
from ..errors import ApiError
from .financial_questions import declarations
from .report_scope import pin_report_metrics, pin_trial_balance_metrics


def build_management(conn, company, content, options=None):
    options = options or {}
    manifest = content["manifest"]
    period = conn.execute(
        "SELECT * FROM app.financial_periods WHERE company_id=%s AND id=%s",
        (company, manifest["period_id"]),
    ).fetchone()
    previous = conn.execute(
        "SELECT * FROM app.financial_periods WHERE company_id=%s AND id=%s",
        (company, period["previous_period_id"]),
    ).fetchone()
    original = PeriodSpec(
        str(period["id"]),
        period["starts_on"],
        period["ends_on"],
        day(str(manifest["as_of_date"])),
    )
    start = day(options.get("starts_on", str(original.starts_on)))
    cutoff = day(options.get("as_of_date", str(original.cutoff)))
    if (
        not original.starts_on <= start <= cutoff <= original.cutoff
        or (cutoff - start).days >= 1096
    ):
        raise ApiError(
            422,
            "report_dates_out_of_scope",
            "بازه گزارش باید داخل دوره و تا تاریخ نسخه داده، حداکثر سه سال باشد.",
        )
    if options.get("template"):
        try:
            validate_template(options["template"])
        except ValueError as exc:
            raise ApiError(422, "invalid_statement_template", str(exc)) from None
    source_names = {
        str(source["id"]): source["original_name"] for source in content["sources"]
    }
    rows = [
        FinancialRow(
            str(r["id"]),
            str(r["source_row_id"]),
            str(r["source_file_id"]),
            str(r["interpretation_id"]),
            r["sheet_name"],
            r["row_number"],
            r["source_kind"],
            r["canonical_values"],
            r["state"],
            tuple(r["error_codes"]),
            source_names.get(str(r["source_file_id"])),
        )
        for r in content["rows"]
    ]
    context = conn.execute(
        "SELECT financial_context FROM app.processing_sessions WHERE company_id=%s AND id=%s",
        (company, manifest["session_id"]),
    ).fetchone()
    previous_spec = (
        PeriodSpec(str(previous["id"]), previous["starts_on"], previous["ends_on"])
        if previous
        else None
    )
    declared = declarations(
        rows, original, previous_spec, context["financial_context"].get("answers", {})
    )
    if previous_spec and start != original.starts_on:
        from datetime import timedelta

        shifted = previous_spec.starts_on + timedelta(
            days=(start - original.starts_on).days
        )
        previous_spec = (
            PeriodSpec(previous_spec.id, shifted, previous_spec.ends_on)
            if shifted <= previous_spec.ends_on
            else None
        )
    # Calculations are captured alongside pinned source rows and answer dependencies;
    # subsequent edits cannot recompute or change an existing report edition.
    selected_period = PeriodSpec(original.id, start, original.ends_on, cutoff)
    management = management_report(
        content,
        rows,
        selected_period,
        previous_spec,
        declared,
        options,
    )

    comparison = previous_spec
    if comparison and management["analysis"]["comparison_as_of_date"]:
        comparison = PeriodSpec(
            comparison.id,
            comparison.starts_on,
            comparison.ends_on,
            day(management["analysis"]["comparison_as_of_date"]),
        )
    elif comparison:
        comparison = None
    pin_report_metrics(content, rows, selected_period, comparison, declared)
    pin_trial_balance_metrics(content, management)
    return management
