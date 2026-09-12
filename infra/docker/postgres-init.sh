#!/bin/sh
set -eu

if ! psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --tuples-only --command \
  "SELECT 1 FROM pg_roles WHERE rolname = '$APP_DB_USER'" | grep -q 1; then
  psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    --set=app_db_user="$APP_DB_USER" --set=app_db_password="$APP_DB_PASSWORD" <<'EOSQL'
CREATE ROLE :"app_db_user" LOGIN PASSWORD :'app_db_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
EOSQL
fi
