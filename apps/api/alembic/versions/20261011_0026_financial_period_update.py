"""Allow authorized financial period updates."""

from alembic import op

revision = "20261011_0026"
down_revision = "20261011_0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    writers = "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']"
    op.execute(
        f"CREATE POLICY financial_periods_update ON public.financial_periods FOR UPDATE USING (private.has_company_role(company_id, {writers})) WITH CHECK (private.has_company_role(company_id, {writers}))"
    )
    op.execute(
        "GRANT UPDATE (name, start_date, end_date, updated_at) ON public.financial_periods TO didban_app"
    )


def downgrade() -> None:
    op.execute(
        "REVOKE UPDATE (name, start_date, end_date, updated_at) ON public.financial_periods FROM didban_app"
    )
    op.execute("DROP POLICY financial_periods_update ON public.financial_periods")
