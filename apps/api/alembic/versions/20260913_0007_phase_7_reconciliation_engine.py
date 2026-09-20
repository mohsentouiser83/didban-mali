"""phase 7 reconciliation engine

Revision ID: 20260913_0007
Revises: 20260913_0006
Create Date: 2026-09-13 08:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260913_0007"
down_revision: str | None = "20260913_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_bank_transaction_company", "bank_transactions", ["id", "company_id"]
    )
    op.create_table(
        "reconciliation_runs",
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("analysis_run_id", sa.UUID(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "QUEUED",
                "PROCESSING",
                "COMPLETED",
                "COMPLETED_LIMITED",
                "FAILED",
                name="reconciliation_status",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column("config_version", sa.String(length=80), nullable=False),
        sa.Column("config_json", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column("counts_json", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("created_by", sa.UUID(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failure_code", sa.String(length=80), nullable=True),
        sa.Column("failure_message", sa.Text(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["analysis_run_id", "company_id"],
            ["analysis_runs.id", "analysis_runs.company_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "company_id",
            "idempotency_key",
            name="uq_reconciliation_run_company_idempotency",
        ),
        sa.UniqueConstraint("id", "company_id", name="uq_reconciliation_run_company"),
    )
    op.create_index("ix_reconciliation_runs_analysis", "reconciliation_runs", ["analysis_run_id"])
    op.create_index(
        "ix_reconciliation_runs_company_status",
        "reconciliation_runs",
        ["company_id", "status"],
    )
    op.create_index("ix_reconciliation_runs_created_by", "reconciliation_runs", ["created_by"])
    op.create_table(
        "reconciliation_matches",
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("run_id", sa.UUID(), nullable=False),
        sa.Column("bank_transaction_id", sa.UUID(), nullable=True),
        sa.Column("journal_entry_id", sa.UUID(), nullable=True),
        sa.Column(
            "match_level",
            sa.Enum(
                "DUPLICATE",
                "EXACT",
                "RULE",
                "FUZZY",
                "MISMATCH",
                "UNRESOLVED",
                name="match_level",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "AUTO_MATCHED",
                "POTENTIAL_MATCH",
                "AMOUNT_MISMATCH",
                "DATE_MISMATCH",
                "DUPLICATE_HIGH",
                "DUPLICATE_POSSIBLE",
                "UNRESOLVED",
                name="match_status",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column("score", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("amount_difference_irr", sa.Numeric(precision=20, scale=0), nullable=True),
        sa.Column("date_difference_days", sa.Integer(), nullable=True),
        sa.Column("features_json", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column("evidence_json", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column("rule_code", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.CheckConstraint(
            "bank_transaction_id IS NOT NULL OR journal_entry_id IS NOT NULL",
            name="ck_reconciliation_match_has_record",
        ),
        sa.CheckConstraint("score >= 0 AND score <= 100", name="ck_reconciliation_score_range"),
        sa.ForeignKeyConstraint(
            ["bank_transaction_id", "company_id"],
            ["bank_transactions.id", "bank_transactions.company_id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["journal_entry_id", "company_id"],
            ["journal_entries.id", "journal_entries.company_id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["run_id", "company_id"],
            ["reconciliation_runs.id", "reconciliation_runs.company_id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "run_id",
            "bank_transaction_id",
            "journal_entry_id",
            "rule_code",
            name="uq_reconciliation_candidate",
        ),
    )
    op.create_index(
        "ix_reconciliation_matches_bank", "reconciliation_matches", ["bank_transaction_id"]
    )
    op.create_index(
        "ix_reconciliation_matches_journal", "reconciliation_matches", ["journal_entry_id"]
    )
    op.create_index(
        "ix_reconciliation_matches_run_status", "reconciliation_matches", ["run_id", "status"]
    )
    op.create_index(
        "uq_reconciliation_auto_bank",
        "reconciliation_matches",
        ["run_id", "bank_transaction_id"],
        unique=True,
        postgresql_where=sa.text("status = 'AUTO_MATCHED' AND bank_transaction_id IS NOT NULL"),
    )
    op.create_index(
        "uq_reconciliation_auto_journal",
        "reconciliation_matches",
        ["run_id", "journal_entry_id"],
        unique=True,
        postgresql_where=sa.text("status = 'AUTO_MATCHED' AND journal_entry_id IS NOT NULL"),
    )

    op.execute("ALTER TABLE public.reconciliation_runs ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE public.reconciliation_runs FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY reconciliation_runs_select ON public.reconciliation_runs FOR SELECT "
        "USING (private.has_company_role(company_id, "
        "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','VIEWER']))"
    )
    op.execute(
        "CREATE POLICY reconciliation_runs_insert ON public.reconciliation_runs FOR INSERT "
        "WITH CHECK (created_by = private.current_user_id() AND "
        "private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']))"
    )
    op.execute(
        "CREATE POLICY reconciliation_runs_update ON public.reconciliation_runs FOR UPDATE "
        "USING (private.has_company_role(company_id, "
        "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR'])) "
        "WITH CHECK (private.has_company_role(company_id, "
        "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']))"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON public.reconciliation_runs TO didban_app")

    op.execute("ALTER TABLE public.reconciliation_matches ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE public.reconciliation_matches FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY reconciliation_matches_select ON public.reconciliation_matches "
        "FOR SELECT USING (private.has_company_role(company_id, "
        "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','VIEWER']))"
    )
    op.execute(
        "CREATE POLICY reconciliation_matches_insert ON public.reconciliation_matches "
        "FOR INSERT WITH CHECK (private.has_company_role(company_id, "
        "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']))"
    )
    op.execute("GRANT SELECT, INSERT ON public.reconciliation_matches TO didban_app")


def downgrade() -> None:
    op.drop_index("uq_reconciliation_auto_journal", table_name="reconciliation_matches")
    op.drop_index("uq_reconciliation_auto_bank", table_name="reconciliation_matches")
    op.drop_index("ix_reconciliation_matches_run_status", table_name="reconciliation_matches")
    op.drop_index("ix_reconciliation_matches_journal", table_name="reconciliation_matches")
    op.drop_index("ix_reconciliation_matches_bank", table_name="reconciliation_matches")
    op.drop_table("reconciliation_matches")
    op.drop_index("ix_reconciliation_runs_created_by", table_name="reconciliation_runs")
    op.drop_index("ix_reconciliation_runs_company_status", table_name="reconciliation_runs")
    op.drop_index("ix_reconciliation_runs_analysis", table_name="reconciliation_runs")
    op.drop_table("reconciliation_runs")
    op.drop_constraint(
        "uq_bank_transaction_company", "bank_transactions", type_="unique"
    )
