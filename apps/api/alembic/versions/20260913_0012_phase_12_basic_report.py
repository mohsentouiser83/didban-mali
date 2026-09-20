"""phase 12 basic report

Revision ID: 20260913_0012
Revises: 20260913_0011
Create Date: 2026-09-13 14:20:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260913_0012"
down_revision: str | None = "20260913_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "report_snapshots",
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("analysis_run_id", sa.UUID(), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("title_fa", sa.String(length=200), nullable=False),
        sa.Column("advisor_note", sa.Text(), nullable=True),
        sa.Column("payload_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "QUEUED",
                "PROCESSING",
                "COMPLETED",
                "FAILED",
                name="report_status",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("stage", sa.String(length=80), nullable=False),
        sa.Column("object_key", sa.String(length=500), nullable=True),
        sa.Column("pdf_sha256", sa.String(length=64), nullable=True),
        sa.Column("pdf_size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("created_by", sa.UUID(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failure_code", sa.String(length=80), nullable=True),
        sa.Column("failure_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.CheckConstraint("period_start <= period_end", name="ck_report_snapshot_period"),
        sa.CheckConstraint("progress >= 0 AND progress <= 100", name="ck_report_progress"),
        sa.CheckConstraint(
            "(status = 'COMPLETED' AND object_key IS NOT NULL AND pdf_sha256 IS NOT NULL "
            "AND pdf_size_bytes > 0 AND completed_at IS NOT NULL) OR "
            "(status <> 'COMPLETED' AND object_key IS NULL AND pdf_sha256 IS NULL "
            "AND pdf_size_bytes IS NULL)",
            name="ck_report_completed_artifact",
        ),
        sa.CheckConstraint(
            "advisor_note IS NULL OR (char_length(trim(advisor_note)) > 0 "
            "AND char_length(advisor_note) <= 4000)",
            name="ck_report_advisor_note_length",
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["analysis_run_id", "company_id"],
            ["analysis_runs.id", "analysis_runs.company_id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "company_id", name="uq_report_snapshot_company"),
        sa.UniqueConstraint("company_id", "idempotency_key", name="uq_report_company_idempotency"),
        sa.UniqueConstraint("object_key"),
    )
    op.create_index(
        "ix_report_snapshots_company_created",
        "report_snapshots",
        ["company_id", "created_at", "id"],
    )
    op.create_index(
        "ix_report_snapshots_company_analysis",
        "report_snapshots",
        ["company_id", "analysis_run_id"],
    )
    op.create_index("ix_report_snapshots_created_by", "report_snapshots", ["created_by"])
    op.execute("ALTER TABLE public.report_snapshots ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE public.report_snapshots FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY report_snapshots_select ON public.report_snapshots FOR SELECT "
        "USING (private.has_company_role(company_id, "
        "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','VIEWER']))"
    )
    op.execute(
        "CREATE POLICY report_snapshots_insert ON public.report_snapshots FOR INSERT "
        "WITH CHECK (created_by = private.current_user_id() AND "
        "private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']))"
    )
    op.execute(
        "CREATE POLICY report_snapshots_update ON public.report_snapshots FOR UPDATE "
        "USING (created_by = private.current_user_id() AND status IN ('QUEUED','PROCESSING') "
        "AND private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR'])) "
        "WITH CHECK (created_by = private.current_user_id() AND "
        "private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']))"
    )
    op.execute("GRANT SELECT, INSERT ON public.report_snapshots TO didban_app")
    op.execute(
        "GRANT UPDATE (status, progress, stage, object_key, pdf_sha256, pdf_size_bytes, "
        "started_at, completed_at, failure_code, failure_message) "
        "ON public.report_snapshots TO didban_app"
    )


def downgrade() -> None:
    op.drop_index("ix_report_snapshots_created_by", table_name="report_snapshots")
    op.drop_index("ix_report_snapshots_company_analysis", table_name="report_snapshots")
    op.drop_index("ix_report_snapshots_company_created", table_name="report_snapshots")
    op.drop_table("report_snapshots")
