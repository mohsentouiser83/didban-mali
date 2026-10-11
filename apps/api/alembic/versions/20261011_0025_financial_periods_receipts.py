"""Saved reporting periods and dated invoice receipts."""

import sqlalchemy as sa
from alembic import op

revision = "20261011_0025"
down_revision = "20261010_0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sales_invoices",
        sa.Column("receipt_history_version", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "sales_invoices",
        sa.Column(
            "receipt_history_complete", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.create_unique_constraint("uq_sales_invoice_company", "sales_invoices", ["id", "company_id"])
    op.create_table(
        "financial_periods",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "company_id",
            sa.UUID(),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("start_date <= end_date", name="ck_financial_period_dates"),
        sa.UniqueConstraint("company_id", "name", name="uq_financial_period_company_name"),
    )
    op.create_index(
        "ix_financial_period_company_dates",
        "financial_periods",
        ["company_id", "start_date", "end_date"],
    )
    op.create_table(
        "invoice_receipts",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "company_id",
            sa.UUID(),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("invoice_id", sa.UUID(), nullable=False),
        sa.Column("received_on", sa.Date(), nullable=False),
        sa.Column("amount_irr", sa.Numeric(20, 0), nullable=False),
        sa.Column("reference", sa.String(200)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["invoice_id", "company_id"],
            ["sales_invoices.id", "sales_invoices.company_id"],
            ondelete="CASCADE",
        ),
        sa.CheckConstraint("amount_irr > 0", name="ck_invoice_receipt_positive"),
    )
    op.create_index(
        "ix_invoice_receipts_company_date", "invoice_receipts", ["company_id", "received_on"]
    )
    op.create_index("ix_invoice_receipts_invoice", "invoice_receipts", ["invoice_id"])
    for table in ("financial_periods", "invoice_receipts"):
        op.execute(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE public.{table} FORCE ROW LEVEL SECURITY")
        readers = "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','VIEWER']"
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
    writers = "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']"
    op.execute(
        f"CREATE POLICY sales_invoices_receipts_update ON public.sales_invoices FOR UPDATE USING (private.has_company_role(company_id, {writers})) WITH CHECK (private.has_company_role(company_id, {writers}))"
    )
    op.execute(
        "GRANT UPDATE (paid_amount_irr, receipt_history_complete, receipt_history_version) ON public.sales_invoices TO didban_app"
    )


def downgrade() -> None:
    op.execute(
        "REVOKE UPDATE (paid_amount_irr, receipt_history_complete, receipt_history_version) ON public.sales_invoices FROM didban_app"
    )
    op.execute("DROP POLICY sales_invoices_receipts_update ON public.sales_invoices")
    op.drop_table("invoice_receipts")
    op.drop_table("financial_periods")
    op.drop_constraint("uq_sales_invoice_company", "sales_invoices", type_="unique")
    op.drop_column("sales_invoices", "receipt_history_complete")
    op.drop_column("sales_invoices", "receipt_history_version")
