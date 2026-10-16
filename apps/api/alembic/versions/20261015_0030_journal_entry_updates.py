"""Allow company writers to persist inferred journal document semantics."""

from alembic import op

revision = "20261015_0030"
down_revision = "20261015_0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("GRANT UPDATE (entry_type) ON journal_entries TO didban_app")
    op.execute("""
        CREATE POLICY journal_entries_update ON journal_entries
        FOR UPDATE
        USING (private.has_company_role(company_id, ARRAY['OWNER', 'FINANCE_MANAGER', 'ADVISOR']))
        WITH CHECK (private.has_company_role(company_id, ARRAY['OWNER', 'FINANCE_MANAGER', 'ADVISOR']))
    """)


def downgrade() -> None:
    op.execute("DROP POLICY journal_entries_update ON journal_entries")
    op.execute("REVOKE UPDATE (entry_type) ON journal_entries FROM didban_app")
