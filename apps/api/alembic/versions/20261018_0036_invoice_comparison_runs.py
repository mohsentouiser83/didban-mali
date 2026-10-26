"""Immutable invoice comparisons and tenant-safe review history."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

from alembic import op

revision = "20261018_0036"
down_revision = "20261018_0035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    def timestamps() -> list[sa.Column]:
        return [
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        ]
    op.create_table(
        "invoice_comparison_runs",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", pg.UUID(as_uuid=True), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("created_by", pg.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("request_key", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("direction", sa.String(16), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False), sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("selection_json", pg.JSONB(), nullable=False),
        sa.Column("summary_json", pg.JSONB(), nullable=False),
        *timestamps(),
        sa.UniqueConstraint("id", "company_id", name="uq_invoice_comparison_run_company"),
        sa.UniqueConstraint("company_id", "request_key", name="uq_invoice_comparison_request"),
    )
    op.create_index("ix_invoice_comparison_runs_company", "invoice_comparison_runs", ["company_id", "created_at"])
    op.create_table(
        "invoice_comparison_results",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("run_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("item_key", sa.String(64), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("evidence_json", pg.JSONB(), nullable=False),
        sa.Column("decision", sa.String(16), nullable=False, server_default="open"),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("decided_by", pg.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        *timestamps(),
        sa.ForeignKeyConstraint(["run_id", "company_id"],
                                ["invoice_comparison_runs.id", "invoice_comparison_runs.company_id"], ondelete="CASCADE"),
        sa.UniqueConstraint("run_id", "item_key", name="uq_invoice_comparison_result_key"),
    )
    op.create_index("ix_invoice_comparison_results_run", "invoice_comparison_results", ["company_id", "run_id", "status"])
    for table in ("invoice_comparison_runs", "invoice_comparison_results"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(f"""CREATE POLICY {table}_select ON {table} FOR SELECT
            USING (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','VIEWER']))""")
        op.execute(f"""CREATE POLICY {table}_insert ON {table} FOR INSERT
            WITH CHECK (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']))""")
        op.execute(f"GRANT SELECT, INSERT ON {table} TO didban_app")
    op.execute("""CREATE POLICY invoice_comparison_results_update ON invoice_comparison_results FOR UPDATE
        USING (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']))
        WITH CHECK (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']))""")
    op.execute("GRANT UPDATE (decision, note, decided_by, updated_at) ON invoice_comparison_results TO didban_app")


def downgrade() -> None:
    op.drop_table("invoice_comparison_results")
    op.drop_table("invoice_comparison_runs")
