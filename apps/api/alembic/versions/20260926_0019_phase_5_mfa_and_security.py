"""phase 5 mfa and security hardening

Revision ID: 20260926_0019
Revises: 20260923_0018
Create Date: 2026-09-26 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260926_0019"
down_revision: str | None = "20260923_0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add MFA fields to users
    op.add_column("users", sa.Column("mfa_secret", sa.String(128), nullable=True))
    op.add_column(
        "users",
        sa.Column("mfa_enabled", sa.Boolean(), nullable=False, server_default="false"),
    )

    # 2. Hardened Immutable Table Grants for didban_app
    op.execute("REVOKE UPDATE ON public.source_rows FROM didban_app")
    op.execute("REVOKE UPDATE ON public.review_decisions FROM didban_app")
    op.execute("REVOKE UPDATE ON public.finding_notes FROM didban_app")
    op.execute("REVOKE UPDATE ON public.evidence_items FROM didban_app")
    op.execute("REVOKE UPDATE ON public.metric_observations FROM didban_app")
    op.execute("REVOKE UPDATE ON public.reconciliation_matches FROM didban_app")
    op.execute("REVOKE UPDATE ON public.findings FROM didban_app")
    op.execute("GRANT UPDATE (workflow_status, updated_at) ON public.findings TO didban_app")
    op.execute("REVOKE UPDATE ON public.report_snapshots FROM didban_app")
    op.execute(
        "GRANT UPDATE (status, progress, stage, object_key, pdf_sha256, pdf_size_bytes, "
        "started_at, completed_at, failure_code, failure_message) "
        "ON public.report_snapshots TO didban_app"
    )
    op.execute("REVOKE UPDATE ON public.ai_invocations FROM didban_app")
    op.execute("REVOKE UPDATE ON public.ai_company_setting_revisions FROM didban_app")


def downgrade() -> None:
    op.drop_column("users", "mfa_enabled")
    op.drop_column("users", "mfa_secret")
