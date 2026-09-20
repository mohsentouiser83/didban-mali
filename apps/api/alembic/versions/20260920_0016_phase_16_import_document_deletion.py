"""phase 16 import document deletion permissions and RLS

Revision ID: 20260920_0016
Revises: 20260919_0015
Create Date: 2026-09-20 10:00:00
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260920_0016"
down_revision: str | None = "20260919_0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES_WITH_DELETE = (
    "data_sources",
    "source_files",
    "import_batches",
    "mapping_profiles",
    "mapping_versions",
    "source_rows",
    "validation_issues",
    "accounts",
    "counterparties",
    "bank_accounts",
    "bank_transactions",
    "journal_entries",
    "journal_lines",
    "sales_invoices",
    "account_classifications",
    "reconciliation_runs",
    "reconciliation_matches",
    "finding_generation_runs",
    "findings",
    "evidence_items",
    "analysis_runs",
    "metric_observations",
    "report_snapshots",
    "review_decisions",
    "finding_notes",
    "ai_company_setting_revisions",
    "ai_invocations",
)


def upgrade() -> None:
    roles = "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']"

    for table in TABLES_WITH_DELETE:
        op.execute(
            f"CREATE POLICY {table}_delete ON public.{table} FOR DELETE "
            f"USING (private.has_company_role(company_id, {roles}))"
        )
        op.execute(
            f"GRANT SELECT, INSERT, UPDATE, DELETE ON public.{table} TO didban_app"
        )

    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO didban_app"
    )


def downgrade() -> None:
    for table in TABLES_WITH_DELETE:
        op.execute(f"DROP POLICY IF EXISTS {table}_delete ON public.{table}")
