.PHONY: install test test-integration test-isolation test-acceptance test-e2e seed-demo verify-backend verify-mvp lint typecheck build compose-check up down migrate

install:
	npm install
	python3 -m pip install -e 'apps/api[dev]'

test:
	npm run test:web
	.venv/bin/pytest -c apps/api/pyproject.toml apps/api/tests

test-integration:
	RUN_INTEGRATION_TESTS=1 .venv/bin/pytest -c apps/api/pyproject.toml apps/api/tests/test_tenant_isolation.py

test-isolation: test-integration

test-acceptance:
	.venv/bin/pytest -c apps/api/pyproject.toml apps/api/tests/test_demo_acceptance.py

test-e2e:
	.venv/bin/python apps/web/e2e/mvp_acceptance.py

seed-demo:
	.venv/bin/python -m app.demo.generate --output demo-data

verify-backend:
	.venv/bin/ruff check --config apps/api/pyproject.toml apps/api
	.venv/bin/mypy --config-file apps/api/pyproject.toml apps/api/app
	.venv/bin/pytest -c apps/api/pyproject.toml apps/api/tests
	RUN_INTEGRATION_TESTS=1 .venv/bin/pytest -c apps/api/pyproject.toml apps/api/tests/test_tenant_isolation.py
	docker compose config --quiet
	docker compose run --rm migrate alembic check

verify-mvp: verify-backend lint typecheck build test-e2e

lint:
	npm run lint:web
	.venv/bin/ruff check --config apps/api/pyproject.toml apps/api

typecheck:
	npm run typecheck:web
	.venv/bin/mypy --config-file apps/api/pyproject.toml apps/api/app

build:
	npm run build:web

compose-check:
	docker compose config --quiet

up:
	docker compose up --build

down:
	docker compose down

migrate:
	docker compose run --rm migrate
