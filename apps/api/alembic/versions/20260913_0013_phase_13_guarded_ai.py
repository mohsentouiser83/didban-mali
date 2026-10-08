"""phase 13 guarded AI assistance

Revision ID: 20260913_0013
Revises: 20260913_0012
Create Date: 2026-09-13 16:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260913_0013"
down_revision: str | None = "20260913_0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ai_company_setting_revisions",
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("explanations_enabled", sa.Boolean(), nullable=False),
        sa.Column("semantic_matching_enabled", sa.Boolean(), nullable=False),
        sa.Column("created_by", sa.UUID(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "company_id", "idempotency_key", name="uq_ai_setting_company_idempotency"
        ),
    )
    op.create_index(
        "ix_ai_setting_company_created",
        "ai_company_setting_revisions",
        ["company_id", "created_at", "id"],
    )
    op.create_index("ix_ai_setting_created_by", "ai_company_setting_revisions", ["created_by"])

    op.create_table(
        "ai_invocations",
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column(
            "purpose",
            sa.Enum(
                "FINDING_EXPLANATION",
                "SEMANTIC_MATCHING",
                name="ai_purpose",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "DISABLED",
                "SUCCEEDED",
                "FAILED",
                "INVALID_OUTPUT",
                name="ai_invocation_status",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column("source_finding_id", sa.UUID(), nullable=True),
        sa.Column("source_reconciliation_run_id", sa.UUID(), nullable=True),
        sa.Column("provider", sa.String(length=80), nullable=False),
        sa.Column("model", sa.String(length=160), nullable=False),
        sa.Column("prompt_version", sa.String(length=80), nullable=False),
        sa.Column("input_manifest_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("allowed_numbers_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("evidence_ids_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("output_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column("failure_code", sa.String(length=80), nullable=True),
        sa.Column("failure_message", sa.Text(), nullable=True),
        sa.Column("created_by", sa.UUID(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.CheckConstraint("latency_ms >= 0", name="ck_ai_invocation_latency"),
        sa.CheckConstraint(
            "(purpose = 'FINDING_EXPLANATION' AND source_finding_id IS NOT NULL "
            "AND source_reconciliation_run_id IS NULL) OR "
            "(purpose = 'SEMANTIC_MATCHING' AND source_finding_id IS NULL "
            "AND source_reconciliation_run_id IS NOT NULL)",
            name="ck_ai_invocation_source",
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["source_finding_id", "company_id"],
            ["findings.id", "findings.company_id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["source_reconciliation_run_id", "company_id"],
            ["reconciliation_runs.id", "reconciliation_runs.company_id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "company_id", name="uq_ai_invocation_company"),
        sa.UniqueConstraint(
            "company_id", "idempotency_key", name="uq_ai_invocation_company_idempotency"
        ),
    )
    op.create_index(
        "ix_ai_invocation_company_created",
        "ai_invocations",
        ["company_id", "created_at", "id"],
    )
    op.create_index("ix_ai_invocation_finding", "ai_invocations", ["source_finding_id"])
    op.create_index(
        "ix_ai_invocation_reconciliation",
        "ai_invocations",
        ["source_reconciliation_run_id"],
    )
    op.create_index("ix_ai_invocation_created_by", "ai_invocations", ["created_by"])

    for table in ("ai_company_setting_revisions", "ai_invocations"):
        op.execute(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE public.{table} FORCE ROW LEVEL SECURITY")

    op.execute(
        "CREATE POLICY ai_settings_select ON public.ai_company_setting_revisions FOR SELECT "
        "USING (private.has_company_role(company_id, "
        "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','VIEWER']))"
    )
    op.execute(
        "CREATE POLICY ai_settings_insert ON public.ai_company_setting_revisions FOR INSERT "
        "WITH CHECK (created_by = private.current_user_id() AND "
        "private.has_company_role(company_id, ARRAY['OWNER']))"
    )
    op.execute(
        "CREATE POLICY ai_invocations_select ON public.ai_invocations FOR SELECT "
        "USING (private.has_company_role(company_id, "
        "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','VIEWER']))"
    )
    op.execute(
        "CREATE POLICY ai_invocations_insert ON public.ai_invocations FOR INSERT "
        "WITH CHECK (created_by = private.current_user_id() AND "
        "private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']))"
    )
    op.execute("GRANT SELECT, INSERT ON public.ai_company_setting_revisions TO didban_app")
    op.execute("GRANT SELECT, INSERT ON public.ai_invocations TO didban_app")


def downgrade() -> None:
    op.drop_index("ix_ai_invocation_created_by", table_name="ai_invocations")
    op.drop_index("ix_ai_invocation_reconciliation", table_name="ai_invocations")
    op.drop_index("ix_ai_invocation_finding", table_name="ai_invocations")
    op.drop_index("ix_ai_invocation_company_created", table_name="ai_invocations")
    op.drop_table("ai_invocations")
    op.drop_index("ix_ai_setting_created_by", table_name="ai_company_setting_revisions")
    op.drop_index("ix_ai_setting_company_created", table_name="ai_company_setting_revisions")
    op.drop_table("ai_company_setting_revisions")
