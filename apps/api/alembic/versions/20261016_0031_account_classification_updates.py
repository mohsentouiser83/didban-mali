"""Allow company writers to upgrade legacy automatic account classifications."""

from alembic import op

revision = "20261016_0031"
down_revision = "20261015_0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "GRANT UPDATE (account_class, rule_version) ON public.account_classifications TO didban_app"
    )
    op.execute("""
        CREATE POLICY account_classifications_update ON public.account_classifications
        FOR UPDATE
        USING (
            rule_version = 'auto-v1' AND
            private.has_company_role(company_id, ARRAY['OWNER', 'FINANCE_MANAGER', 'ADVISOR'])
        )
        WITH CHECK (
            rule_version = 'semantic-v2' AND
            private.has_company_role(company_id, ARRAY['OWNER', 'FINANCE_MANAGER', 'ADVISOR'])
        )
    """)


def downgrade() -> None:
    op.execute("DROP POLICY account_classifications_update ON public.account_classifications")
    op.execute(
        "REVOKE UPDATE (account_class, rule_version) ON public.account_classifications FROM didban_app"
    )
