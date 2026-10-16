"""Preserve source account hierarchy and distinguish year-end entries."""

import sqlalchemy as sa

from alembic import op

revision = "20261015_0028"
down_revision = "20261011_0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("journal_lines", sa.Column("description", sa.Text()))
    for name in ("general", "subsidiary", "detail"):
        op.add_column("accounts", sa.Column(f"{name}_code", sa.String(160)))
        op.add_column("accounts", sa.Column(f"{name}_name", sa.Text()))
    op.add_column(
        "accounts", sa.Column("role", sa.String(40), nullable=False, server_default="other")
    )
    op.add_column(
        "journal_entries",
        sa.Column("entry_type", sa.String(24), nullable=False, server_default="normal"),
    )
    op.add_column(
        "journal_entries",
        sa.Column("entry_type_source", sa.String(24), nullable=False, server_default="legacy"),
    )


def downgrade() -> None:
    op.drop_column("journal_lines", "description")
    for name in ("entry_type_source", "entry_type"):
        op.drop_column("journal_entries", name)
    op.drop_column("accounts", "role")
    for name in ("detail", "subsidiary", "general"):
        op.drop_column("accounts", f"{name}_name")
        op.drop_column("accounts", f"{name}_code")
