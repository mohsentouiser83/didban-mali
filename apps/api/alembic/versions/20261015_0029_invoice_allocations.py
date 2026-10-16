"""Bank identity, replay protection and audited invoice allocations."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "20261015_0029"
down_revision = "20261015_0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("bank_accounts", sa.Column("iban_fingerprint", sa.String(64)))
    op.add_column("bank_accounts", sa.Column("account_number_fingerprint", sa.String(64)))
    op.add_column("bank_transactions", sa.Column("fingerprint", sa.String(64)))
    op.create_unique_constraint(
        "uq_bank_transaction_fingerprint", "bank_transactions", ["company_id", "fingerprint"]
    )
    uuid = postgresql.UUID(as_uuid=True)
    op.create_table(
        "invoice_allocations",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "company_id", uuid, sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("invoice_source_row_id", uuid, nullable=False),
        sa.Column("invoice_key", sa.String(64), nullable=False),
        sa.Column("bank_transaction_id", uuid, nullable=False),
        sa.Column("direction", sa.String(12), nullable=False),
        sa.Column("amount_irr", sa.Numeric(20, 0), nullable=False),
        sa.Column("history_confirmed", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("request_key", sa.String(128), nullable=False),
        sa.Column(
            "confirmed_by", uuid, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("reversed_at", sa.DateTime(timezone=True)),
        sa.Column("reversed_by", uuid, sa.ForeignKey("users.id", ondelete="RESTRICT")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["invoice_source_row_id", "company_id"],
            ["source_rows.id", "source_rows.company_id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["bank_transaction_id", "company_id"],
            ["bank_transactions.id", "bank_transactions.company_id"],
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint("id", "company_id", name="uq_invoice_allocation_company"),
        sa.UniqueConstraint("company_id", "request_key", name="uq_invoice_allocation_request"),
        sa.CheckConstraint("amount_irr > 0", name="ck_invoice_allocation_positive"),
        sa.CheckConstraint(
            "direction IN ('sales', 'purchases')", name="ck_invoice_allocation_direction"
        ),
    )
    op.create_index(
        "ix_invoice_allocations_invoice", "invoice_allocations", ["company_id", "invoice_key"]
    )
    op.create_index("ix_invoice_allocations_bank", "invoice_allocations", ["bank_transaction_id"])
    op.add_column("invoice_receipts", sa.Column("allocation_id", uuid))
    op.create_foreign_key(
        "fk_receipt_allocation",
        "invoice_receipts",
        "invoice_allocations",
        ["allocation_id", "company_id"],
        ["id", "company_id"],
        ondelete="RESTRICT",
    )
    op.create_unique_constraint("uq_receipt_allocation", "invoice_receipts", ["allocation_id"])
    op.execute("ALTER TABLE public.invoice_allocations ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE public.invoice_allocations FORCE ROW LEVEL SECURITY")
    op.execute("GRANT SELECT, INSERT, UPDATE ON public.invoice_allocations TO didban_app")
    op.execute(
        "CREATE POLICY invoice_allocations_select ON public.invoice_allocations FOR SELECT USING (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','VIEWER']))"
    )
    writers = "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']"
    op.execute(
        f"CREATE POLICY invoice_allocations_insert ON public.invoice_allocations FOR INSERT WITH CHECK (private.has_company_role(company_id, {writers}))"
    )
    op.execute(
        f"CREATE POLICY invoice_allocations_update ON public.invoice_allocations FOR UPDATE USING (private.has_company_role(company_id, {writers})) WITH CHECK (private.has_company_role(company_id, {writers}))"
    )
    op.execute(
        "GRANT UPDATE (iban_fingerprint, account_number_fingerprint) ON public.bank_accounts TO didban_app"
    )


def downgrade() -> None:
    op.drop_constraint("uq_receipt_allocation", "invoice_receipts")
    op.drop_constraint("fk_receipt_allocation", "invoice_receipts")
    op.drop_column("invoice_receipts", "allocation_id")
    op.drop_table("invoice_allocations")
    op.drop_constraint("uq_bank_transaction_fingerprint", "bank_transactions")
    op.drop_column("bank_transactions", "fingerprint")
    op.drop_column("bank_accounts", "account_number_fingerprint")
    op.drop_column("bank_accounts", "iban_fingerprint")
