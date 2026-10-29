"""Authenticated draft-only payroll API import with durable idempotent receipts."""

from __future__ import annotations
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import stat
import tempfile
from urllib.parse import urlsplit
from uuid import UUID
import httpx
from didban.domain.payroll.fingerprint import digest
from payroll_rulepack_evidence import artifact, load_json, object_keys, require


def private_json(path: Path) -> dict:
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "r") as stream:
        info = os.fstat(stream.fileno())
        require(
            stat.S_ISREG(info.st_mode)
            and stat.S_IMODE(info.st_mode) == 0o600
            and info.st_uid == os.getuid(),
            "owned_private_credential_or_receipt_required",
        )
        content = stream.read(16385)
        require(len(content) <= 16384, "private_configuration_size_limit")
    value = json.loads(content)
    require(isinstance(value, dict), "private_configuration_object_required")
    return value


def save_receipt(path: Path, value: dict) -> None:
    descriptor, temporary = tempfile.mkstemp(
        prefix=".rulepack-receipt-", dir=path.parent
    )
    try:
        with os.fdopen(descriptor, "w") as output:
            json.dump(value, output, sort_keys=True, indent=2)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def import_draft(
    root: Path,
    *,
    credential_file: Path,
    company_id: str,
    idempotency_key: str,
    receipt_file: Path,
    trusted_reviewers: Path | None = None,
    validator,
) -> dict:
    """Use the normal authenticated API; never grants access or legal acceptance.

    No review/activation endpoint is invoked. On uncertain network outcomes retry
    the exact same pack/company/key/receipt; server idempotency prevents duplicates.
    """
    require(
        str(UUID(company_id)) == company_id
        and str(UUID(idempotency_key)) == idempotency_key,
        "canonical_company_and_idempotency_uuid_required",
    )
    checked = validator(root, trusted_reviewers=trusted_reviewers)
    require(
        checked["status"] != "draft_evidence_incomplete",
        "complete_original_evidence_required_for_import",
    )
    manifest = load_json(artifact(root, "manifest.json"))
    credentials = private_json(credential_file)
    object_keys(
        credentials, {"origin", "session_cookie"}, "invalid_session_credential_file"
    )
    origin = credentials["origin"]
    require(isinstance(origin, str), "invalid_api_origin")
    parsed = urlsplit(origin)
    require(
        parsed.scheme == "https"
        or (
            parsed.scheme == "http"
            and parsed.hostname in ("127.0.0.1", "localhost", "::1")
        ),
        "secure_api_origin_required",
    )
    require(
        bool(parsed.hostname)
        and not parsed.username
        and not parsed.password
        and parsed.path in ("", "/")
        and not parsed.query
        and not parsed.fragment,
        "invalid_api_origin",
    )
    token = credentials["session_cookie"]
    require(
        isinstance(token, str)
        and 1 <= len(token) <= 2048
        and not any(c in token for c in "\r\n;"),
        "invalid_session_cookie",
    )
    body = {
        "name": manifest["pack_id"] + " [" + checked["evidence_hash"][:12] + "]",
        "effective_from": manifest["effective_from"],
        "effective_to": manifest["effective_to"],
        "content": manifest["rules"],
    }
    request_hash = digest(
        {
            "origin": origin.rstrip("/"),
            "company_id": company_id,
            "idempotency_key": idempotency_key,
            "body": body,
            "evidence_hash": checked["evidence_hash"],
        }
    )
    receipt_file.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if receipt_file.exists() or receipt_file.is_symlink():
        receipt = private_json(receipt_file)
        require(
            receipt.get("request_hash") == request_hash,
            "existing_receipt_request_mismatch",
        )
        if receipt.get("status") == "draft_imported":
            return {
                "status": "draft_imported",
                "rule_id": receipt["rule_id"],
                "legal_verified": False,
                "activated": False,
                "replayed_local_receipt": True,
            }
    else:
        descriptor = os.open(
            receipt_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600
        )
        receipt = {
            "format": "didban-payroll-draft-import-1",
            "status": "prepared_or_unknown",
            "request_hash": request_hash,
            "company_id": company_id,
            "idempotency_key": idempotency_key,
            "api_origin": origin,
            "evidence_hash": checked["evidence_hash"],
            "rule_content_hash": digest(body["content"]),
            "legal_verified": False,
            "activated": False,
        }
        with os.fdopen(descriptor, "w") as output:
            json.dump(receipt, output)
    with httpx.Client(
        base_url=origin.rstrip("/"),
        follow_redirects=False,
        trust_env=False,
        timeout=30,
        cookies={"didban_session": token},
    ) as client:
        csrf = client.get("/api/v1/auth/csrf")
        require(csrf.status_code == 200, "authenticated_csrf_request_failed")
        csrf_token = csrf.json().get("token")
        require(
            isinstance(csrf_token, str) and 1 <= len(csrf_token) <= 2048,
            "authenticated_csrf_response_invalid",
        )
        response = client.post(
            "/api/v1/companies/" + company_id + "/payroll/rules",
            json=body,
            headers={
                "Origin": origin.rstrip("/"),
                "X-CSRF-Token": csrf_token,
                "Idempotency-Key": idempotency_key,
            },
        )
        require(
            response.status_code in (200, 201),
            "draft_import_rejected_or_unknown_retry_same_key",
        )
        result = response.json()
        require(
            str(UUID(result["id"])) == result["id"]
            and result.get("reviewed") is False
            and result.get("legal_verified") is False
            and digest(result.get("content")) == digest(body["content"])
            and all(
                result.get(field) == body[field]
                for field in ("name", "effective_from", "effective_to")
            ),
            "draft_import_response_mismatch",
        )
    receipt.update(
        status="draft_imported",
        rule_id=result["id"],
        imported_at=datetime.now(timezone.utc).isoformat(),
    )
    save_receipt(receipt_file, receipt)
    return {
        "status": "draft_imported",
        "rule_id": result["id"],
        "legal_verified": False,
        "activated": False,
        "replayed_local_receipt": False,
    }
