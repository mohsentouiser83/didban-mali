"""Establish the initial migration baseline.

Revision ID: 20260912_0001
Revises: None
"""

revision: str = "20260912_0001"
down_revision: str | None = None
branch_labels: None = None
depends_on: None = None


def upgrade() -> None:
    """The domain schema starts in phase 2."""


def downgrade() -> None:
    """Return to the empty baseline."""
