"""Verify externally authorized independent reviewers without creating attestations."""

from __future__ import annotations
import base64
from datetime import date
import json
import os
from pathlib import Path
import stat
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from payroll_rulepack_evidence import (
    SCOPES,
    artifact,
    load_json,
    object_keys,
    require,
    RulepackError,
    utc_time,
)


def verify_attestation(
    root: Path, policy_path: Path, evidence_hash: str, pack: dict
) -> None:
    require(
        not policy_path.is_symlink()
        and not policy_path.resolve().is_relative_to(root.resolve()),
        "reviewer_policy_must_be_external",
    )
    mode = policy_path.stat()
    require(
        stat.S_ISREG(mode.st_mode)
        and stat.S_IMODE(mode.st_mode) == 0o600
        and mode.st_uid == os.getuid(),
        "reviewer_policy_must_be_owned_private_file",
    )
    policy = load_json(policy_path)
    object_keys(policy, {"format", "keys"}, "invalid_reviewer_policy")
    require(
        policy["format"] == "didban-payroll-reviewers-1"
        and isinstance(policy["keys"], list)
        and 1 <= len(policy["keys"]) <= 20,
        "invalid_reviewer_policy",
    )
    attestation = load_json(artifact(root, "attestation.json"))
    object_keys(
        attestation,
        {
            "format",
            "evidence_hash",
            "reviewer_id",
            "key_id",
            "reviewed_at",
            "scopes",
            "independent_of_producer",
            "signature",
        },
        "invalid_attestation",
    )
    require(
        attestation["format"] == "didban-payroll-attestation-1"
        and attestation["evidence_hash"] == evidence_hash
        and attestation["independent_of_producer"] is True
        and attestation["reviewer_id"].casefold() != pack["producer_id"].casefold()
        and set(attestation["scopes"]) == SCOPES,
        "independent_full_scope_attestation_required",
    )
    reviewed = utc_time(attestation["reviewed_at"])
    keys = [key for key in policy["keys"] if key.get("key_id") == attestation["key_id"]]
    require(len(keys) == 1, "trusted_reviewer_key_required")
    key = keys[0]
    object_keys(
        key,
        {
            "key_id",
            "reviewer_id",
            "public_key_base64",
            "authorization_reference",
            "valid_from",
            "valid_until",
            "years",
            "scopes",
        },
        "invalid_reviewer_key",
    )
    require(
        key["reviewer_id"] == attestation["reviewer_id"]
        and isinstance(key["authorization_reference"], str)
        and bool(key["authorization_reference"].strip())
        and pack["calendar_year"] in key["years"]
        and set(key["scopes"]) == SCOPES
        and date.fromisoformat(key["valid_from"])
        <= reviewed.date()
        <= date.fromisoformat(key["valid_until"])
        and date.today() <= date.fromisoformat(key["valid_until"]),
        "reviewer_authorization_required",
    )
    signed = {k: v for k, v in attestation.items() if k != "signature"}
    try:
        public = Ed25519PublicKey.from_public_bytes(
            base64.b64decode(key["public_key_base64"], validate=True)
        )
        public.verify(
            base64.b64decode(attestation["signature"], validate=True),
            json.dumps(
                signed, sort_keys=True, separators=(",", ":"), ensure_ascii=False
            ).encode(),
        )
    except Exception:
        raise RulepackError("invalid_independent_signature") from None
