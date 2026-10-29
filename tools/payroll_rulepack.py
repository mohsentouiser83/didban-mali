"""Validate, capture, stage or import payroll drafts; never activates legal rules.

Official URLs, hashes, TLS and arithmetic checks are evidence, not independent
legal acceptance. Only an externally trusted signed attestation binds a review.
"""

from __future__ import annotations
import argparse
from datetime import date
import json
from pathlib import Path
import re
import shutil
import sys
import tempfile
import httpx as httpx
import jdatetime

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))
from didban.domain.payroll.calculation import (  # noqa: E402
    calculate,
    validate_rules,
    validate_special_tax_profiles,
    tax_amount,
    number,
)
from didban.domain.payroll.fingerprint import digest  # noqa: E402
from didban.domain.payroll.validation import contract_content, work_content  # noqa: E402
from payroll_rulepack_evidence import (  # noqa: E402
    SCOPES,
    KINDS as KINDS,
    RESULT_FIELDS as RESULT_FIELDS,
    RulepackError as RulepackError,
    artifact as artifact,
    document_type as document_type,
    fetch_source as fetch_source,
    file_hash as file_hash,
    load_json as load_json,
    object_keys,
    parameter_paths as parameter_paths,
    require,
    source_url as source_url,
    validate_sources,
)
from payroll_rulepack_signature import verify_attestation  # noqa: E402
from payroll_rulepack_import import import_draft as _import_draft  # noqa: E402


def validate_pack(
    root: Path,
    *,
    trusted_reviewers: Path | None = None,
    require_attestation: bool = False,
) -> dict:
    require(root.is_dir() and not root.is_symlink(), "regular_pack_directory_required")
    manifest_path = artifact(root, "manifest.json")
    pack = load_json(manifest_path)
    object_keys(
        pack,
        {
            "format",
            "pack_id",
            "calendar_year",
            "effective_from",
            "effective_to",
            "producer_id",
            "rules",
            "sources",
            "citations",
            "fixtures",
        },
        "invalid_pack_manifest",
    )
    require(
        pack["format"] == "didban-payroll-rulepack-1"
        and isinstance(pack["pack_id"], str)
        and re.fullmatch(r"[a-z0-9][a-z0-9_-]{2,80}", pack["pack_id"]),
        "invalid_pack_identity",
    )
    require(
        type(pack["calendar_year"]) is int and 1400 <= pack["calendar_year"] <= 1499,
        "invalid_calendar_year",
    )
    require(
        isinstance(pack["producer_id"], str)
        and 1 <= len(pack["producer_id"].strip()) <= 200,
        "producer_identity_required",
    )
    start, end = (
        date.fromisoformat(pack["effective_from"]),
        date.fromisoformat(pack["effective_to"]),
    )
    require(start <= end and (end - start).days <= 366, "invalid_effective_range")
    require(
        jdatetime.date.fromgregorian(date=start).year == pack["calendar_year"]
        and jdatetime.date.fromgregorian(date=end).year == pack["calendar_year"],
        "effective_dates_outside_calendar_year",
    )
    validate_rules(pack["rules"])
    sources, files, ready_evidence = validate_sources(root, pack["sources"], SCOPES)
    require(
        set(pack["rules"]["source_urls"]) <= {s["url"] for s in sources.values()},
        "uncaptured_rule_source",
    )
    citations = pack["citations"]
    require(
        isinstance(citations, dict)
        and set(citations) == parameter_paths(pack["rules"]),
        "every_rule_parameter_requires_citation",
    )
    for citation in citations.values():
        object_keys(citation, {"source_id", "locator"}, "invalid_parameter_citation")
        require(
            citation["source_id"] in sources
            and isinstance(citation["locator"], str)
            and 1 <= len(citation["locator"].strip()) <= 500,
            "parameter_citation_required",
        )
    fixtures = pack["fixtures"]
    require(
        isinstance(fixtures, list) and 5 <= len(fixtures) <= 200,
        "independent_fixtures_required",
    )
    kinds, fixture_ids = set(), set()
    for fixture in fixtures:
        object_keys(
            fixture,
            {"id", "kind", "contract", "work", "expected", "reference"},
            "invalid_fixture",
        )
        require(
            isinstance(fixture["id"], str)
            and fixture["id"] not in fixture_ids
            and fixture["kind"] in KINDS
            and isinstance(fixture["reference"], str)
            and bool(fixture["reference"].strip()),
            "invalid_fixture_reference",
        )
        fixture_ids.add(fixture["id"])
        kinds.add(fixture["kind"])
        contract_content(fixture["contract"])
        work_content(fixture["work"])
        result = calculate(
            fixture["contract"], fixture["work"], pack["rules"], kind=fixture["kind"]
        )
        require(
            isinstance(fixture["expected"], dict)
            and set(fixture["expected"]) == RESULT_FIELDS
            and all(type(value) is str for value in fixture["expected"].values()),
            "complete_exact_fixture_results_required",
        )
        require(
            all(result.get(key) == value for key, value in fixture["expected"].items()),
            "independent_fixture_mismatch",
        )
    require(kinds == KINDS, "all_payroll_kinds_require_fixtures")
    manifest_hash = digest(pack)
    evidence_hash = digest(
        {
            "manifest_hash": manifest_hash,
            "files": {name: file_hash(artifact(root, name)) for name in sorted(files)},
        }
    )
    attestation_file = root / "attestation.json"
    attested = False
    if attestation_file.exists() or attestation_file.is_symlink():
        require(
            trusted_reviewers is not None, "external_trusted_reviewer_policy_required"
        )
        verify_attestation(root, trusted_reviewers, evidence_hash, pack)
        files.add("attestation.json")
        attested = True
    require(
        not require_attestation or (attested and ready_evidence),
        "attested_complete_originals_required",
    )
    return {
        "format": "didban-payroll-stage-1",
        "pack_id": pack["pack_id"],
        "manifest_hash": manifest_hash,
        "evidence_hash": evidence_hash,
        "source_count": len(sources),
        "fixture_count": len(fixtures),
        "artifact_files": sorted(files),
        "status": "attested_staging_only"
        if attested and ready_evidence
        else "draft_evidence_incomplete"
        if not ready_evidence
        else "draft_awaiting_independent_review",
        "independent_signature_validated": attested,
        "retrieval_receipts": "recorded_metadata_not_independent_origin_proof",
        "legal_verified": False,
        "activated": False,
    }


def validate_component(root: Path) -> dict:
    """Validate a tax-only draft without inventing missing insurance/labour rules."""
    pack = load_json(artifact(root, "manifest.json"))
    object_keys(
        pack,
        {
            "format",
            "component_id",
            "calendar_year",
            "effective_from",
            "effective_to",
            "target",
            "parameters",
            "sources",
            "citations",
            "fixtures",
        },
        "invalid_component_manifest",
    )
    require(
        pack["format"] == "didban-payroll-tax-component-1"
        and isinstance(pack["component_id"], str)
        and re.fullmatch(r"[a-z0-9][a-z0-9_-]{2,80}", pack["component_id"]),
        "invalid_component_identity",
    )
    require(
        type(pack["calendar_year"]) is int and 1400 <= pack["calendar_year"] <= 1499,
        "invalid_calendar_year",
    )
    start, end = (
        date.fromisoformat(pack["effective_from"]),
        date.fromisoformat(pack["effective_to"]),
    )
    require(
        start <= end
        and jdatetime.date.fromgregorian(date=start).year == pack["calendar_year"]
        and jdatetime.date.fromgregorian(date=end).year == pack["calendar_year"],
        "effective_dates_outside_calendar_year",
    )
    require(
        pack["target"] in ({"salary"} | (KINDS - {"monthly"})),
        "invalid_tax_component_target",
    )
    params = pack["parameters"]
    object_keys(
        params,
        {"tax_mode", "tax_exemption_monthly", "tax_bands", "rounding_unit"},
        "invalid_tax_component_parameters",
    )
    # Reuse profile shape/range validation; no defaults from other payroll areas.
    validate_special_tax_profiles(
        {
            "eidi": {
                key: value for key, value in params.items() if key != "rounding_unit"
            }
        }
    )
    require(number(params["rounding_unit"]) > 0, "invalid_rounding")
    sources, files, complete = validate_sources(root, pack["sources"], {"tax"})
    require(
        isinstance(pack["citations"], dict)
        and set(pack["citations"]) == parameter_paths(params),
        "every_rule_parameter_requires_citation",
    )
    for citation in pack["citations"].values():
        object_keys(citation, {"source_id", "locator"}, "invalid_parameter_citation")
        require(
            citation["source_id"] in sources
            and isinstance(citation["locator"], str)
            and bool(citation["locator"].strip()),
            "parameter_citation_required",
        )
    require(
        isinstance(pack["fixtures"], list) and 1 <= len(pack["fixtures"]) <= 200,
        "tax_component_fixtures_required",
    )
    for fixture in pack["fixtures"]:
        object_keys(
            fixture,
            {"taxable", "months", "expected_tax", "reference"},
            "invalid_component_fixture",
        )
        require(
            type(fixture["months"]) is int
            and 1 <= fixture["months"] <= 12
            and isinstance(fixture["expected_tax"], str)
            and isinstance(fixture["reference"], str)
            and bool(fixture["reference"].strip()),
            "invalid_component_fixture",
        )
        require(
            tax_amount(number(fixture["taxable"]), params, fixture["months"])
            == number(fixture["expected_tax"]),
            "tax_component_fixture_mismatch",
        )
    return {
        "format": "didban-payroll-component-stage-1",
        "component_id": pack["component_id"],
        "manifest_hash": digest(pack),
        "evidence_hash": digest(
            {
                "manifest": pack,
                "files": {
                    name: file_hash(artifact(root, name)) for name in sorted(files)
                },
            }
        ),
        "source_count": len(sources),
        "fixture_count": len(pack["fixtures"]),
        "status": "draft_component_checks_passed"
        if complete
        else "draft_component_evidence_incomplete",
        "partial_scope": "tax:" + pack["target"],
        "artifact_files": sorted(files),
        "legal_verified": False,
        "activated": False,
    }


def stage_pack(root: Path, target: Path, **options) -> dict:
    require(not target.exists() and not target.is_symlink(), "stage_target_exists")
    result = validate_pack(root, **options)
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        prefix=".payroll-stage-", dir=target.parent
    ) as temp:
        staged = Path(temp) / "pack"
        staged.mkdir(mode=0o700)
        for name in result["artifact_files"]:
            source = artifact(root, name)
            dest = staged / name
            dest.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            shutil.copyfile(source, dest)
            dest.chmod(0o600)
        checked = validate_pack(staged, **options)
        require(checked == result, "pack_changed_during_staging")
        (staged / "stage-result.json").write_text(json.dumps(result, indent=2) + "\n")
        (staged / "stage-result.json").chmod(0o600)
        # mkdir atomically reserves a never-overwritten destination; cleanup only ours.
        target.mkdir(mode=0o700)
        try:
            for path in staged.iterdir():
                shutil.move(str(path), target / path.name)
        except BaseException:
            shutil.rmtree(target)
            raise
    return result


def import_draft(
    root: Path,
    *,
    credential_file: Path,
    company_id: str,
    idempotency_key: str,
    receipt_file: Path,
    trusted_reviewers: Path | None = None,
) -> dict:
    return _import_draft(
        root,
        credential_file=credential_file,
        company_id=company_id,
        idempotency_key=idempotency_key,
        receipt_file=receipt_file,
        trusted_reviewers=trusted_reviewers,
        validator=validate_pack,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("validate", "stage"):
        sub = commands.add_parser(name)
        sub.add_argument("--pack", required=True, type=Path)
        sub.add_argument("--trusted-reviewers", type=Path)
        sub.add_argument("--require-attestation", action="store_true")
        if name == "stage":
            sub.add_argument("--target", type=Path, required=True)
    fetch = commands.add_parser("fetch-source")
    fetch.add_argument("--url", required=True)
    fetch.add_argument("--target", type=Path, required=True)
    fetch.add_argument(
        "--media-type", choices=("application/pdf", "text/html"), required=True
    )
    component = commands.add_parser("validate-component")
    component.add_argument("--pack", type=Path, required=True)
    importer = commands.add_parser("import-draft")
    importer.add_argument("--pack", type=Path, required=True)
    importer.add_argument("--credential-file", type=Path, required=True)
    importer.add_argument("--company-id", required=True)
    importer.add_argument("--idempotency-key", required=True)
    importer.add_argument("--receipt-file", type=Path, required=True)
    importer.add_argument("--trusted-reviewers", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "validate-component":
            result = validate_component(args.pack)
        elif args.command == "import-draft":
            result = import_draft(
                args.pack,
                credential_file=args.credential_file,
                company_id=args.company_id,
                idempotency_key=args.idempotency_key,
                receipt_file=args.receipt_file,
                trusted_reviewers=args.trusted_reviewers,
            )
        elif args.command == "fetch-source":
            result = fetch_source(args.url, args.target, media_type=args.media_type)
        else:
            options = {
                "trusted_reviewers": args.trusted_reviewers,
                "require_attestation": args.require_attestation,
            }
            result = (
                stage_pack(args.pack, args.target, **options)
                if args.command == "stage"
                else validate_pack(args.pack, **options)
            )
        print(json.dumps(result))
    except Exception as error:
        code = (
            str(error)
            if isinstance(error, RulepackError)
            else "rulepack_validation_failed"
        )
        raise SystemExit(code) from None


if __name__ == "__main__":
    main()
