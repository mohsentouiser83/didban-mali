"""phase 6 customer success, onboarding and product validation

Revision ID: 20260926_0020
Revises: 20260926_0019
Create Date: 2026-09-26 13:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260926_0020"
down_revision: str | None = "20260926_0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add onboarding & Go-Live fields to companies
    op.add_column(
        "companies",
        sa.Column(
            "onboarding_stage",
            sa.String(64),
            nullable=False,
            server_default="company_setup",
        ),
    )
    op.add_column(
        "companies",
        sa.Column("is_live", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "companies",
        sa.Column("go_live_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "companies",
        sa.Column("champion_name", sa.String(120), nullable=True),
    )
    op.add_column(
        "companies",
        sa.Column("implementation_owner_name", sa.String(120), nullable=True),
    )
    op.add_column(
        "companies",
        sa.Column("primary_business_objective", sa.Text(), nullable=True),
    )

    # 2. Table customer_success_records
    op.create_table(
        "customer_success_records",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("industry", sa.String(120), nullable=False),
        sa.Column("finance_team_size", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("accounting_system", sa.String(120), nullable=False, server_default="سپیدار"),
        sa.Column("bank_account_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("monthly_transaction_volume", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("main_pain_point", sa.Text(), nullable=False),
        sa.Column("primary_use_case", sa.String(200), nullable=False),
        sa.Column("champion_name", sa.String(120), nullable=False),
        sa.Column("executive_sponsor", sa.String(120), nullable=True),
        sa.Column("go_live_date", sa.Date(), nullable=True),
        sa.Column(
            "baseline_process_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "expected_outcomes_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("review_30d_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("review_60d_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("review_90d_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("health_status", sa.String(32), nullable=False, server_default="healthy"),
        sa.Column(
            "implementation_hours_dev",
            sa.Numeric(6, 2),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "implementation_hours_consultant",
            sa.Numeric(6, 2),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "implementation_hours_cs",
            sa.Numeric(6, 2),
            nullable=False,
            server_default="0",
        ),
        sa.Column("pricing_tier", sa.String(64), nullable=False, server_default="control"),
        sa.Column(
            "monthly_contract_value_irr",
            sa.Numeric(20, 0),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", name="uq_customer_success_company"),
    )

    # 3. Table go_live_validations
    op.create_table(
        "go_live_validations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("validated_by_user_id", sa.UUID(), nullable=False),
        sa.Column("validated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("cash_position_irr", sa.Numeric(20, 0), nullable=False),
        sa.Column("receivables_irr", sa.Numeric(20, 0), nullable=False),
        sa.Column("payables_irr", sa.Numeric(20, 0), nullable=False),
        sa.Column("reconciliation_difference_irr", sa.Numeric(20, 0), nullable=False),
        sa.Column("opening_balance_confirmed", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("user_statement", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["validated_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )

    # 4. Table support_tickets
    op.create_table(
        "support_tickets",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("current_route", sa.String(255), nullable=True),
        sa.Column("error_digest", sa.String(128), nullable=True),
        sa.Column("safe_diagnostic_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="open"),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )

    # 5. Table product_feedbacks
    op.create_table(
        "product_feedbacks",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("problem_statement", sa.Text(), nullable=False),
        sa.Column("context", sa.Text(), nullable=True),
        sa.Column("impact", sa.String(64), nullable=False, server_default="medium"),
        sa.Column("workaround", sa.Text(), nullable=True),
        sa.Column("requested_outcome", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )

    # 6. Table product_analytics_events
    op.create_table(
        "product_analytics_events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("event_name", sa.String(100), nullable=False),
        sa.Column(
            "properties_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_analytics_events_company_name",
        "product_analytics_events",
        ["company_id", "event_name"],
    )
    op.create_index(
        "ix_analytics_events_occurred",
        "product_analytics_events",
        ["occurred_at"],
    )

    # RLS & Permissions
    roles = "ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','VIEWER']"
    manage_roles = "ARRAY['OWNER','FINANCE_MANAGER']"

    for table in (
        "customer_success_records",
        "go_live_validations",
        "support_tickets",
        "product_feedbacks",
        "product_analytics_events",
    ):
        op.execute(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE public.{table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY {table}_select ON public.{table} FOR SELECT "
            f"USING (private.has_company_role(company_id, {roles}))"
        )
        op.execute(
            f"CREATE POLICY {table}_insert ON public.{table} FOR INSERT "
            f"WITH CHECK (private.has_company_role(company_id, {roles}))"
        )
        op.execute(
            f"GRANT SELECT, INSERT ON public.{table} TO didban_app"
        )

    # Support tickets update
    op.execute(
        "CREATE POLICY support_tickets_update ON public.support_tickets FOR UPDATE "
        f"USING (private.has_company_role(company_id, {manage_roles})) "
        f"WITH CHECK (private.has_company_role(company_id, {manage_roles}))"
    )
    op.execute("GRANT UPDATE (status, resolved_at, updated_at) ON public.support_tickets TO didban_app")

    # Customer success update
    op.execute(
        "CREATE POLICY customer_success_update ON public.customer_success_records FOR UPDATE "
        f"USING (private.has_company_role(company_id, {manage_roles})) "
        f"WITH CHECK (private.has_company_role(company_id, {manage_roles}))"
    )
    op.execute(
        "GRANT UPDATE (review_30d_json, review_60d_json, review_90d_json, health_status, "
        "implementation_hours_dev, implementation_hours_consultant, implementation_hours_cs, "
        "pricing_tier, monthly_contract_value_irr, updated_at) "
        "ON public.customer_success_records TO didban_app"
    )

    # Companies update for onboarding fields
    op.execute(
        "GRANT UPDATE (onboarding_stage, is_live, go_live_at, champion_name, "
        "implementation_owner_name, primary_business_objective) "
        "ON public.companies TO didban_app"
    )


def downgrade() -> None:
    for table in (
        "product_analytics_events",
        "product_feedbacks",
        "support_tickets",
        "go_live_validations",
        "customer_success_records",
    ):
        op.drop_table(table)

    op.drop_column("companies", "primary_business_objective")
    op.drop_column("companies", "implementation_owner_name")
    op.drop_column("companies", "champion_name")
    op.drop_column("companies", "go_live_at")
    op.drop_column("companies", "is_live")
    op.drop_column("companies", "onboarding_stage")
