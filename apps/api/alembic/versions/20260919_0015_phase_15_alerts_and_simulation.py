"""phase 15 alerts and simulation

Revision ID: 20260919_0015
Revises: 20260913_0013
Create Date: 2026-09-19 12:35:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260919_0015"
down_revision: str | None = "20260913_0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "alert_webhook_configs",
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("url", sa.String(length=500), nullable=False),
        sa.Column("secret_token", sa.String(length=256), nullable=True),
        sa.Column(
            "min_severity",
            sa.Enum(
                "CRITICAL",
                "WARNING",
                "INFO",
                name="alert_webhook_min_severity",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("last_triggered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_delivery_status", sa.String(length=32), nullable=True),
        sa.Column("last_delivery_code", sa.Integer(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_alert_webhooks_company",
        "alert_webhook_configs",
        ["company_id", "is_active"],
        unique=False,
    )

    op.create_table(
        "early_warning_alerts",
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column(
            "code",
            sa.Enum(
                "RUNWAY_CRITICAL",
                "RUNWAY_WARNING",
                "CASH_GAP_HIGH",
                "DEBTOR_CONCENTRATION",
                "OVERDUE_RECEIVABLES_SURGE",
                "CUSTOMER_CREDIT_ALERT",
                "SUPPLIER_STOPPAGE_RISK",
                "PAYABLES_OVERDUE_SURGE",
                "UNMATCHED_BANK_OUTFLOW",
                name="alert_code",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "category",
            sa.Enum(
                "LIQUIDITY",
                "CREDIT_RISK",
                "SUPPLY_CHAIN",
                "COMPLIANCE",
                name="alert_category",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "severity",
            sa.Enum("CRITICAL", "WARNING", "INFO", name="alert_severity", native_enum=False),
            nullable=False,
        ),
        sa.Column("title_fa", sa.String(length=200), nullable=False),
        sa.Column("summary_fa", sa.Text(), nullable=False),
        sa.Column("metric_key", sa.String(length=64), nullable=False),
        sa.Column("current_value", sa.Numeric(precision=24, scale=4), nullable=True),
        sa.Column("threshold_value", sa.Numeric(precision=24, scale=4), nullable=True),
        sa.Column("metric_unit", sa.String(length=32), nullable=False),
        sa.Column("suggested_action_fa", sa.Text(), nullable=False),
        sa.Column("target_route", sa.String(length=128), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "ACTIVE",
                "ACKNOWLEDGED",
                "RESOLVED",
                "DISMISSED",
                name="alert_status",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column("triggered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_by_user_id", sa.UUID(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("action_note", sa.Text(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["acknowledged_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_alerts_code_status", "early_warning_alerts", ["company_id", "code", "status"], unique=False
    )
    op.create_index(
        "ix_alerts_company_severity", "early_warning_alerts", ["company_id", "severity"], unique=False
    )
    op.create_index(
        "ix_alerts_company_status", "early_warning_alerts", ["company_id", "status"], unique=False
    )

    op.create_table(
        "saved_simulation_scenarios",
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_favorite", sa.Boolean(), nullable=False),
        sa.Column(
            "parameters",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=False,
        ),
        sa.Column(
            "result_summary",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=False,
        ),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_saved_scenarios_company", "saved_simulation_scenarios", ["company_id"], unique=False
    )
    op.create_index(
        "ix_saved_scenarios_favorite",
        "saved_simulation_scenarios",
        ["company_id", "is_favorite"],
        unique=False,
    )

    op.create_table(
        "alert_webhook_delivery_logs",
        sa.Column("webhook_id", sa.UUID(), nullable=False),
        sa.Column("alert_id", sa.UUID(), nullable=True),
        sa.Column("request_payload_json", sa.Text(), nullable=False),
        sa.Column("response_status_code", sa.Integer(), nullable=True),
        sa.Column("response_body", sa.Text(), nullable=True),
        sa.Column("is_success", sa.Boolean(), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["alert_id"], ["early_warning_alerts.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["webhook_id"], ["alert_webhook_configs.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_alert_delivery_webhook",
        "alert_webhook_delivery_logs",
        ["webhook_id", "created_at"],
        unique=False,
    )

    for table in (
        "alert_webhook_configs",
        "early_warning_alerts",
        "saved_simulation_scenarios",
    ):
        op.execute(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE public.{table} FORCE ROW LEVEL SECURITY")

    op.execute(
        "CREATE POLICY alert_webhooks_select ON public.alert_webhook_configs FOR SELECT "
        "USING (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','VIEWER']))"
    )
    op.execute(
        "CREATE POLICY alert_webhooks_all ON public.alert_webhook_configs FOR ALL "
        "USING (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER'])) "
        "WITH CHECK (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER']))"
    )

    op.execute(
        "CREATE POLICY early_warning_alerts_select ON public.early_warning_alerts FOR SELECT "
        "USING (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','VIEWER']))"
    )
    op.execute(
        "CREATE POLICY early_warning_alerts_all ON public.early_warning_alerts FOR ALL "
        "USING (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR'])) "
        "WITH CHECK (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']))"
    )

    op.execute(
        "CREATE POLICY saved_scenarios_select ON public.saved_simulation_scenarios FOR SELECT "
        "USING (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','VIEWER']))"
    )
    op.execute(
        "CREATE POLICY saved_scenarios_all ON public.saved_simulation_scenarios FOR ALL "
        "USING (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR'])) "
        "WITH CHECK (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']))"
    )

    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_webhook_configs TO didban_app")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON public.early_warning_alerts TO didban_app")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_simulation_scenarios TO didban_app")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_webhook_delivery_logs TO didban_app")


def downgrade() -> None:
    op.drop_index("ix_alert_delivery_webhook", table_name="alert_webhook_delivery_logs")
    op.drop_table("alert_webhook_delivery_logs")
    op.drop_index("ix_saved_scenarios_favorite", table_name="saved_simulation_scenarios")
    op.drop_index("ix_saved_scenarios_company", table_name="saved_simulation_scenarios")
    op.drop_table("saved_simulation_scenarios")
    op.drop_index("ix_alerts_company_status", table_name="early_warning_alerts")
    op.drop_index("ix_alerts_company_severity", table_name="early_warning_alerts")
    op.drop_index("ix_alerts_code_status", table_name="early_warning_alerts")
    op.drop_table("early_warning_alerts")
    op.drop_index("ix_alert_webhooks_company", table_name="alert_webhook_configs")
    op.drop_table("alert_webhook_configs")
