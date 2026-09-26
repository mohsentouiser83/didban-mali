"""phase 2 calculation engine

Revision ID: 20260923_0017
Revises: 20260920_0016
Create Date: 2026-09-23 12:35:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260923_0017"
down_revision: str | None = "20260920_0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. calculation_runs table
    op.create_table(
        "calculation_runs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("as_of_date", sa.Date(), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("engine_version", sa.String(length=80), nullable=False),
        sa.Column(
            "status",
            sa.String(length=40),
            nullable=False,
        ),
        sa.Column("trigger_source", sa.String(length=80), nullable=False, server_default="manual"),
        sa.Column("triggered_by", sa.UUID(), nullable=True),
        sa.Column("summary_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failure_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("period_start <= period_end", name="ck_calc_run_period"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["triggered_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "company_id", name="uq_calc_run_company"),
    )
    op.create_index(
        "ix_calculation_runs_company_date",
        "calculation_runs",
        ["company_id", "as_of_date"],
    )
    op.create_index(
        "ix_calculation_runs_company_status",
        "calculation_runs",
        ["company_id", "status"],
    )

    # 2. metric_results table
    op.create_table(
        "metric_results",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("calculation_run_id", sa.UUID(), nullable=False),
        sa.Column("metric_key", sa.String(length=80), nullable=False),
        sa.Column("metric_version", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("value_numeric", sa.Numeric(precision=24, scale=4), nullable=True),
        sa.Column("unit", sa.String(length=40), nullable=False),
        sa.Column("as_of_date", sa.Date(), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=True),
        sa.Column("period_end", sa.Date(), nullable=True),
        sa.Column("coverage_score", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("confidence", sa.String(length=20), nullable=False, server_default="high"),
        sa.Column("input_record_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("excluded_record_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("warnings", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("evidence_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("input_record_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("calculated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["calculation_run_id", "company_id"],
            ["calculation_runs.id", "calculation_runs.company_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("calculation_run_id", "metric_key", name="uq_metric_result_run_key"),
    )
    op.create_index(
        "ix_metric_results_company_metric",
        "metric_results",
        ["company_id", "metric_key", "as_of_date"],
    )
    op.create_index(
        "ix_metric_results_run_id",
        "metric_results",
        ["calculation_run_id"],
    )

    # 3. financial_policies table
    op.create_table(
        "financial_policies",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("dso_period_days", sa.Integer(), nullable=False, server_default="90"),
        sa.Column("dso_method", sa.String(length=40), nullable=False, server_default="strict"),
        sa.Column("burn_trailing_days", sa.Integer(), nullable=False, server_default="90"),
        sa.Column("default_reporting_unit", sa.String(length=40), nullable=False, server_default="toman"),
        sa.Column("excluded_internal_transfer_accounts", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", name="uq_financial_policy_company"),
    )

    # 4. RLS & Permissions
    roles = "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','ANALYST','VIEWER']"
    manage_roles = "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']"

    for table in ("calculation_runs", "metric_results", "financial_policies"):
        op.execute(
            f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY"
        )
        op.execute(
            f"CREATE POLICY {table}_tenant_select ON public.{table} FOR SELECT "
            f"USING (private.has_company_role(company_id, {roles}))"
        )
        op.execute(
            f"CREATE POLICY {table}_tenant_modify ON public.{table} FOR ALL "
            f"USING (private.has_company_role(company_id, {manage_roles}))"
        )
        op.execute(
            f"GRANT SELECT, INSERT, UPDATE, DELETE ON public.{table} TO didban_app"
        )


def downgrade() -> None:
    op.drop_table("financial_policies")
    op.drop_table("metric_results")
    op.drop_table("calculation_runs")
