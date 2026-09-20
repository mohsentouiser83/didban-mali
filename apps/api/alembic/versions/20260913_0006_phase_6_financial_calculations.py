"""phase 6 financial calculations

Revision ID: 20260913_0006
Revises: 57635d980143
Create Date: 2026-09-13 07:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260913_0006"
down_revision: str | None = "57635d980143"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "analysis_runs",
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "QUEUED",
                "PROCESSING",
                "COMPLETED",
                "COMPLETED_LIMITED",
                "FAILED",
                name="analysis_status",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column("input_manifest_json", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column("rule_set_version", sa.String(length=80), nullable=False),
        sa.Column("coverage_json", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("created_by", sa.UUID(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failure_code", sa.String(length=80), nullable=True),
        sa.Column("failure_message", sa.Text(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("period_start <= period_end", name="ck_analysis_run_period"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "company_id", "idempotency_key", name="uq_analysis_run_company_idempotency"
        ),
        sa.UniqueConstraint("id", "company_id", name="uq_analysis_run_company"),
    )
    op.create_index(
        "ix_analysis_runs_company_period",
        "analysis_runs",
        ["company_id", "period_start", "period_end"],
    )
    op.create_index("ix_analysis_runs_company_status", "analysis_runs", ["company_id", "status"])
    op.create_index("ix_analysis_runs_created_by", "analysis_runs", ["created_by"])
    op.create_table(
        "metric_observations",
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("analysis_run_id", sa.UUID(), nullable=False),
        sa.Column(
            "metric_code",
            sa.Enum(
                "REVENUE_IRR",
                "EXPENSES_IRR",
                "NET_PROFIT_IRR",
                "NET_MARGIN_RATIO",
                "TOTAL_ASSETS_IRR",
                "TOTAL_LIABILITIES_IRR",
                "TOTAL_EQUITY_IRR",
                "NET_CASH_MOVEMENT_IRR",
                "SALES_INVOICED_IRR",
                "SALES_COLLECTED_IRR",
                "SALES_OUTSTANDING_IRR",
                name="metric_code",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("value_irr", sa.Numeric(precision=20, scale=0), nullable=True),
        sa.Column("value_ratio", sa.Numeric(precision=12, scale=6), nullable=True),
        sa.Column("calculation_json", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column("calculated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.CheckConstraint(
            "(value_irr IS NOT NULL AND value_ratio IS NULL) OR "
            "(value_irr IS NULL AND value_ratio IS NOT NULL)",
            name="ck_metric_exactly_one_value",
        ),
        sa.CheckConstraint("period_start <= period_end", name="ck_metric_period"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["analysis_run_id", "company_id"],
            ["analysis_runs.id", "analysis_runs.company_id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "analysis_run_id", "metric_code", name="uq_metric_observation_run_code"
        ),
    )
    op.create_index(
        "ix_metric_observations_company_period",
        "metric_observations",
        ["company_id", "period_start", "period_end"],
    )
    op.create_index("ix_metric_observations_run", "metric_observations", ["analysis_run_id"])

    op.execute("ALTER TABLE public.analysis_runs ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE public.analysis_runs FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY analysis_runs_select ON public.analysis_runs FOR SELECT "
        "USING (private.has_company_role(company_id, "
        "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','VIEWER']))"
    )
    op.execute(
        "CREATE POLICY analysis_runs_insert ON public.analysis_runs FOR INSERT "
        "WITH CHECK (created_by = private.current_user_id() AND "
        "private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']))"
    )
    op.execute(
        "CREATE POLICY analysis_runs_update ON public.analysis_runs FOR UPDATE "
        "USING (private.has_company_role(company_id, "
        "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR'])) "
        "WITH CHECK (private.has_company_role(company_id, "
        "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']))"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON public.analysis_runs TO didban_app")

    op.execute("ALTER TABLE public.metric_observations ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE public.metric_observations FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY metric_observations_select ON public.metric_observations FOR SELECT "
        "USING (private.has_company_role(company_id, "
        "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','VIEWER']))"
    )
    op.execute(
        "CREATE POLICY metric_observations_insert ON public.metric_observations FOR INSERT "
        "WITH CHECK (private.has_company_role(company_id, "
        "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']))"
    )
    op.execute("GRANT SELECT, INSERT ON public.metric_observations TO didban_app")


def downgrade() -> None:
    op.drop_index("ix_metric_observations_run", table_name="metric_observations")
    op.drop_index("ix_metric_observations_company_period", table_name="metric_observations")
    op.drop_table("metric_observations")
    op.drop_index("ix_analysis_runs_created_by", table_name="analysis_runs")
    op.drop_index("ix_analysis_runs_company_status", table_name="analysis_runs")
    op.drop_index("ix_analysis_runs_company_period", table_name="analysis_runs")
    op.drop_table("analysis_runs")
