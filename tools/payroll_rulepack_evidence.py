"""Bounded official-source capture and provenance artifact checks; no legal attestation."""

from __future__ import annotations
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import tempfile
from urllib.parse import urlsplit
import httpx

HOSTS = frozenset(
    {
        "tamin.ir",
        "www.tamin.ir",
        "es.tamin.ir",
        "eservices.tamin.ir",
        "mcls.gov.ir",
        "www.mcls.gov.ir",
        "rkj.mcls.gov.ir",
        "hormozgan.mcls.gov.ir",
        "tax.gov.ir",
        "www.tax.gov.ir",
        "regulation.tax.gov.ir",
        "salary.tax.gov.ir",
        "intamedia.ir",
        "www.intamedia.ir",
        "qavanin.ir",
        "www.qavanin.ir",
        "rrk.ir",
        "www.rrk.ir",
        "rc.majlis.ir",
        "natlex.ilo.org",
        "dotic.ir",
        "www.dotic.ir",
    }
)

SCOPES = {"labour", "insurance", "tax"}

KINDS = {"monthly", "eidi", "sanavat", "termination", "arrears"}

RESULT_FIELDS = {
    "gross",
    "employee_insurance",
    "employer_insurance",
    "tax",
    "net",
    "employer_cost",
    "leave_balance_days",
    "insurance_base",
    "tax_base",
    "deductions",
    "unpaid_wages_carry",
    "loan_installment",
    "advance_offset",
}

MAX_SOURCE = 32 * 1024 * 1024


class RulepackError(ValueError):
    """Codes contain no supplied content, source body or credentials."""


def require(condition: bool, code: str) -> None:
    if not condition:
        raise RulepackError(code)


def object_keys(value, keys: set[str], code: str) -> None:
    require(isinstance(value, dict) and set(value) == keys, code)


def load_json(path: Path):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, "duplicate_json_key")
            result[key] = value
        return result

    def reject(_):
        raise RulepackError("non_exact_json_number")

    require(path.stat().st_size <= 2 * 1024 * 1024, "json_size_limit")
    return json.loads(
        path.read_text(),
        object_pairs_hook=pairs,
        parse_float=reject,
        parse_constant=reject,
    )


def source_url(value: str) -> str:
    require(isinstance(value, str) and len(value) <= 2048, "invalid_source_url")
    url = urlsplit(value)
    require(
        url.scheme == "https"
        and url.hostname in HOSTS
        and url.port in (None, 443)
        and not url.username
        and not url.password
        and not url.fragment,
        "official_https_source_required",
    )
    return value


def utc_time(value: str) -> datetime:
    require(isinstance(value, str), "invalid_timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise RulepackError("invalid_timestamp") from None
    require(
        parsed.tzinfo is not None and parsed <= datetime.now(timezone.utc),
        "invalid_timestamp",
    )
    return parsed


def artifact(root: Path, name: str) -> Path:
    require(
        isinstance(name, str) and len(name) <= 250 and "\\" not in name,
        "unsafe_artifact_path",
    )
    relative = PurePosixPath(name)
    require(
        not relative.is_absolute()
        and bool(relative.parts)
        and all(p not in (".", "..") for p in relative.parts),
        "unsafe_artifact_path",
    )
    current = root
    for part in relative.parts:
        current = current / part
        require(not current.is_symlink(), "artifact_symlink_refused")
    require(
        current.is_file() and current.resolve().is_relative_to(root.resolve()),
        "artifact_missing_or_unsafe",
    )
    require(0 < current.stat().st_size <= MAX_SOURCE, "artifact_size_limit")
    return current


def file_hash(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            result.update(chunk)
    return result.hexdigest()


def document_type(path: Path, media: str) -> None:
    with path.open("rb") as source:
        head = source.read(65536).lstrip()
        source.seek(max(0, path.stat().st_size - 2048))
        tail = source.read()
    lower = head.lower()
    require(
        not any(
            marker in lower
            for marker in (
                b"cdn-cgi/challenge",
                b"cf-chl-",
                b"cf_chl_",
                b"just a moment",
                b"challenge-platform",
                b"transferring to the website",
                b"function istehrantimezone",
                b"function values()",
            )
        ),
        "challenge_body_not_official_document",
    )
    if media == "application/pdf":
        require(head.startswith(b"%PDF-") and b"%%EOF" in tail, "pdf_original_required")
    elif media == "text/html":
        require(
            lower.startswith((b"<!doctype html", b"<html")), "official_html_required"
        )
    else:
        raise RulepackError("unsupported_official_document_media")


def parameter_paths(rules: dict) -> set[str]:
    """Cite each executable leaf, including individual progressive tax bands."""

    def walk(value, prefix):
        if isinstance(value, dict):
            return set().union(
                *(
                    walk(
                        child, prefix + "/" + key.replace("~", "~0").replace("/", "~1")
                    )
                    for key, child in value.items()
                )
            )
        if isinstance(value, list):
            return set().union(
                *(
                    walk(child, prefix + "/" + str(index))
                    for index, child in enumerate(value)
                )
            )
        return {prefix}

    return set().union(
        *(
            walk(value, "/" + key)
            for key, value in rules.items()
            if key != "source_urls"
        )
    )


def validate_sources(root: Path, entries: list, required_scopes: set[str]):
    require(
        isinstance(entries, list) and len(required_scopes) <= len(entries) <= 30,
        "legal_sources_required",
    )
    sources, files, ready_evidence, scopes, total = (
        {},
        {"manifest.json"},
        True,
        set(),
        0,
    )
    for source in entries:
        object_keys(
            source,
            {
                "id",
                "scope",
                "url",
                "file",
                "sha256",
                "media_type",
                "evidence_kind",
                "retrieval_receipt",
                "publication_reference",
            },
            "invalid_source_manifest",
        )
        identity = source["id"]
        require(
            isinstance(identity, str)
            and re.fullmatch(r"[a-z][a-z0-9_-]{1,60}", identity)
            and identity not in sources,
            "invalid_source_identity",
        )
        require(
            source["scope"] in SCOPES
            and isinstance(source["publication_reference"], str)
            and 1 <= len(source["publication_reference"].strip()) <= 500,
            "source_reference_required",
        )
        source_url(source["url"])
        require(
            source["evidence_kind"]
            in ("official_document", "official_page", "web_excerpt"),
            "invalid_evidence_kind",
        )
        require(
            source["file"] != "stage-result.json"
            and source["retrieval_receipt"] != "stage-result.json",
            "reserved_stage_artifact_name",
        )
        path = artifact(root, source["file"])
        require(
            re.fullmatch(r"[0-9a-f]{64}", source["sha256"] or "") is not None
            and file_hash(path) == source["sha256"],
            "source_hash_mismatch",
        )
        document_type(path, source["media_type"])
        total += path.stat().st_size
        require(total <= 100 * 1024 * 1024, "pack_size_limit")
        files.add(source["file"])
        scopes.add(source["scope"])
        sources[identity] = source
        complete = source["evidence_kind"] == "official_document"
        if source["retrieval_receipt"]:
            receipt = load_json(artifact(root, source["retrieval_receipt"]))
            object_keys(
                receipt,
                {
                    "format",
                    "url",
                    "final_url",
                    "fetched_at",
                    "sha256",
                    "size",
                    "media_type",
                    "tls_verified",
                },
                "invalid_retrieval_receipt",
            )
            require(
                receipt["format"] == "didban-source-fetch-1"
                and receipt["url"] == source["url"]
                and receipt["sha256"] == source["sha256"]
                and receipt["size"] == path.stat().st_size
                and receipt["media_type"] == source["media_type"]
                and receipt["tls_verified"] is True,
                "retrieval_receipt_mismatch",
            )
            source_url(receipt["final_url"])
            utc_time(receipt["fetched_at"])
            files.add(source["retrieval_receipt"])
        else:
            complete = (
                False  # Manual import remains an explicit unverified-origin draft.
            )
        ready_evidence = ready_evidence and complete
    require(scopes == required_scopes, "required_source_scopes_missing")
    return sources, files, ready_evidence


def fetch_source(url: str, target: Path, *, media_type: str) -> dict:
    """Capture a bounded official HTTPS response with TLS validation enabled."""
    source_url(url)
    require(not target.exists() and not target.is_symlink(), "fetch_target_exists")
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        prefix=".official-fetch-", dir=target.parent
    ) as temp:
        body = Path(temp) / "document"
        with httpx.Client(
            follow_redirects=False, trust_env=False, timeout=30
        ) as client:
            current = url
            for _ in range(5):
                with client.stream("GET", current) as response:
                    if response.is_redirect:
                        current = str(
                            response.url.join(response.headers.get("location", ""))
                        )
                        source_url(current)
                        continue
                    require(response.status_code == 200, "official_source_unavailable")
                    require(
                        response.headers.get("content-type", "").split(";")[0].lower()
                        == media_type,
                        "official_response_media_mismatch",
                    )
                    size = 0
                    with body.open("xb") as output:
                        for chunk in response.iter_bytes():
                            size += len(chunk)
                            require(size <= MAX_SOURCE, "official_source_size_limit")
                            output.write(chunk)
                    break
            else:
                raise RulepackError("official_redirect_limit")
        document_type(body, media_type)
        receipt = {
            "format": "didban-source-fetch-1",
            "url": url,
            "final_url": current,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "sha256": file_hash(body),
            "size": body.stat().st_size,
            "media_type": media_type,
            "tls_verified": True,
        }
        target.mkdir(mode=0o700)
        try:
            shutil.copyfile(body, target / "document")
            (target / "document").chmod(0o600)
            (target / "retrieval.json").write_text(json.dumps(receipt, indent=2) + "\n")
            (target / "retrieval.json").chmod(0o600)
        except BaseException:
            shutil.rmtree(target)
            raise
    return {
        "status": "official_response_captured_pending_review",
        "sha256": receipt["sha256"],
        "size": receipt["size"],
        "legal_verified": False,
    }
