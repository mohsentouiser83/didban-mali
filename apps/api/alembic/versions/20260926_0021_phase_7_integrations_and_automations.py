"""phase 7 integrations and automations platform

Revision ID: 20260926_0021
Revises: 20260926_0020
Create Date: 2026-09-26 14:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260926_0021"
down_revision: str | None = "20260926_0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. integration_connections
    op.create_table(
        "integration_connections",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("provider", sa.String(64), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="inactive"),
        sa.Column(
            "config_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "encrypted_credentials_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error_message", sa.Text(), nullable=True),
        sa.Column("last_sync_record_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sync_interval_minutes", sa.Integer(), nullable=False, server_default="1440"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", "provider", name="uq_integration_company_provider"),
    )
    op.create_index(
        "ix_integration_connections_company",
        "integration_connections",
        ["company_id", "status"],
    )

    # 2. integration_sync_jobs
    op.create_table(
        "integration_sync_jobs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("connection_id", sa.UUID(), nullable=False),
        sa.Column("sync_type", sa.String(32), nullable=False, server_default="manual"),
        sa.Column("status", sa.String(32), nullable=False, server_default="queued"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("records_received", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("records_imported", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("records_rejected", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("watermark_cursor", sa.String(128), nullable=True),
        sa.Column(
            "summary_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["connection_id"], ["integration_connections.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_sync_jobs_company_conn",
        "integration_sync_jobs",
        ["company_id", "connection_id", "created_at"],
    )

    # 3. integration_sync_records
    op.create_table(
        "integration_sync_records",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("connection_id", sa.UUID(), nullable=False),
        sa.Column("job_id", sa.UUID(), nullable=False),
        sa.Column("source_entity_type", sa.String(64), nullable=False),
        sa.Column("source_record_id", sa.String(128), nullable=False),
        sa.Column("source_fingerprint", sa.String(64), nullable=False),
        sa.Column("canonical_record_id", sa.UUID(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="imported"),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.Column(
            "raw_payload_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["connection_id"], ["integration_connections.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["job_id"], ["integration_sync_jobs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", "connection_id", "source_fingerprint", name="uq_sync_record_idempotency"),
    )
    op.create_index(
        "ix_sync_records_job",
        "integration_sync_records",
        ["job_id", "status"],
    )

    # 4. automation_rules
    op.create_table(
        "automation_rules",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("action_type", sa.String(64), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("schedule_cron", sa.String(64), nullable=False, server_default="0 7 * * *"),
        sa.Column(
            "config_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_status", sa.String(32), nullable=False, server_default="idle"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_automation_rules_company",
        "automation_rules",
        ["company_id", "is_enabled"],
    )

    # 5. automation_runs
    op.create_table(
        "automation_runs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("rule_id", sa.UUID(), nullable=False),
        sa.Column("trigger_type", sa.String(32), nullable=False, server_default="scheduled"),
        sa.Column("status", sa.String(32), nullable=False, server_default="running"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "steps_executed_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["rule_id"], ["automation_rules.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_automation_runs_company_rule",
        "automation_runs",
        ["company_id", "rule_id", "created_at"],
    )

    # 6. RLS & Permissions
    roles = "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','VIEWER']"
    manage_roles = "ARRAY['OWNER','FINANCE_MANAGER']"
    owner_roles = "ARRAY['OWNER']"

    for table in (
        "integration_connections",
        "integration_sync_jobs",
        "integration_sync_records",
        "automation_rules",
        "automation_runs",
    ):
        op.execute(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE public.{table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY {table}_select ON public.{table} FOR SELECT "
            f"USING (private.has_company_role(company_id, {roles}))"
        )
        op.execute(
            f"CREATE POLICY {table}_insert ON public.{table} FOR INSERT "
            f"WITH CHECK (private.has_company_role(company_id, {manage_roles}))"
        )
        op.execute(
            f"CREATE POLICY {table}_update ON public.{table} FOR UPDATE "
            f"USING (private.has_company_role(company_id, {manage_roles})) "
            f"WITH CHECK (private.has_company_role(company_id, {manage_roles}))"
        )
        op.execute(
            f"CREATE POLICY {table}_delete ON public.{table} FOR DELETE "
            f"USING (private.has_company_role(company_id, {owner_roles}))"
        )
        op.execute(
            f"GRANT SELECT, INSERT, UPDATE, DELETE ON public.{table} TO didban_app"
        )


def downgrade() -> None:
    for table in (
        "automation_runs",
        "automation_rules",
        "integration_sync_records",
        "integration_sync_jobs",
        "integration_connections",
    ):
        op.drop_table(table)
