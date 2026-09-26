#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Didban Mali - Automated Production Database Backup Script
# ==============================================================================

BACKUP_DIR="${BACKUP_DIR:-/tmp/didban_backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/didban_mali_${TIMESTAMP}.dump.gz"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

PGHOST="${POSTGRES_HOST:-localhost}"
PGPORT="${POSTGRES_PORT:-55432}"
PGUSER="${POSTGRES_USER:-didban_admin}"
PGDATABASE="${POSTGRES_DB:-didban_mali}"
export PGPASSWORD="${POSTGRES_PASSWORD:-change-me-in-real-environments}"

mkdir -p "${BACKUP_DIR}"

echo "=================================================="
echo " Starting Didban Mali Database Backup"
echo " Time:      $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo " Host:      ${PGHOST}:${PGPORT}"
echo " Database:  ${PGDATABASE}"
echo " Target:    ${BACKUP_FILE}"
echo "=================================================="

START_TIME=$(date +%s)

# Execute pg_dump with binary compression or pipe to gzip
if command -v docker >/dev/null 2>&1 && docker compose ps postgres >/dev/null 2>&1; then
    echo "Dumping via Docker container didban-mali-postgres-1..."
    docker compose exec -T postgres pg_dump -U "${PGUSER}" -d "${PGDATABASE}" --clean --if-exists --no-owner | gzip -9 > "${BACKUP_FILE}"
else
    echo "Dumping via local pg_dump..."
    pg_dump -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" --clean --if-exists --no-owner | gzip -9 > "${BACKUP_FILE}"
fi

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Generate SHA256 Checksum
if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${BACKUP_FILE}" > "${CHECKSUM_FILE}"
else
    shasum -a 256 "${BACKUP_FILE}" > "${CHECKSUM_FILE}"
fi

BACKUP_SIZE=$(stat -f%z "${BACKUP_FILE}" 2>/dev/null || stat -c%s "${BACKUP_FILE}")

echo "=================================================="
echo " Backup Completed Successfully!"
echo " File:      ${BACKUP_FILE}"
echo " Size:      ${BACKUP_SIZE} bytes"
echo " Duration:  ${DURATION}s"
echo " Checksum:  $(cat "${CHECKSUM_FILE}")"
echo "=================================================="
