"""phase 10 dashboard query index

Revision ID: 20260913_0010
Revises: 20260913_0009
Create Date: 2026-09-13 11:30:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260913_0010"
down_revision: str | None = "20260913_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_findings_dashboard_priority",
        "findings",
        ["company_id", "analysis_run_id", "priority_band", "priority_score", "id"],
        unique=False,
        postgresql_where=sa.text(
            "workflow_status IN ('NEEDS_REVIEW', 'CONFIRMED', 'FOLLOW_UP')"
        ),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_findings_dashboard_priority",
        table_name="findings",
        postgresql_where=sa.text(
            "workflow_status IN ('NEEDS_REVIEW', 'CONFIRMED', 'FOLLOW_UP')"
        ),
    )
