"""Explicitly synthetic trusted review for disposable test databases only."""

import psycopg
from psycopg.types.json import Jsonb
from didban.application.payroll import digest


def register_synthetic_legal_review(test, rule_id, rule_content):
    # test.dsn is RuntimeTests' randomly-created database, never the live install.
    if not test.db_name.startswith("didban_http_"):
        raise RuntimeError("disposable_database_required")
    with psycopg.connect(test.dsn) as conn:
        conn.execute(
            "INSERT INTO app.payroll_legal_reviews(company_id,rule_id,reviewer_reference,source_manifest,rule_content_hash,fixture_manifest) VALUES(%s,%s,%s,%s,%s,%s)",
            (
                test.company,
                rule_id,
                "synthetic fixture — not legal acceptance",
                Jsonb({"synthetic": True}),
                digest(rule_content),
                Jsonb(
                    {"synthetic": True, "expected_gross": "1000", "expected_net": "880"}
                ),
            ),
        )
