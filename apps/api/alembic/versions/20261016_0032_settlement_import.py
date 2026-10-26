"""Track settlement import outcomes and immutable allocation provenance."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "20261016_0032"
down_revision = "20261016_0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "source_rows",
        sa.Column(
            "processing_result",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "invoice_allocations",
        sa.Column("settlement_source_row_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_allocation_settlement_source",
        "invoice_allocations",
        "source_rows",
        ["settlement_source_row_id", "company_id"],
        ["id", "company_id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_allocation_settlement_source", "invoice_allocations", ["settlement_source_row_id"]
    )
    op.execute("GRANT UPDATE (processing_result) ON source_rows TO didban_app")
    op.execute("""CREATE POLICY source_rows_processing_update ON source_rows FOR UPDATE
        USING (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']))
        WITH CHECK (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']))""")


def downgrade() -> None:
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM data_sources WHERE kind IN ('SETTLEMENT_SALES', 'SETTLEMENT_PURCHASES')")):
        raise RuntimeError("Cannot remove settlement provenance while imported files exist")
    op.execute("DROP POLICY source_rows_processing_update ON source_rows")
    op.execute("REVOKE UPDATE (processing_result) ON source_rows FROM didban_app")
    op.drop_index("ix_allocation_settlement_source", table_name="invoice_allocations")
    op.drop_constraint("fk_allocation_settlement_source", "invoice_allocations", type_="foreignkey")
    op.drop_column("invoice_allocations", "settlement_source_row_id")
    op.drop_column("source_rows", "processing_result")
