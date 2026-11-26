"""Upgrade the configured Didban database before starting API and worker."""

from .db import migrate_schema

if __name__ == "__main__":
    migrate_schema()
