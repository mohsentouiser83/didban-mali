"""Allow bank statement normalization to fill an account's masked identity."""

from alembic import op

revision = "20261010_0024"
down_revision = "20261010_0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE POLICY bank_accounts_update ON public.bank_accounts FOR UPDATE "
        "USING (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR'])) "
        "WITH CHECK (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']))"
    )
    op.execute("GRANT UPDATE (iban_masked, account_last4, updated_at) ON public.bank_accounts TO didban_app")


def downgrade() -> None:
    op.execute("REVOKE UPDATE (iban_masked, account_last4, updated_at) ON public.bank_accounts FROM didban_app")
    op.execute("DROP POLICY bank_accounts_update ON public.bank_accounts")
