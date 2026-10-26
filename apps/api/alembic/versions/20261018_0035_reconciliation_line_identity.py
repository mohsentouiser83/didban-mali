"""Make posting identity, not voucher identity, the reconciliation uniqueness boundary."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "20261018_0035"
down_revision = "20261018_0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("reconciliation_matches", sa.Column("journal_line_id", postgresql.UUID(as_uuid=True)))
    op.execute("""
        UPDATE reconciliation_matches m SET journal_line_id = COALESCE(
            (m.evidence_json #>> '{accounting,journal_line_id}')::uuid,
            (SELECT a.journal_line_id FROM reconciliation_allocations a
             WHERE a.match_id = m.id AND a.company_id = m.company_id
               AND a.journal_line_id IS NOT NULL ORDER BY a.id LIMIT 1))
    """)
    op.create_foreign_key(
        "fk_reconciliation_match_line", "reconciliation_matches", "journal_lines",
        ["journal_line_id", "company_id"], ["id", "company_id"], ondelete="RESTRICT",
    )
    op.drop_constraint("uq_reconciliation_candidate", "reconciliation_matches", type_="unique")
    op.create_unique_constraint("uq_reconciliation_candidate", "reconciliation_matches",
                                ["run_id", "bank_transaction_id", "journal_line_id", "rule_code"])
    op.drop_index("uq_reconciliation_auto_journal", table_name="reconciliation_matches")
    op.create_index("uq_reconciliation_auto_journal", "reconciliation_matches",
                    ["run_id", "journal_line_id"], unique=True,
                    postgresql_where=sa.text("status = 'AUTO_MATCHED' AND journal_line_id IS NOT NULL"))


def downgrade() -> None:
    # Reverting to document-level uniqueness cannot represent multi-posting matches.
    if op.get_bind().scalar(sa.text("""
        SELECT EXISTS(SELECT 1 FROM reconciliation_matches WHERE status = 'AUTO_MATCHED'
            AND journal_entry_id IS NOT NULL GROUP BY run_id, journal_entry_id HAVING count(*) > 1)
    """)):
        raise RuntimeError("Reverse multi-posting automatic matches before downgrading")
    op.drop_index("uq_reconciliation_auto_journal", table_name="reconciliation_matches")
    op.create_index("uq_reconciliation_auto_journal", "reconciliation_matches",
                    ["run_id", "journal_entry_id"], unique=True,
                    postgresql_where=sa.text("status = 'AUTO_MATCHED' AND journal_entry_id IS NOT NULL"))
    op.drop_constraint("uq_reconciliation_candidate", "reconciliation_matches", type_="unique")
    op.create_unique_constraint("uq_reconciliation_candidate", "reconciliation_matches",
                                ["run_id", "bank_transaction_id", "journal_entry_id", "rule_code"])
    op.drop_constraint("fk_reconciliation_match_line", "reconciliation_matches", type_="foreignkey")
    op.drop_column("reconciliation_matches", "journal_line_id")
