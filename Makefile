.PHONY: install test test-isolation lint typecheck build compose-check up down migrate

install:
	npm install
	python3 -m pip install -e 'apps/api[dev]'

test:
	npm run test:web
	.venv/bin/pytest -c apps/api/pyproject.toml apps/api/tests

test-isolation:
	RUN_INTEGRATION_TESTS=1 .venv/bin/pytest -c apps/api/pyproject.toml apps/api/tests/test_tenant_isolation.py

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
