"""phase 4 mapping and validation

Revision ID: 20260913_0004
Revises: 6702092c0984
Create Date: 2026-09-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260913_0004"
down_revision: str | None = "6702092c0984"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

RLS_SQL = """
ALTER TABLE public.mapping_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mapping_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY mapping_profiles_select ON public.mapping_profiles FOR SELECT
USING (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','VIEWER']));
CREATE POLICY mapping_profiles_insert ON public.mapping_profiles FOR INSERT
WITH CHECK (
  created_by = private.current_user_id()
  AND private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR'])
);

ALTER TABLE public.mapping_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mapping_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY mapping_versions_select ON public.mapping_versions FOR SELECT
USING (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','VIEWER']));
CREATE POLICY mapping_versions_insert ON public.mapping_versions FOR INSERT
WITH CHECK (
  confirmed_by = private.current_user_id()
  AND private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR'])
);

ALTER TABLE public.source_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_rows FORCE ROW LEVEL SECURITY;
CREATE POLICY source_rows_select ON public.source_rows FOR SELECT
USING (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','VIEWER']));
CREATE POLICY source_rows_insert ON public.source_rows FOR INSERT
WITH CHECK (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']));

ALTER TABLE public.validation_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_issues FORCE ROW LEVEL SECURITY;
CREATE POLICY validation_issues_select ON public.validation_issues FOR SELECT
USING (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR','VIEWER']));
CREATE POLICY validation_issues_insert ON public.validation_issues FOR INSERT
WITH CHECK (private.has_company_role(company_id, ARRAY['OWNER','FINANCE_MANAGER','ADVISOR']));

GRANT SELECT, INSERT ON public.mapping_profiles TO didban_app;
GRANT SELECT, INSERT ON public.mapping_versions TO didban_app;
GRANT SELECT, INSERT ON public.source_rows TO didban_app;
GRANT SELECT, INSERT ON public.validation_issues TO didban_app;
"""


def execute_sql_script(script: str) -> None:
    for statement in script.split(";"):
        if statement.strip():
            op.execute(statement)


def upgrade() -> None:
    op.add_column("import_batches", sa.Column("sheet_name", sa.String(length=160)))
    op.add_column("import_batches", sa.Column("header_row", sa.Integer()))
    op.create_unique_constraint("uq_import_batch_company", "import_batches", ["id", "company_id"])
    op.create_table(
        "mapping_profiles",
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column(
            "source_kind",
            sa.Enum("ACCOUNTING", "BANK", "SALES", name="mapping_source_kind", native_enum=False),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("column_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("mapping_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("transforms_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_by", sa.UUID(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "company_id", name="uq_mapping_profile_company"),
        sa.UniqueConstraint(
            "company_id",
            "source_kind",
            "column_fingerprint",
            "name",
            name="uq_mapping_profile_scope",
        ),
    )
    op.create_index(
        "ix_mapping_profiles_company_kind",
        "mapping_profiles",
        ["company_id", "source_kind"],
    )
    op.create_index("ix_mapping_profiles_created_by", "mapping_profiles", ["created_by"])
    op.create_table(
        "mapping_versions",
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("profile_id", sa.UUID()),
        sa.Column("import_batch_id", sa.UUID(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("mapping_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("transforms_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("confirmed_by", sa.UUID(), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["confirmed_by"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["import_batch_id", "company_id"],
            ["import_batches.id", "import_batches.company_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["profile_id"], ["mapping_profiles.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("import_batch_id", name="uq_mapping_version_batch"),
    )
    op.create_index(
        "ix_mapping_versions_company_created",
        "mapping_versions",
        ["company_id", "confirmed_at"],
    )
    op.create_index("ix_mapping_versions_profile_id", "mapping_versions", ["profile_id"])
    op.create_index("ix_mapping_versions_confirmed_by", "mapping_versions", ["confirmed_by"])
    op.create_table(
        "source_rows",
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("import_batch_id", sa.UUID(), nullable=False),
        sa.Column("sheet", sa.String(length=160), nullable=False),
        sa.Column("row_number", sa.Integer(), nullable=False),
        sa.Column("raw_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("raw_hash", sa.String(length=64), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["import_batch_id", "company_id"],
            ["import_batches.id", "import_batches.company_id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "company_id", name="uq_source_row_company"),
        sa.UniqueConstraint(
            "import_batch_id", "sheet", "row_number", name="uq_source_row_location"
        ),
    )
    op.create_index(
        "ix_source_rows_company_batch", "source_rows", ["company_id", "import_batch_id"]
    )
    op.create_table(
        "validation_issues",
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("import_batch_id", sa.UUID(), nullable=False),
        sa.Column("source_row_id", sa.UUID()),
        sa.Column("field", sa.String(length=80)),
        sa.Column(
            "severity",
            sa.Enum("BLOCKING", "ERROR", "WARNING", name="issue_severity", native_enum=False),
            nullable=False,
        ),
        sa.Column("code", sa.String(length=80), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("raw_value", sa.Text()),
        sa.Column("remedy", sa.Text()),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["import_batch_id", "company_id"],
            ["import_batches.id", "import_batches.company_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["source_row_id", "company_id"],
            ["source_rows.id", "source_rows.company_id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_validation_issues_company_batch",
        "validation_issues",
        ["company_id", "import_batch_id"],
    )
    op.create_index(
        "ix_validation_issues_batch_severity",
        "validation_issues",
        ["import_batch_id", "severity"],
    )
    op.create_index("ix_validation_issues_source_row_id", "validation_issues", ["source_row_id"])
    execute_sql_script(RLS_SQL)


def downgrade() -> None:
    op.drop_table("validation_issues")
    op.drop_table("source_rows")
    op.drop_table("mapping_versions")
    op.drop_table("mapping_profiles")
    op.drop_constraint("uq_import_batch_company", "import_batches", type_="unique")
    op.drop_column("import_batches", "header_row")
    op.drop_column("import_batches", "sheet_name")
