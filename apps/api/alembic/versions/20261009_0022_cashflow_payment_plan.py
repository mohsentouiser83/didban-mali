"""Company-scoped cashflow payment plans."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261009_0022"
down_revision: str | None = "20260926_0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "cashflow_planned_payments",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "company_id",
            sa.UUID(),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("payment_date", sa.Date(), nullable=False),
        sa.Column("amount_irr", sa.Numeric(24, 0), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("amount_irr > 0", name="ck_planned_payment_positive"),
    )
    op.create_index(
        "ix_planned_payments_company_date",
        "cashflow_planned_payments",
        ["company_id", "payment_date"],
    )
    table = "cashflow_planned_payments"
    op.execute(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE public.{table} FORCE ROW LEVEL SECURITY")
    readers = "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','ANALYST','VIEWER']"
    writers = "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']"
    op.execute(
        f"CREATE POLICY {table}_select ON public.{table} FOR SELECT USING (private.has_company_role(company_id, {readers}))"
    )
    op.execute(
        f"CREATE POLICY {table}_insert ON public.{table} FOR INSERT WITH CHECK (private.has_company_role(company_id, {writers}))"
    )
    op.execute(
        f"CREATE POLICY {table}_delete ON public.{table} FOR DELETE USING (private.has_company_role(company_id, {writers}))"
    )
    op.execute(f"GRANT SELECT, INSERT, DELETE ON public.{table} TO didban_app")


def downgrade() -> None:
    op.drop_table("cashflow_planned_payments")
