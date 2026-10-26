"""Allow scoped proposal decisions while keeping amounts and source evidence immutable."""

from alembic import op

revision = "20261016_0033"
down_revision = "20261016_0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("GRANT UPDATE (status, features_json) ON public.reconciliation_matches TO didban_app")
    op.execute("""CREATE POLICY reconciliation_matches_decide ON public.reconciliation_matches FOR UPDATE
        USING (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']))
        WITH CHECK (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']))""")
    op.execute("GRANT UPDATE (resolved_by_user_id) ON public.findings TO didban_app")


def downgrade() -> None:
    op.execute("REVOKE UPDATE (resolved_by_user_id) ON public.findings FROM didban_app")
    op.execute("DROP POLICY reconciliation_matches_decide ON public.reconciliation_matches")
    op.execute("REVOKE UPDATE (status, features_json) ON public.reconciliation_matches FROM didban_app")
