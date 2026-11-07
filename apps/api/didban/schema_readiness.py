"""Reject older table layouts before they become request-time API failures."""

from sqlalchemy import MetaData, UniqueConstraint, inspect
from sqlalchemy.engine import Connection


def require_current_schema(connection: Connection, metadata: MetaData) -> None:
    inspector = inspect(connection)
    missing: list[str] = []
    for table in metadata.sorted_tables:
        columns = {column["name"] for column in inspector.get_columns(table.name)}
        missing.extend(f"{table.name}.{column.name}" for column in table.columns if column.name not in columns)
        # Existing tables are not upgraded by create_all. These keys are required
        # by company-qualified foreign keys on newer tables, including SQLite.
        tenant_key = frozenset(("company_id", "id"))
        expects_tenant_key = any(
            isinstance(constraint, UniqueConstraint)
            and frozenset(column.name for column in constraint.columns) == tenant_key
            for constraint in table.constraints
        )
        if expects_tenant_key:
            keys = inspector.get_unique_constraints(table.name) + [
                index for index in inspector.get_indexes(table.name) if index["unique"]
            ]
            if not any(frozenset(key["column_names"]) == tenant_key for key in keys):
                missing.append(f"{table.name}.UNIQUE(company_id,id)")
    if missing:
        raise RuntimeError(
            "Database schema is outdated: " + ", ".join(sorted(missing))
            + ". Apply an explicit schema migration before starting; create_all does not upgrade existing tables."
        )
