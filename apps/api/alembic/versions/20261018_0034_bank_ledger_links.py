"""Company-scoped, explicitly confirmed bank-to-ledger correspondence."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "20261018_0034"
down_revision = "20261016_0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bank_ledger_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("bank_account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "confirmed_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["account_id", "company_id"], ["accounts.id", "accounts.company_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["bank_account_id", "company_id"],
            ["bank_accounts.id", "bank_accounts.company_id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("company_id", "account_id", name="uq_bank_ledger_link_account"),
    )
    op.create_index(
        "ix_bank_ledger_link_bank", "bank_ledger_links", ["company_id", "bank_account_id"]
    )
    op.execute("ALTER TABLE bank_ledger_links ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE bank_ledger_links FORCE ROW LEVEL SECURITY")
    op.execute("""CREATE POLICY bank_ledger_links_select ON bank_ledger_links FOR SELECT
        USING (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','VIEWER']))""")
    for action in ("INSERT", "UPDATE", "DELETE"):
        using = (
            ""
            if action == "INSERT"
            else (
                "USING (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']))"
            )
        )
        check = (
            ""
            if action == "DELETE"
            else (
                "WITH CHECK (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']))"
            )
        )
        op.execute(
            f"CREATE POLICY bank_ledger_links_{action.lower()} ON bank_ledger_links "
            f"FOR {action} {using} {check}"
        )
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON bank_ledger_links TO didban_app")


def downgrade() -> None:
    op.drop_table("bank_ledger_links")
