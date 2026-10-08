"""phase 3 financial control reconciliation and action workflow

Revision ID: 20260923_0018
Revises: 20260923_0017
Create Date: 2026-09-23 15:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260923_0018"
down_revision: str | None = "20260923_0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # -------------------------------------------------------------
    # 1. Update reconciliation_runs
    # -------------------------------------------------------------
    # Allow analysis_run_id to be nullable for direct canonical reconciliation
    op.alter_column("reconciliation_runs", "analysis_run_id", nullable=True)

    op.add_column("reconciliation_runs", sa.Column("bank_account_id", sa.UUID(), nullable=True))
    op.add_column("reconciliation_runs", sa.Column("period_start", sa.Date(), nullable=True))
    op.add_column("reconciliation_runs", sa.Column("period_end", sa.Date(), nullable=True))
    op.add_column("reconciliation_runs", sa.Column("matched_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("reconciliation_runs", sa.Column("unmatched_bank_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("reconciliation_runs", sa.Column("unmatched_journal_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("reconciliation_runs", sa.Column("matched_amount_irr", sa.Numeric(precision=20, scale=0), nullable=False, server_default="0"))
    op.add_column("reconciliation_runs", sa.Column("unmatched_bank_amount_irr", sa.Numeric(precision=20, scale=0), nullable=False, server_default="0"))
    op.add_column("reconciliation_runs", sa.Column("unmatched_journal_amount_irr", sa.Numeric(precision=20, scale=0), nullable=False, server_default="0"))

    op.create_foreign_key(
        "fk_reconciliation_runs_bank_account",
        "reconciliation_runs",
        "bank_accounts",
        ["bank_account_id", "company_id"],
        ["id", "company_id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_reconciliation_runs_company_period",
        "reconciliation_runs",
        ["company_id", "period_start", "period_end"],
    )

    # -------------------------------------------------------------
    # 2. Update reconciliation_matches
    # -------------------------------------------------------------
    op.add_column("reconciliation_matches", sa.Column("match_type", sa.String(length=40), nullable=False, server_default="one_to_one"))
    op.add_column("reconciliation_matches", sa.Column("reversed_by", sa.UUID(), nullable=True))
    op.add_column("reconciliation_matches", sa.Column("reversed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("reconciliation_matches", sa.Column("reversal_reason", sa.Text(), nullable=True))
    op.add_column("reconciliation_matches", sa.Column("match_reasons_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")))

    op.create_foreign_key(
        "fk_reconciliation_matches_reversed_by",
        "reconciliation_matches",
        "users",
        ["reversed_by"],
        ["id"],
        ondelete="SET NULL",
    )

    # Ensure composite tenant unique constraint on journal_lines
    op.create_unique_constraint("uq_journal_line_company", "journal_lines", ["id", "company_id"])

    # -------------------------------------------------------------
    # 3. Create reconciliation_allocations
    # -------------------------------------------------------------
    op.create_table(
        "reconciliation_allocations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("match_id", sa.UUID(), nullable=False),
        sa.Column("side", sa.String(length=20), nullable=False),
        sa.Column("bank_transaction_id", sa.UUID(), nullable=True),
        sa.Column("journal_line_id", sa.UUID(), nullable=True),
        sa.Column("allocated_amount_irr", sa.Numeric(precision=20, scale=0), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("bank_transaction_id IS NOT NULL OR journal_line_id IS NOT NULL", name="ck_recon_alloc_target"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["match_id", "company_id"], ["reconciliation_matches.id", "reconciliation_matches.company_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["bank_transaction_id", "company_id"], ["bank_transactions.id", "bank_transactions.company_id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["journal_line_id", "company_id"], ["journal_lines.id", "journal_lines.company_id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "company_id", name="uq_reconciliation_allocation_company"),
    )
    op.create_index("ix_reconciliation_alloc_match", "reconciliation_allocations", ["match_id"])
    op.create_index("ix_reconciliation_alloc_bank", "reconciliation_allocations", ["bank_transaction_id"])
    op.create_index("ix_reconciliation_alloc_journal", "reconciliation_allocations", ["journal_line_id"])

    # -------------------------------------------------------------
    # 4. Create finding_detection_runs
    # -------------------------------------------------------------
    op.create_table(
        "finding_detection_runs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("trigger_type", sa.String(length=40), nullable=False, server_default="manual"),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=True),
        sa.Column("period_end", sa.Date(), nullable=True),
        sa.Column("calculation_run_id", sa.UUID(), nullable=True),
        sa.Column("reconciliation_run_id", sa.UUID(), nullable=True),
        sa.Column("findings_detected", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("findings_created", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("findings_updated", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("findings_suppressed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("summary_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_by", sa.UUID(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failure_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["calculation_run_id", "company_id"], ["calculation_runs.id", "calculation_runs.company_id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reconciliation_run_id", "company_id"], ["reconciliation_runs.id", "reconciliation_runs.company_id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "company_id", name="uq_finding_detection_run_company"),
    )
    op.create_index("ix_finding_detection_company_status", "finding_detection_runs", ["company_id", "status"])

    # -------------------------------------------------------------
    # 5. Update findings table
    # -------------------------------------------------------------
    # Make analysis_run_id and generation_run_id nullable
    op.alter_column("findings", "analysis_run_id", nullable=True)
    op.alter_column("findings", "generation_run_id", nullable=True)
    op.alter_column("findings", "fingerprint", type_=sa.String(length=128), existing_type=sa.String(length=64))
    op.alter_column("findings", "severity", type_=sa.String(length=16), existing_type=sa.String(length=6))
    op.alter_column("findings", "finding_code", type_=sa.String(length=64), existing_type=sa.String(length=29))
    op.alter_column("findings", "category", type_=sa.String(length=64), existing_type=sa.String(length=18))

    op.add_column("findings", sa.Column("status", sa.String(length=32), nullable=False, server_default="new"))
    op.add_column("findings", sa.Column("assigned_to_user_id", sa.UUID(), nullable=True))
    op.add_column("findings", sa.Column("due_date", sa.Date(), nullable=True))
    op.add_column("findings", sa.Column("source_entity_type", sa.String(length=64), nullable=True))
    op.add_column("findings", sa.Column("source_entity_id", sa.UUID(), nullable=True))
    op.add_column("findings", sa.Column("calculation_run_id", sa.UUID(), nullable=True))
    op.add_column("findings", sa.Column("resolution_type", sa.String(length=40), nullable=True))
    op.add_column("findings", sa.Column("resolution_note", sa.Text(), nullable=True))
    op.add_column("findings", sa.Column("resolved_by_user_id", sa.UUID(), nullable=True))
    op.add_column("findings", sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("findings", sa.Column("verified_by_user_id", sa.UUID(), nullable=True))
    op.add_column("findings", sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("findings", sa.Column("verification_note", sa.Text(), nullable=True))
    op.add_column("findings", sa.Column("is_suppressed", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("findings", sa.Column("financial_impact_irr", sa.Numeric(precision=20, scale=0), nullable=True))

    op.create_foreign_key("fk_findings_assigned_to", "findings", "users", ["assigned_to_user_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_findings_resolved_by", "findings", "users", ["resolved_by_user_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_findings_verified_by", "findings", "users", ["verified_by_user_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key(
        "fk_findings_calculation_run",
        "findings",
        "calculation_runs",
        ["calculation_run_id", "company_id"],
        ["id", "company_id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_findings_company_status", "findings", ["company_id", "status"])
    op.create_index("ix_findings_company_assigned", "findings", ["company_id", "assigned_to_user_id"])
    op.create_index("ix_findings_company_fingerprint", "findings", ["company_id", "fingerprint"], unique=True)

    # -------------------------------------------------------------
    # 6. Create finding_evidence
    # -------------------------------------------------------------
    op.create_table(
        "finding_evidence",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("finding_id", sa.UUID(), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("evidence_type", sa.String(length=40), nullable=False),
        sa.Column("title_fa", sa.String(length=255), nullable=False),
        sa.Column("description_fa", sa.Text(), nullable=False),
        sa.Column("payload_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["finding_id", "company_id"], ["findings.id", "findings.company_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "company_id", name="uq_finding_evidence_company"),
    )
    op.create_index("ix_finding_evidence_finding", "finding_evidence", ["finding_id"])

    # -------------------------------------------------------------
    # 7. Create finding_activities
    # -------------------------------------------------------------
    op.create_table(
        "finding_activities",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("finding_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("action_type", sa.String(length=40), nullable=False),
        sa.Column("old_state", sa.String(length=64), nullable=True),
        sa.Column("new_state", sa.String(length=64), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["finding_id", "company_id"], ["findings.id", "findings.company_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "company_id", name="uq_finding_activity_company"),
    )
    op.create_index("ix_finding_activities_finding", "finding_activities", ["finding_id", "created_at"])

    # -------------------------------------------------------------
    # 8. Create finding_suppressions
    # -------------------------------------------------------------
    op.create_table(
        "finding_suppressions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("rule_code", sa.String(length=64), nullable=False),
        sa.Column("entity_type", sa.String(length=40), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("suppressed_by_user_id", sa.UUID(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["suppressed_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "company_id", name="uq_finding_suppression_company"),
        sa.UniqueConstraint("company_id", "rule_code", "entity_type", "entity_id", name="uq_finding_suppression_target"),
    )
    op.create_index("ix_finding_suppressions_company", "finding_suppressions", ["company_id"])

    # -------------------------------------------------------------
    # 9. Create financial_control_policies
    # -------------------------------------------------------------
    op.create_table(
        "financial_control_policies",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("rule_code", sa.String(length=64), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("severity_override", sa.String(length=20), nullable=True),
        sa.Column("thresholds_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("updated_by_user_id", sa.UUID(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "company_id", name="uq_financial_control_policy_company"),
        sa.UniqueConstraint("company_id", "rule_code", name="uq_financial_control_policy_company_rule"),
    )
    op.create_index("ix_control_policies_company", "financial_control_policies", ["company_id"])

    # -------------------------------------------------------------
    # 10. Create in_app_alerts
    # -------------------------------------------------------------
    op.create_table(
        "in_app_alerts",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("finding_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("title_fa", sa.String(length=255), nullable=False),
        sa.Column("summary_fa", sa.Text(), nullable=False),
        sa.Column("severity", sa.String(length=20), nullable=False),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["finding_id", "company_id"], ["findings.id", "findings.company_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "company_id", name="uq_in_app_alert_company"),
    )
    op.create_index("ix_in_app_alerts_user", "in_app_alerts", ["company_id", "user_id", "is_read"])

    # -------------------------------------------------------------
    # 11. RLS and Grants
    # -------------------------------------------------------------
    new_tables = [
        "reconciliation_allocations",
        "finding_detection_runs",
        "finding_evidence",
        "finding_activities",
        "finding_suppressions",
        "financial_control_policies",
        "in_app_alerts",
    ]

    roles = "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','ANALYST','VIEWER']"
    manage_roles = "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','ANALYST']"

    for table in new_tables:
        op.execute(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY")
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
    for table in [
        "in_app_alerts",
        "financial_control_policies",
        "finding_suppressions",
        "finding_activities",
        "finding_evidence",
        "finding_detection_runs",
        "reconciliation_allocations",
    ]:
        op.drop_table(table)
