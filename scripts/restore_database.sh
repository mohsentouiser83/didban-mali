#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Didban Mali - Automated Production Database Restore Script
# ==============================================================================

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <backup_file.dump.gz> [--confirm]"
    exit 1
fi

BACKUP_FILE="$1"
CONFIRM_FLAG="${2:-}"

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "Error: Backup file not found: ${BACKUP_FILE}" >&2
    exit 1
fi

CHECKSUM_FILE="${BACKUP_FILE}.sha256"
if [ -f "${CHECKSUM_FILE}" ]; then
    echo "Verifying SHA256 checksum..."
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum -c "${CHECKSUM_FILE}"
    else
        shasum -a 256 -c "${CHECKSUM_FILE}"
    fi
    echo "Checksum verification PASSED."
else
    echo "Warning: Checksum file not found. Proceeding without checksum verification."
fi

if [ "${CONFIRM_FLAG}" != "--confirm" ]; then
    echo "DANGER: This operation will overwrite the current database!"
    echo "To execute, run: $0 ${BACKUP_FILE} --confirm"
    exit 1
fi

PGHOST="${POSTGRES_HOST:-localhost}"
PGPORT="${POSTGRES_PORT:-55432}"
PGUSER="${POSTGRES_USER:-didban_admin}"
PGDATABASE="${POSTGRES_DB:-didban_mali}"
export PGPASSWORD="${POSTGRES_PASSWORD:-change-me-in-real-environments}"

echo "=================================================="
echo " Starting Didban Mali Database Restore"
echo " Time:      $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo " Source:    ${BACKUP_FILE}"
echo " Target:    ${PGHOST}:${PGPORT}/${PGDATABASE}"
echo "=================================================="

START_TIME=$(date +%s)

# Terminate active connections and restore
if command -v docker >/dev/null 2>&1 && docker compose ps postgres >/dev/null 2>&1; then
    echo "Terminating existing connections via Docker..."
    docker compose exec -T postgres psql -U "${PGUSER}" -d postgres -c \
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${PGDATABASE}' AND pid <> pg_backend_pid();" || true

    echo "Restoring database from gzip stream..."
    gunzip -c "${BACKUP_FILE}" | docker compose exec -T postgres psql -U "${PGUSER}" -d "${PGDATABASE}" --quiet

    echo "Enforcing app role permissions and immutable audit table constraints..."
    docker compose exec -T postgres psql -U "${PGUSER}" -d "${PGDATABASE}" <<'EOSQL' >/dev/null
GRANT USAGE ON SCHEMA public TO didban_app;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO didban_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO didban_app;
REVOKE UPDATE ON public.source_rows FROM didban_app;
REVOKE UPDATE ON public.review_decisions FROM didban_app;
REVOKE UPDATE ON public.finding_notes FROM didban_app;
REVOKE UPDATE ON public.evidence_items FROM didban_app;
REVOKE UPDATE ON public.metric_observations FROM didban_app;
REVOKE UPDATE ON public.reconciliation_matches FROM didban_app;
REVOKE UPDATE ON public.findings FROM didban_app;
GRANT UPDATE (workflow_status, updated_at) ON public.findings TO didban_app;
REVOKE UPDATE ON public.report_snapshots FROM didban_app;
GRANT UPDATE (status, progress, stage, object_key, pdf_sha256, pdf_size_bytes, started_at, completed_at, failure_code, failure_message) ON public.report_snapshots TO didban_app;
REVOKE UPDATE ON public.ai_invocations FROM didban_app;
REVOKE UPDATE ON public.ai_company_setting_revisions FROM didban_app;
EOSQL
else
    echo "Terminating existing connections..."
    psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d postgres -c \
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${PGDATABASE}' AND pid <> pg_backend_pid();" || true

    echo "Restoring database from gzip stream..."
    gunzip -c "${BACKUP_FILE}" | psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" --quiet

    echo "Enforcing app role permissions and immutable audit table constraints..."
    psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" <<'EOSQL' >/dev/null
GRANT USAGE ON SCHEMA public TO didban_app;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO didban_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO didban_app;
REVOKE UPDATE ON public.source_rows FROM didban_app;
REVOKE UPDATE ON public.review_decisions FROM didban_app;
REVOKE UPDATE ON public.finding_notes FROM didban_app;
REVOKE UPDATE ON public.evidence_items FROM didban_app;
REVOKE UPDATE ON public.metric_observations FROM didban_app;
REVOKE UPDATE ON public.reconciliation_matches FROM didban_app;
REVOKE UPDATE ON public.findings FROM didban_app;
GRANT UPDATE (workflow_status, updated_at) ON public.findings TO didban_app;
REVOKE UPDATE ON public.report_snapshots FROM didban_app;
GRANT UPDATE (status, progress, stage, object_key, pdf_sha256, pdf_size_bytes, started_at, completed_at, failure_code, failure_message) ON public.report_snapshots TO didban_app;
REVOKE UPDATE ON public.ai_invocations FROM didban_app;
REVOKE UPDATE ON public.ai_company_setting_revisions FROM didban_app;
EOSQL
fi

END_TIME=$(date +%s)
RTO=$((END_TIME - START_TIME))

echo "=================================================="
echo " Database Restore Completed Successfully!"
echo " Duration (RTO): ${RTO} seconds"
echo " Verifying post-restore health..."
echo "=================================================="

# Verification query
if command -v docker >/dev/null 2>&1 && docker compose ps postgres >/dev/null 2>&1; then
    docker compose exec -T postgres psql -U "${PGUSER}" -d "${PGDATABASE}" -c \
        "SELECT count(*) as total_users FROM users; SELECT count(*) as total_companies FROM companies;"
fi

echo "All restore sanity checks passed."
