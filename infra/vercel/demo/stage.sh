#!/bin/sh
set -eu
umask 077

root=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
mkdir -p "$root/var"
stage=$(mktemp -d "$root/var/vercel-demo.XXXXXX")
mkdir -p "$stage/api/fonts" "$stage/web/apps/web"

rsync -a --exclude __pycache__ "$root/apps/api/didban/" "$stage/api/didban/"
sed -e '/^pytest==/d' -e '/^ruff==/d' -e '/^watchfiles==/d' \
    "$root/apps/api/requirements.txt" > "$stage/api/requirements.txt"
python3 - "$stage/api" <<'PY'
import json
import sys
from pathlib import Path

api = Path(sys.argv[1])
requirements = (api / "requirements.txt").read_text().splitlines()
dependencies = [line.strip() for line in requirements if line.strip() and not line.lstrip().startswith("#")]
(api / "pyproject.toml").write_text(
    '[project]\nname = "didban-mali-demo-api"\nversion = "1.0.0"\n'
    'requires-python = ">=3.12,<3.13"\ndependencies = '
    + json.dumps(dependencies, indent=2)
    + '\n\n[tool.vercel]\nentrypoint = "app:app"\n'
)
PY
cp "$root/infra/vercel/demo/app.py" "$root/infra/vercel/demo/vercel.json" "$stage/api/"
cp "$root"/apps/web/public/fonts/IRANYekanX-*.ttf "$stage/api/fonts/"
printf '3.12\n' > "$stage/api/.python-version"
printf '/.vercel\n/.env*\n/**/__pycache__\n' > "$stage/api/.vercelignore"

cp "$root/package.json" "$root/pnpm-lock.yaml" "$root/pnpm-workspace.yaml" "$stage/web/"
rsync -a --exclude node_modules --exclude '.next*' --exclude '*.tsbuildinfo' \
    --exclude '.env*' --exclude '.vercel' "$root/apps/web/" "$stage/web/apps/web/"
printf '/.vercel\n/.env*\n/**/.env*\n/**/node_modules\n/**/.next*\n' > "$stage/web/.vercelignore"

printf '%s\n' "$stage"
