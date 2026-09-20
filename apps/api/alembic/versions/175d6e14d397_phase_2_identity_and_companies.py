"""phase 2 identity and companies

Revision ID: 175d6e14d397
Revises: 20260912_0001
Create Date: 2026-09-12 18:42:13.851278
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

RLS_SQL = """
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT NULLIF(pg_catalog.current_setting('app.user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION private.has_workspace_membership(target_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.workspace_id = target_workspace_id
      AND m.user_id = private.current_user_id()
  )
$$;

CREATE OR REPLACE FUNCTION private.has_company_role(target_company_id uuid, allowed_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_access ca
    WHERE ca.company_id = target_company_id
      AND ca.user_id = private.current_user_id()
      AND ca.role::text = ANY(allowed_roles)
  )
$$;

CREATE OR REPLACE FUNCTION private.has_workspace_for_company(target_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies c
    JOIN public.memberships m ON m.workspace_id = c.workspace_id
    WHERE c.id = target_company_id
      AND m.user_id = private.current_user_id()
  )
$$;

REVOKE ALL ON FUNCTION private.current_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_workspace_membership(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_company_role(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_workspace_for_company(uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO didban_app;
GRANT EXECUTE ON FUNCTION private.current_user_id() TO didban_app;
GRANT EXECUTE ON FUNCTION private.has_workspace_membership(uuid) TO didban_app;
GRANT EXECUTE ON FUNCTION private.has_company_role(uuid, text[]) TO didban_app;
GRANT EXECUTE ON FUNCTION private.has_workspace_for_company(uuid) TO didban_app;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies FORCE ROW LEVEL SECURITY;
CREATE POLICY companies_select ON public.companies FOR SELECT
USING (private.has_company_role(id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','VIEWER']));
CREATE POLICY companies_insert ON public.companies FOR INSERT
WITH CHECK (private.has_workspace_membership(workspace_id));
CREATE POLICY companies_update ON public.companies FOR UPDATE
USING (private.has_company_role(id, ARRAY['OWNER','FINANCE_MANAGER']))
WITH CHECK (
  private.has_company_role(id, ARRAY['OWNER','FINANCE_MANAGER'])
  AND private.has_workspace_membership(workspace_id)
);
CREATE POLICY companies_delete ON public.companies FOR DELETE
USING (private.has_company_role(id, ARRAY['OWNER']));

ALTER TABLE public.company_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_access FORCE ROW LEVEL SECURITY;
CREATE POLICY company_access_select ON public.company_access FOR SELECT
USING (
  user_id = private.current_user_id()
  OR private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','VIEWER'])
);
CREATE POLICY company_access_insert ON public.company_access FOR INSERT
WITH CHECK (
  private.has_company_role(company_id, ARRAY['OWNER'])
  OR (
    user_id = private.current_user_id()
    AND role::text = 'OWNER'
    AND private.has_workspace_for_company(company_id)
  )
);
CREATE POLICY company_access_update ON public.company_access FOR UPDATE
USING (private.has_company_role(company_id, ARRAY['OWNER']))
WITH CHECK (private.has_company_role(company_id, ARRAY['OWNER']));
CREATE POLICY company_access_delete ON public.company_access FOR DELETE
USING (private.has_company_role(company_id, ARRAY['OWNER']));

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_events_select ON public.audit_events FOR SELECT
USING (
  company_id IS NOT NULL
  AND private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR'])
);
CREATE POLICY audit_events_insert ON public.audit_events FOR INSERT
WITH CHECK (
  actor_id = private.current_user_id()
  AND (company_id IS NULL OR private.has_workspace_for_company(company_id))
);

GRANT USAGE ON SCHEMA public TO didban_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO didban_app;
"""

revision: str = "175d6e14d397"
down_revision: str | None = "20260912_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def execute_sql_script(script: str) -> None:
    """Execute a PostgreSQL script one statement at a time for asyncpg."""
    statement: list[str] = []
    inside_dollar_quote = False
    for line in script.splitlines():
        statement.append(line)
        if "$$" in line:
            inside_dollar_quote = not inside_dollar_quote
        if not inside_dollar_quote and line.rstrip().endswith(";"):
            op.execute("\n".join(statement))
            statement = []


def upgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table(
        "users",
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("full_name", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_table(
        "auth_sessions",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("family_id", sa.UUID(), nullable=False),
        sa.Column("refresh_token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rotated_to_id", sa.UUID(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["rotated_to_id"], ["auth_sessions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("refresh_token_hash"),
    )
    op.create_index(
        op.f("ix_auth_sessions_family_id"), "auth_sessions", ["family_id"], unique=False
    )
    op.create_index(
        "ix_auth_sessions_user_active",
        "auth_sessions",
        ["user_id", "revoked_at", "expires_at"],
        unique=False,
    )
    op.create_table(
        "workspaces",
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("owner_user_id", sa.UUID(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_workspaces_owner_user_id"), "workspaces", ["owner_user_id"], unique=False
    )
    op.create_table(
        "companies",
        sa.Column("workspace_id", sa.UUID(), nullable=False),
        sa.Column("legal_name", sa.String(length=200), nullable=False),
        sa.Column("national_id", sa.String(length=32), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("fiscal_year_start_month", sa.Integer(), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_companies_workspace_created", "companies", ["workspace_id", "created_at"], unique=False
    )
    op.create_table(
        "memberships",
        sa.Column("workspace_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column(
            "role",
            sa.Enum("OWNER", "MEMBER", name="workspace_role", native_enum=False),
            nullable=False,
        ),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", "user_id", name="uq_membership_workspace_user"),
    )
    op.create_index(
        "ix_memberships_user_workspace", "memberships", ["user_id", "workspace_id"], unique=False
    )
    op.create_table(
        "audit_events",
        sa.Column("workspace_id", sa.UUID(), nullable=True),
        sa.Column("company_id", sa.UUID(), nullable=True),
        sa.Column("actor_id", sa.UUID(), nullable=True),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("entity_type", sa.String(length=80), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=True),
        sa.Column("request_id", sa.String(length=80), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_audit_events_actor_time", "audit_events", ["actor_id", "occurred_at"], unique=False
    )
    op.create_index(
        "ix_audit_events_company_time", "audit_events", ["company_id", "occurred_at"], unique=False
    )
    op.create_table(
        "company_access",
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column(
            "role",
            sa.Enum(
                "OWNER",
                "FINANCE_MANAGER",
                "ADVISOR",
                "VIEWER",
                name="company_role",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", "user_id", name="uq_company_access_company_user"),
    )
    op.create_index(
        "ix_company_access_user_company", "company_access", ["user_id", "company_id"], unique=False
    )
    execute_sql_script(RLS_SQL)
    # ### end Alembic commands ###


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_index("ix_company_access_user_company", table_name="company_access")
    op.drop_table("company_access")
    op.drop_index("ix_audit_events_company_time", table_name="audit_events")
    op.drop_index("ix_audit_events_actor_time", table_name="audit_events")
    op.drop_table("audit_events")
    op.drop_index("ix_memberships_user_workspace", table_name="memberships")
    op.drop_table("memberships")
    op.drop_index("ix_companies_workspace_created", table_name="companies")
    op.drop_table("companies")
    op.drop_index(op.f("ix_workspaces_owner_user_id"), table_name="workspaces")
    op.drop_table("workspaces")
    op.drop_index("ix_auth_sessions_user_active", table_name="auth_sessions")
    op.drop_index(op.f("ix_auth_sessions_family_id"), table_name="auth_sessions")
    op.drop_table("auth_sessions")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
    op.execute("DROP SCHEMA IF EXISTS private CASCADE")
    # ### end Alembic commands ###
