"""Allow authorized import owners to refresh and close automatic findings.

Revision ID: 20261010_0023
Revises: 20261009_0022
"""

from alembic import op

revision = "20261010_0023"
down_revision = "20261009_0022"
branch_labels = None
depends_on = None


CONTROL_COLUMNS = (
    "severity, title_fa, summary_fa, financial_impact_irr, affected_amount_irr, "
    "reconciliation_match_id, is_suppressed, status, resolution_type, resolution_note, resolved_at"
)


def upgrade() -> None:
    op.execute(
        "CREATE POLICY findings_control_update ON public.findings FOR UPDATE "
        "USING (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR'])) "
        "WITH CHECK (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']))"
    )

    op.execute(f"GRANT UPDATE ({CONTROL_COLUMNS}) ON public.findings TO didban_app")


def downgrade() -> None:
    op.execute(f"REVOKE UPDATE ({CONTROL_COLUMNS}) ON public.findings FROM didban_app")
    op.execute("DROP POLICY IF EXISTS findings_control_update ON public.findings")
