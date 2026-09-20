"""phase 11 advisor review

Revision ID: 20260913_0011
Revises: 20260913_0010
Create Date: 2026-09-13 12:30:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260913_0011"
down_revision: str | None = "20260913_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    workflow_values = ("NEEDS_REVIEW", "CONFIRMED", "DISMISSED", "FOLLOW_UP", "RESOLVED")
    op.execute("DROP POLICY audit_events_insert ON public.audit_events")
    op.execute(
        "CREATE POLICY audit_events_insert ON public.audit_events FOR INSERT "
        "WITH CHECK (actor_id = private.current_user_id() AND "
        "(company_id IS NULL OR private.has_workspace_for_company(company_id) OR "
        "private.has_company_role(company_id, "
        "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','VIEWER'])))"
    )
    op.create_table(
        "review_decisions",
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("finding_id", sa.UUID(), nullable=False),
        sa.Column(
            "decision",
            sa.Enum(
                "CONFIRMED",
                "DISMISSED",
                "FOLLOW_UP",
                "RESOLVED",
                name="review_decision_type",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "previous_status",
            sa.Enum(
                *workflow_values,
                name="review_previous_workflow_status",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "resulting_status",
            sa.Enum(
                *workflow_values,
                name="review_resulting_workflow_status",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("actor_id", sa.UUID(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.CheckConstraint(
            "note IS NULL OR (char_length(trim(note)) > 0 AND char_length(note) <= 2000)",
            name="ck_review_decision_note_length",
        ),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["finding_id", "company_id"],
            ["findings.id", "findings.company_id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "company_id",
            "idempotency_key",
            name="uq_review_decision_company_idempotency",
        ),
    )
    op.create_index("ix_review_decisions_actor", "review_decisions", ["actor_id"])
    op.create_index(
        "ix_review_decisions_company_created",
        "review_decisions",
        ["company_id", "created_at"],
    )
    op.create_index(
        "ix_review_decisions_finding_cursor", "review_decisions", ["finding_id", "id"]
    )

    op.create_table(
        "finding_notes",
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("finding_id", sa.UUID(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("actor_id", sa.UUID(), nullable=False),
        sa.Column("supersedes_id", sa.UUID(), nullable=True),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.CheckConstraint(
            "char_length(trim(body)) > 0 AND char_length(body) <= 4000",
            name="ck_finding_note_body_length",
        ),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["finding_id", "company_id"],
            ["findings.id", "findings.company_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["supersedes_id", "company_id", "finding_id"],
            ["finding_notes.id", "finding_notes.company_id", "finding_notes.finding_id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "company_id", "idempotency_key", name="uq_finding_note_company_idempotency"
        ),
        sa.UniqueConstraint("id", "company_id", "finding_id", name="uq_finding_note_scope"),
        sa.UniqueConstraint("supersedes_id", name="uq_finding_note_supersedes"),
    )
    op.create_index("ix_finding_notes_actor", "finding_notes", ["actor_id"])
    op.create_index(
        "ix_finding_notes_company_created", "finding_notes", ["company_id", "created_at"]
    )
    op.create_index("ix_finding_notes_finding_cursor", "finding_notes", ["finding_id", "id"])

    op.execute("ALTER TABLE public.review_decisions ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE public.review_decisions FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY review_decisions_select ON public.review_decisions FOR SELECT "
        "USING (private.has_company_role(company_id, "
        "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','VIEWER']))"
    )
    op.execute(
        "CREATE POLICY review_decisions_insert ON public.review_decisions FOR INSERT "
        "WITH CHECK (actor_id = private.current_user_id() AND "
        "private.has_company_role(company_id, ARRAY['FINANCE_MANAGER','ADVISOR']))"
    )
    op.execute("GRANT SELECT, INSERT ON public.review_decisions TO didban_app")

    op.execute("ALTER TABLE public.finding_notes ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE public.finding_notes FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY finding_notes_select ON public.finding_notes FOR SELECT "
        "USING (private.has_company_role(company_id, "
        "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','VIEWER']))"
    )
    op.execute(
        "CREATE POLICY finding_notes_insert ON public.finding_notes FOR INSERT "
        "WITH CHECK (actor_id = private.current_user_id() AND "
        "private.has_company_role(company_id, ARRAY['FINANCE_MANAGER','ADVISOR']))"
    )
    op.execute("GRANT SELECT, INSERT ON public.finding_notes TO didban_app")

    op.execute(
        "CREATE POLICY findings_review_update ON public.findings FOR UPDATE "
        "USING (private.has_company_role(company_id, ARRAY['FINANCE_MANAGER','ADVISOR'])) "
        "WITH CHECK (private.has_company_role(company_id, ARRAY['FINANCE_MANAGER','ADVISOR']))"
    )
    op.execute("GRANT UPDATE (workflow_status, updated_at) ON public.findings TO didban_app")


def downgrade() -> None:
    op.execute("REVOKE UPDATE (workflow_status, updated_at) ON public.findings FROM didban_app")
    op.execute("DROP POLICY IF EXISTS findings_review_update ON public.findings")
    op.drop_index("ix_finding_notes_finding_cursor", table_name="finding_notes")
    op.drop_index("ix_finding_notes_company_created", table_name="finding_notes")
    op.drop_index("ix_finding_notes_actor", table_name="finding_notes")
    op.drop_table("finding_notes")
    op.drop_index("ix_review_decisions_finding_cursor", table_name="review_decisions")
    op.drop_index("ix_review_decisions_company_created", table_name="review_decisions")
    op.drop_index("ix_review_decisions_actor", table_name="review_decisions")
    op.drop_table("review_decisions")
    op.execute("DROP POLICY audit_events_insert ON public.audit_events")
    op.execute(
        "CREATE POLICY audit_events_insert ON public.audit_events FOR INSERT "
        "WITH CHECK (actor_id = private.current_user_id() AND "
        "(company_id IS NULL OR private.has_workspace_for_company(company_id)))"
    )
