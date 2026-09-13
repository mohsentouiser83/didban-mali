"""phase 8 finding engine

Revision ID: 20260913_0008
Revises: 20260913_0007
Create Date: 2026-09-13 09:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260913_0008"
down_revision: str | None = "20260913_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_reconciliation_match_company", "reconciliation_matches", ["id", "company_id"]
    )
    op.create_table(
        "finding_generation_runs",
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("analysis_run_id", sa.UUID(), nullable=False),
        sa.Column("reconciliation_run_id", sa.UUID(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "QUEUED",
                "PROCESSING",
                "COMPLETED",
                "COMPLETED_LIMITED",
                "FAILED",
                name="finding_run_status",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column("config_version", sa.String(length=80), nullable=False),
        sa.Column("config_json", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column("coverage_json", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column("counts_json", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("created_by", sa.UUID(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failure_code", sa.String(length=80), nullable=True),
        sa.Column("failure_message", sa.Text(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["analysis_run_id", "company_id"],
            ["analysis_runs.id", "analysis_runs.company_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["reconciliation_run_id", "company_id"],
            ["reconciliation_runs.id", "reconciliation_runs.company_id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "company_id",
            "idempotency_key",
            name="uq_finding_generation_company_idempotency",
        ),
        sa.UniqueConstraint("id", "company_id", name="uq_finding_generation_run_company"),
    )
    op.create_index(
        "ix_finding_generation_analysis", "finding_generation_runs", ["analysis_run_id"]
    )
    op.create_index(
        "ix_finding_generation_company_status",
        "finding_generation_runs",
        ["company_id", "status"],
    )
    op.create_index("ix_finding_generation_created_by", "finding_generation_runs", ["created_by"])
    op.create_index(
        "ix_finding_generation_reconciliation",
        "finding_generation_runs",
        ["reconciliation_run_id"],
    )
    op.create_table(
        "findings",
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("analysis_run_id", sa.UUID(), nullable=False),
        sa.Column("generation_run_id", sa.UUID(), nullable=False),
        sa.Column("reconciliation_match_id", sa.UUID(), nullable=True),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column(
            "finding_code",
            sa.Enum(
                "POTENTIAL_MISSING_TRANSACTION",
                "DUPLICATE_TRANSACTION",
                "AMOUNT_MISMATCH",
                "DATE_MISMATCH",
                "REVENUE_DROP",
                "PROFIT_DROP",
                "EXPENSE_INCREASE",
                "RECEIVABLES_INCREASE",
                name="finding_code",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "kind",
            sa.Enum(
                "RISK",
                "ANOMALY",
                "DISCREPANCY",
                "INSIGHT",
                name="finding_kind",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "category",
            sa.Enum(
                "RECONCILIATION",
                "FINANCIAL_ANALYSIS",
                name="finding_category",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column("title_fa", sa.String(length=240), nullable=False),
        sa.Column("summary_fa", sa.Text(), nullable=False),
        sa.Column(
            "assertion_status",
            sa.Enum(
                "DETERMINISTIC",
                "HYPOTHESIS",
                name="assertion_status",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "severity",
            sa.Enum(
                "HIGH",
                "MEDIUM",
                "LOW",
                name="finding_severity",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column("confidence_score", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("confidence_basis_json", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column("affected_amount_irr", sa.Numeric(precision=20, scale=0), nullable=True),
        sa.Column("affected_ratio", sa.Numeric(precision=12, scale=6), nullable=True),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("reason_code", sa.String(length=100), nullable=False),
        sa.Column("reason_parameters_json", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column("calculation_json", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column("rule_version", sa.String(length=80), nullable=False),
        sa.Column(
            "workflow_status",
            sa.Enum(
                "NEEDS_REVIEW",
                "CONFIRMED",
                "DISMISSED",
                "FOLLOW_UP",
                "RESOLVED",
                name="finding_workflow_status",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "confidence_score >= 0 AND confidence_score <= 100",
            name="ck_finding_confidence_range",
        ),
        sa.ForeignKeyConstraint(
            ["analysis_run_id", "company_id"],
            ["analysis_runs.id", "analysis_runs.company_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["generation_run_id", "company_id"],
            ["finding_generation_runs.id", "finding_generation_runs.company_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["reconciliation_match_id", "company_id"],
            ["reconciliation_matches.id", "reconciliation_matches.company_id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("analysis_run_id", "fingerprint", name="uq_finding_run_fingerprint"),
    )
    op.create_index("ix_findings_company_code", "findings", ["company_id", "finding_code"])
    op.create_index(
        "ix_findings_company_period",
        "findings",
        ["company_id", "period_start", "period_end"],
    )
    op.create_index("ix_findings_company_workflow", "findings", ["company_id", "workflow_status"])
    op.create_index("ix_findings_generation_run", "findings", ["generation_run_id"])
    op.create_index("ix_findings_reconciliation_match", "findings", ["reconciliation_match_id"])

    op.execute("ALTER TABLE public.finding_generation_runs ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE public.finding_generation_runs FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY finding_generation_runs_select ON public.finding_generation_runs "
        "FOR SELECT USING (private.has_company_role(company_id, "
        "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','VIEWER']))"
    )
    op.execute(
        "CREATE POLICY finding_generation_runs_insert ON public.finding_generation_runs "
        "FOR INSERT WITH CHECK (created_by = private.current_user_id() AND "
        "private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']))"
    )
    op.execute(
        "CREATE POLICY finding_generation_runs_update ON public.finding_generation_runs "
        "FOR UPDATE USING (private.has_company_role(company_id, "
        "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR'])) "
        "WITH CHECK (private.has_company_role(company_id, "
        "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']))"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON public.finding_generation_runs TO didban_app")

    op.execute("ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE public.findings FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY findings_select ON public.findings FOR SELECT "
        "USING (private.has_company_role(company_id, "
        "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','VIEWER']))"
    )
    op.execute(
        "CREATE POLICY findings_insert ON public.findings FOR INSERT "
        "WITH CHECK (private.has_company_role(company_id, "
        "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']))"
    )
    op.execute("GRANT SELECT, INSERT ON public.findings TO didban_app")


def downgrade() -> None:
    op.drop_index("ix_findings_reconciliation_match", table_name="findings")
    op.drop_index("ix_findings_generation_run", table_name="findings")
    op.drop_index("ix_findings_company_workflow", table_name="findings")
    op.drop_index("ix_findings_company_period", table_name="findings")
    op.drop_index("ix_findings_company_code", table_name="findings")
    op.drop_table("findings")
    op.drop_index("ix_finding_generation_reconciliation", table_name="finding_generation_runs")
    op.drop_index("ix_finding_generation_created_by", table_name="finding_generation_runs")
    op.drop_index("ix_finding_generation_company_status", table_name="finding_generation_runs")
    op.drop_index("ix_finding_generation_analysis", table_name="finding_generation_runs")
    op.drop_table("finding_generation_runs")
    op.drop_constraint("uq_reconciliation_match_company", "reconciliation_matches", type_="unique")
