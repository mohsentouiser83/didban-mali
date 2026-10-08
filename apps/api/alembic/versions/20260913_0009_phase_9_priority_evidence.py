"""phase 9 priority and evidence

Revision ID: 20260913_0009
Revises: 20260913_0008
Create Date: 2026-09-13 10:30:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260913_0009"
down_revision: str | None = "20260913_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_unique_constraint("uq_source_file_company", "source_files", ["id", "company_id"])
    op.create_unique_constraint("uq_finding_company", "findings", ["id", "company_id"])
    op.add_column(
        "findings",
        sa.Column(
            "priority_band",
            sa.Enum(
                "CRITICAL", "HIGH", "MEDIUM", "LOW", name="priority_band", native_enum=False
            ),
            nullable=True,
        ),
    )
    op.add_column(
        "findings", sa.Column("priority_score", sa.Numeric(precision=5, scale=2), nullable=True)
    )
    op.add_column(
        "findings",
        sa.Column("priority_explanation_json", sa.dialects.postgresql.JSONB(), nullable=True),
    )
    op.add_column(
        "findings", sa.Column("priority_model_version", sa.String(length=80), nullable=True)
    )
    op.add_column(
        "findings", sa.Column("priority_config_json", sa.dialects.postgresql.JSONB(), nullable=True)
    )
    op.execute(
        """
        WITH factors AS (
            SELECT id,
                   CASE finding_code
                     WHEN 'POTENTIAL_MISSING_TRANSACTION' THEN 80
                     WHEN 'DUPLICATE_TRANSACTION' THEN 65
                     WHEN 'AMOUNT_MISMATCH' THEN 90
                     WHEN 'DATE_MISMATCH' THEN 45
                     WHEN 'REVENUE_DROP' THEN 85
                     WHEN 'PROFIT_DROP' THEN 90
                     WHEN 'EXPENSE_INCREASE' THEN 75
                     WHEN 'RECEIVABLES_INCREASE' THEN 80
                   END::numeric AS impact,
                   CASE
                     WHEN affected_ratio IS NOT NULL THEN LEAST(100, ABS(affected_ratio) * 500)
                     WHEN affected_amount_irr IS NOT NULL
                       THEN LEAST(100, ABS(affected_amount_irr) / 100000000 * 50)
                     ELSE 20
                   END::numeric AS materiality,
                   confidence_score::numeric AS confidence,
                   CASE finding_code
                     WHEN 'POTENTIAL_MISSING_TRANSACTION' THEN 90
                     WHEN 'DUPLICATE_TRANSACTION' THEN 75
                     WHEN 'AMOUNT_MISMATCH' THEN 90
                     WHEN 'DATE_MISMATCH' THEN 55
                     WHEN 'REVENUE_DROP' THEN 70
                     WHEN 'PROFIT_DROP' THEN 75
                     WHEN 'EXPENSE_INCREASE' THEN 70
                     WHEN 'RECEIVABLES_INCREASE' THEN 85
                   END::numeric AS urgency
            FROM findings
        ), scored AS (
            SELECT *, ROUND(0.40 * impact + 0.25 * materiality +
                            0.20 * confidence + 0.15 * urgency, 2) AS score
            FROM factors
        )
        UPDATE findings AS finding
        SET priority_score = scored.score,
            priority_band = CASE
              WHEN scored.score >= 80 AND scored.confidence >= 70 THEN 'CRITICAL'
              WHEN scored.score >= 60 THEN 'HIGH'
              WHEN scored.score >= 35 THEN 'MEDIUM'
              ELSE 'LOW'
            END,
            priority_model_version = 'priority-v1-backfill',
            priority_config_json = jsonb_build_object(
              'weights', jsonb_build_object('impact','0.40','materiality','0.25',
                                             'confidence','0.20','urgency','0.15'),
              'bands', jsonb_build_object('critical','80','high','60','medium','35'),
              'materiality_amount_irr','100000000',
              'revenue_ratio_full_score','0.20',
              'critical_minimum_confidence','70'
            ),
            priority_explanation_json = jsonb_build_object(
              'formula','0.40×impact + 0.25×materiality + 0.20×confidence + 0.15×urgency',
              'factors', jsonb_build_object(
                'impact', jsonb_build_object('score',scored.impact,'weight','0.40',
                                              'weighted_score',ROUND(scored.impact*0.40,2)),
                'materiality', jsonb_build_object('score',scored.materiality,'weight','0.25',
                                                   'weighted_score',ROUND(scored.materiality*0.25,2)),
                'confidence', jsonb_build_object('score',scored.confidence,'weight','0.20',
                                                  'weighted_score',ROUND(scored.confidence*0.20,2)),
                'urgency', jsonb_build_object('score',scored.urgency,'weight','0.15',
                                               'weighted_score',ROUND(scored.urgency*0.15,2))
              ),
              'score',scored.score,
              'critical_capped_for_low_confidence',
                (scored.score >= 80 AND scored.confidence < 70),
              'summary_fa','امتیاز مهاجرتی از چهار عامل اثر، اهمیت، اطمینان و فوریت محاسبه شد.'
            )
        FROM scored
        WHERE finding.id = scored.id
        """
    )
    op.alter_column("findings", "priority_band", nullable=False)
    op.alter_column("findings", "priority_score", nullable=False)
    op.alter_column("findings", "priority_explanation_json", nullable=False)
    op.alter_column("findings", "priority_model_version", nullable=False)
    op.alter_column("findings", "priority_config_json", nullable=False)
    op.create_check_constraint(
        "ck_finding_priority_range", "findings", "priority_score >= 0 AND priority_score <= 100"
    )
    op.create_index(
        "ix_findings_company_priority",
        "findings",
        ["company_id", "priority_band", "priority_score", "id"],
    )

    op.create_table(
        "evidence_items",
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("finding_id", sa.UUID(), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column(
            "evidence_type",
            sa.Enum(
                "SOURCE_RECORD",
                "COMPARISON",
                "CALCULATION",
                "RULE",
                "COVERAGE",
                name="evidence_type",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column("claim_code", sa.String(length=100), nullable=False),
        sa.Column("source_entity_type", sa.String(length=80), nullable=True),
        sa.Column("source_entity_id", sa.UUID(), nullable=True),
        sa.Column("source_row_id", sa.UUID(), nullable=True),
        sa.Column("source_file_id", sa.UUID(), nullable=True),
        sa.Column("field_snapshot_json", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column("calculation_json", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column("rule_code", sa.String(length=100), nullable=True),
        sa.Column("rule_version", sa.String(length=80), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("ordinal > 0", name="ck_evidence_item_ordinal_positive"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["finding_id", "company_id"],
            ["findings.id", "findings.company_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["source_file_id", "company_id"],
            ["source_files.id", "source_files.company_id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["source_row_id", "company_id"],
            ["source_rows.id", "source_rows.company_id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("finding_id", "ordinal", name="uq_evidence_finding_ordinal"),
    )
    op.create_index(
        "ix_evidence_items_company_type", "evidence_items", ["company_id", "evidence_type"]
    )
    op.create_index("ix_evidence_items_finding", "evidence_items", ["finding_id"])
    op.create_index("ix_evidence_items_source_file", "evidence_items", ["source_file_id"])
    op.create_index("ix_evidence_items_source_row", "evidence_items", ["source_row_id"])

    op.execute("ALTER TABLE public.evidence_items ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE public.evidence_items FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY evidence_items_select ON public.evidence_items FOR SELECT "
        "USING (private.has_company_role(company_id, "
        "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','VIEWER']))"
    )
    op.execute(
        "CREATE POLICY evidence_items_insert ON public.evidence_items FOR INSERT "
        "WITH CHECK (private.has_company_role(company_id, "
        "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']))"
    )
    op.execute("GRANT SELECT, INSERT ON public.evidence_items TO didban_app")


def downgrade() -> None:
    op.drop_index("ix_evidence_items_source_row", table_name="evidence_items")
    op.drop_index("ix_evidence_items_source_file", table_name="evidence_items")
    op.drop_index("ix_evidence_items_finding", table_name="evidence_items")
    op.drop_index("ix_evidence_items_company_type", table_name="evidence_items")
    op.drop_table("evidence_items")
    op.drop_index("ix_findings_company_priority", table_name="findings")
    op.drop_constraint("ck_finding_priority_range", "findings", type_="check")
    op.drop_column("findings", "priority_config_json")
    op.drop_column("findings", "priority_model_version")
    op.drop_column("findings", "priority_explanation_json")
    op.drop_column("findings", "priority_score")
    op.drop_column("findings", "priority_band")
    op.drop_constraint("uq_finding_company", "findings", type_="unique")
    op.drop_constraint("uq_source_file_company", "source_files", type_="unique")
