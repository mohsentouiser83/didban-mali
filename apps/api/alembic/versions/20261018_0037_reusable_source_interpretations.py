"""Reuse an already scanned source file for an audited interpretation revision."""

import sqlalchemy as sa

from alembic import op

revision = "20261018_0037"
down_revision = "20261018_0036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("uq_import_batches_file", "import_batches", type_="unique")
    op.create_index("ix_import_batches_file", "import_batches", ["file_id"])


def downgrade() -> None:
    if op.get_bind().scalar(sa.text(
        "SELECT EXISTS(SELECT 1 FROM import_batches GROUP BY file_id HAVING count(*) > 1)"
    )):
        raise RuntimeError("Source interpretation history cannot be discarded during downgrade")
    op.drop_index("ix_import_batches_file", table_name="import_batches")
    op.create_unique_constraint("uq_import_batches_file", "import_batches", ["file_id"])
