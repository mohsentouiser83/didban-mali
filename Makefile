PYTHON := .venv/bin/python

.PHONY: contracts check test-db test-http test-postgres18 test-compose test-compose-web test-web test-mvp lint serve-api migrate
contracts:
	$(PYTHON) tools/build_schema.py
	$(PYTHON) tools/build_openapi.py

check:
	$(PYTHON) tools/build_openapi.py --check
	$(PYTHON) tools/check_contracts.py

test-db:
	$(PYTHON) tests/test_schema.py

test-http:
	$(PYTHON) tests/test_runtime.py

test-postgres18:
	$(PYTHON) tools/check_postgres18.py

test-compose-web:
	$(PYTHON) tools/check_compose_runtime.py --with-web

test-compose:
	$(PYTHON) tools/check_compose_runtime.py

lint:
	.venv/bin/ruff check tests/test_source_understanding.py tests/test_source_understanding_runtime.py
	.venv/bin/ruff check tests/test_moadian_export.py tests/test_moadian_export_runtime.py
	.venv/bin/ruff check apps/api/didban tests/test_runtime.py tools/check_compose_runtime.py tools/check_postgres18.py tools/ui_test_environment.py tests/test_intake.py tests/test_interpretation.py tests/test_financial_domain.py tests/test_financial_runtime.py tests/test_reconciliation_domain.py tests/test_reconciliation_runtime.py tests/test_cashflow_domain.py tests/test_cashflow_runtime.py tests/test_forecast.py tests/test_forecast_workflow.py tests/test_settlements_runtime.py tests/test_model_provider.py tests/test_model_runtime.py tests/test_intake_model.py tests/test_intake_model_runtime.py tools/smoke_avalai.py tests/test_analysis_runtime.py tests/test_policy_runtime.py tests/test_report_rendering.py tests/test_reports_runtime.py tests/test_delivery_workflow.py tests/test_backup_bundle.py tests/test_installation_config.py tests/test_restore_runtime.py tests/test_capacity_runtime.py tests/test_management_domain.py tests/test_management_runtime.py tests/test_statement_sources.py tests/test_statement_sources_runtime.py tests/test_mvp_acceptance.py tests/test_local_restart.py tools/restart_local.py tools/backup_bundle.py tools/installation_snapshot.py tools/installation_backup.py tools/check_installation_config.py tools/recovery_configuration.py tools/database_archive.py

serve-api:
	PYTHONPATH=apps/api $(PYTHON) -m uvicorn didban.main:create_app --factory --host 127.0.0.1 --port 8000 --no-proxy-headers

migrate:
	PYTHONPATH=apps/api $(PYTHON) -m didban.manage migrate

test-web:
	npm run check:api
	npm run typecheck
	npm run lint
	npm run test:client
	npm run build

# All financial fixtures and databases are disposable; no live model calls.
test-mvp:
	$(MAKE) check lint test-web
	$(PYTHON) tests/test_local_restart.py
	$(PYTHON) tools/check_postgres18.py
	$(PYTHON) tools/check_postgres18.py --suite test_capacity_runtime.py
	$(PYTHON) tools/check_compose_runtime.py --with-web
