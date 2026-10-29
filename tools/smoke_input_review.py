"""One opt-in synthetic live correction request on a disposable database only.

Never uses a real company, edits installation data or prints secrets/provider bodies.
"""

from __future__ import annotations
import argparse
from dataclasses import replace
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import psycopg

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "apps/api"), str(ROOT / "tests"), str(ROOT / "tools")]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env.model")
    parser.add_argument("--run-live", action="store_true", required=True)
    args = parser.parse_args()
    if not os.environ.get("DIDBAN_TEST_DSN"):
        raise SystemExit("Explicit disposable DIDBAN_TEST_DSN required")
    from smoke_avalai import load_settings
    from test_input_review_runtime import InputReviewTests
    from didban.application.input_review_worker import InputReviewWorker
    from didban.application.interpretation_worker import InterpretationWorker

    settings = replace(
        load_settings(args.env_file), max_output_tokens=1024, max_input_bytes=12000
    )
    if not settings.configured:
        raise SystemExit("Model configuration unavailable")
    summary = {
        "scope": "synthetic_disposable_input_review_live_provider",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "max_external_requests": 1,
        "temporary_budget_ceiling_usd": "0.05",
        "live_installation_modified": False,
        "real_company_data_sent": False,
    }
    case = None
    InputReviewTests.setUpClass()
    try:
        case = InputReviewTests("test_review_server_gate_and_confirmation")
        case.setUp()
        current = case.admin.get("/api/v1/admin/budget-policy")
        budget = case.mutate(
            case.admin,
            "POST" if current.status_code == 404 else "PATCH",
            "/api/v1/admin/budget-policy",
            {"ceiling_usd": "0.05"},
            version=current.json().get("version")
            if current.status_code == 200
            else None,
        )
        if budget.status_code not in (200, 201):
            raise RuntimeError("synthetic_budget_failed")
        data = "entry_id,date,account,debit,credit,entry_type,role,currency,account_name\nE1,2026-09-01,101,100,0,regular,bank,IRR,بانک\nE1,2026-09-01,701,0,100,regular,revenue,IRR,سود سپرده\n".encode()
        session = case.prepared(data=data)
        before = case.review(session)
        target = next(
            a
            for a in before["overview"]["accounts"]
            if a["account_name"] == "سود سپرده"
        )
        comment = case.change(
            session,
            "/comments",
            {
                "snapshot_hash": before["snapshot_hash"],
                "body": "حساب 701 سود سپرده بانک است؛ آن را در سایر درآمدها طبقه‌بندی کن.",
                **{k: target[k] for k in ("file_id", "sheet_name", "account_code")},
            },
        )
        case.assertEqual(comment.status_code, 200)
        queued = case.change(
            session,
            "/proposals",
            {
                "snapshot_hash": before["snapshot_hash"],
                "comment_id": comment.json()["comments"][0]["id"],
            },
        )
        case.assertEqual(queued.status_code, 200)
        worker = InputReviewWorker(case.worker_settings, model_settings=settings)
        case.assertTrue(worker.run_once())
        review = case.review(session)
        proposal = review["proposals"][0]
        summary["proposal_status"] = proposal["status"]
        if proposal["status"] == "proposed":
            decision = case.change(
                session,
                "/proposals/" + proposal["id"] + "/decision",
                {"accept": True, "reason": "Synthetic live integration acceptance"},
            )
            case.assertEqual(decision.status_code, 200)
            case.assertTrue(InterpretationWorker(case.worker_settings).run_once())
            refreshed = case.review(session)
            case.assertNotEqual(refreshed["snapshot_hash"], before["snapshot_hash"])
            confirmation = case.change(
                session, "/confirm", {"snapshot_hash": refreshed["snapshot_hash"]}
            )
            case.assertEqual(confirmation.status_code, 200)
            summary["reinterpreted_and_confirmed"] = True
        with psycopg.connect(case.dsn) as conn:
            rows = conn.execute(
                "SELECT r.status,r.billing_status,r.actual_cost_usd,r.provider_response_id FROM app.model_requests r JOIN app.input_review_proposals p ON p.company_id=r.company_id AND p.model_request_id=r.id WHERE p.company_id=%s",
                (case.company,),
            ).fetchall()
        summary["recorded_requests"] = len(rows)
        summary["receipts"] = [
            {
                "status": r[0],
                "billing_status": r[1],
                "actual_cost_usd": str(r[2]) if r[2] is not None else None,
                "has_provider_response_id": bool(r[3]),
            }
            for r in rows
        ]
        summary["status"] = (
            "passed"
            if proposal["status"] == "proposed"
            and summary.get("reinterpreted_and_confirmed")
            and len(rows) == 1
            else "limited"
        )
    except Exception as error:
        summary["status"] = "failed"
        summary["error_type"] = type(error).__name__
    finally:
        if case:
            case.tearDown()
        InputReviewTests.tearDownClass()
    path = ROOT / "docs/input-review-live-validation.json"
    path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(summary, ensure_ascii=False))
    return 0 if summary.get("status") == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
