"""Expand import source labels for purchase and Moadian snapshots."""

import sqlalchemy as sa

from alembic import op

revision = "20261011_0027"
down_revision = "20261011_0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("data_sources", "kind", type_=sa.String(32), existing_type=sa.String(10))
    op.alter_column(
        "mapping_profiles", "source_kind", type_=sa.String(32), existing_type=sa.String(10)
    )


def downgrade() -> None:
    connection = op.get_bind()
    for table, column in (("data_sources", "kind"), ("mapping_profiles", "source_kind")):
        if connection.scalar(sa.text(f"SELECT count(*) FROM {table} WHERE length({column}) > 10")):
            raise RuntimeError("Cannot downgrade while Moadian import records exist")
    op.alter_column(
        "mapping_profiles", "source_kind", type_=sa.String(10), existing_type=sa.String(32)
    )
    op.alter_column("data_sources", "kind", type_=sa.String(10), existing_type=sa.String(32))
