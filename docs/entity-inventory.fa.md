# فهرست موجودیت‌های اجرایی

بازبینی کد ۲۰۲۶/۱۱/۲۲. پس از بارگذاری API، رجیستری SQLAlchemy شامل ۱۲۳ کلاس و ۱۲۳ جدول مدل در ۳۹ ماژول است. جدول فنی `didban_schema_version` جداگانه با SQL ساخته می‌شود. طبقه‌بندی زیر بر اساس مسئولیت در محصول است. یک ردیف می‌تواند موجودیت اصلی، شواهد، تاریخچه یا خروجی محاسبه باشد.

بازخوانی رجیستری از ریشهٔ مخزن

```bash
PYTHONPATH=apps/api .venv/bin/python -c 'from didban.api import app; from didban.models import Base; print(*sorted((m.class_.__name__, m.local_table.name) for m in Base.registry.mappers), sep=chr(10))'
```

برای حدود هر مسیر، [وضعیت جاری](current-implementation.fa.md)، [مدل داده](data-model.fa.md) و [OpenAPI](../contracts/openapi.json) را ببینید.

## شرکت، کاربر و تنظیمات

| کلاس | جدول | منبع |
|---|---|---|
| `User` | `users` | [models.py](../apps/api/didban/models.py) |
| `Company` | `companies` | [models.py](../apps/api/didban/models.py) |
| `Membership` | `memberships` | [models.py](../apps/api/didban/models.py) |
| `CompanyModule` | `company_modules` | [models.py](../apps/api/didban/models.py) |
| `AccountingPermission` | `accounting_permissions` | [accounting_models.py](../apps/api/didban/accounting_models.py) |
| `CompanyAccountingSetup` | `company_accounting_setup` | [accounting_setup_models.py](../apps/api/didban/accounting_setup_models.py) |
| `NumberingSystem` | `numbering_systems` | [numbering_models.py](../apps/api/didban/numbering_models.py) |

جدول‌های `bot_notification_*`، `native_control_runs`، `automation_*`، `native_automation_*`، `learning_patterns` و `operation_learning_*` برای سازگاری و حفظ سابقه نگهداری می‌شوند. مسیرهای مدیریتی و اجرای دوره‌ای یا خودکار آن‌ها حذف شده‌اند.

## دفتر حسابداری

| کلاس | جدول | منبع |
|---|---|---|
| `Account` | `accounting_accounts` | [accounting_models.py](../apps/api/didban/accounting_models.py) |
| `AccountImportPreview` | `account_import_previews` | [accounting_setup_models.py](../apps/api/didban/accounting_setup_models.py) |
| `Draft` | `accounting_drafts` | [accounting_models.py](../apps/api/didban/accounting_models.py) |
| `OperationDraft` | `accounting_operations` | [operation_models.py](../apps/api/didban/operation_models.py) |
| `NativeJournal` | `native_journals` | [posting_models.py](../apps/api/didban/posting_models.py) |
| `JournalCorrectionDraft` | `journal_correction_drafts` | [posting_models.py](../apps/api/didban/posting_models.py) |
| `NativeAccountRole` | `native_account_roles` | [native_reporting_models.py](../apps/api/didban/native_reporting_models.py) |
| `NativeBookReportRun` | `native_book_report_runs` | [posting_models.py](../apps/api/didban/posting_models.py) |

## دوره و افتتاحیه

| کلاس | جدول | منبع |
|---|---|---|
| `Period` | `financial_periods` | [models.py](../apps/api/didban/models.py) |
| `PeriodLock` | `period_locks` | [period_lock_models.py](../apps/api/didban/period_lock_models.py) |
| `PeriodLockEvent` | `period_lock_events` | [period_lock_models.py](../apps/api/didban/period_lock_models.py) |
| `PeriodChecklistItem` | `period_checklist_items` | [period_checklist_models.py](../apps/api/didban/period_checklist_models.py) |
| `PeriodAccountingDraft` | `period_accounting_drafts` | [closing_models.py](../apps/api/didban/closing_models.py) |
| `NativeOpeningEvidence` | `native_opening_evidence` | [native_reporting_models.py](../apps/api/didban/native_reporting_models.py) |
| `NativeZeroOpeningEvidence` | `native_zero_opening_evidence` | [native_reporting_models.py](../apps/api/didban/native_reporting_models.py) |

## خرید، فروش و طرف‌حساب

| کلاس | جدول | منبع |
|---|---|---|
| `CommercialCounterparty` | `commercial_counterparties` | [commercial_models.py](../apps/api/didban/commercial_models.py) |
| `ProformaInvoice` | `proforma_invoices` | [commercial_models.py](../apps/api/didban/commercial_models.py) |
| `Invoice` | `invoices` | [models.py](../apps/api/didban/models.py) |
| `InvoiceSnapshot` | `invoice_snapshots` | [models.py](../apps/api/didban/models.py) |
| `NativeInvoice` | `native_invoices` | [native_invoice_models.py](../apps/api/didban/native_invoice_models.py) |
| `NativeInvoiceTerms` | `native_invoice_terms` | [native_invoice_models.py](../apps/api/didban/native_invoice_models.py) |
| `NativeInvoiceSourceRevision` | `native_invoice_source_revisions` | [native_invoice_models.py](../apps/api/didban/native_invoice_models.py) |
| `NativeInvoiceSnapshot` | `native_invoice_snapshots` | [native_invoice_models.py](../apps/api/didban/native_invoice_models.py) |

## کالا و انبار

| کلاس | جدول | منبع |
|---|---|---|
| `InventoryItem` | `inventory_items` | [inventory_models.py](../apps/api/didban/inventory_models.py) |
| `InventoryWarehouse` | `inventory_warehouses` | [inventory_models.py](../apps/api/didban/inventory_models.py) |
| `InventoryMovement` | `inventory_movements` | [inventory_models.py](../apps/api/didban/inventory_models.py) |

## خزانه و تسویه

| کلاس | جدول | منبع |
|---|---|---|
| `BankMovement` | `bank_movements` | [models.py](../apps/api/didban/models.py) |
| `Settlement` | `settlements` | [models.py](../apps/api/didban/models.py) |
| `Allocation` | `allocations` | [models.py](../apps/api/didban/models.py) |
| `NativeInvoiceAllocation` | `native_invoice_allocations` | [native_invoice_models.py](../apps/api/didban/native_invoice_models.py) |
| `NativeInvoiceAllocationReversal` | `native_invoice_allocation_reversals` | [native_invoice_models.py](../apps/api/didban/native_invoice_models.py) |
| `PlannedPayment` | `planned_payments` | [models.py](../apps/api/didban/models.py) |
| `Cheque` | `cheques` | [cheque_models.py](../apps/api/didban/cheque_models.py) |
| `ChequeEvent` | `cheque_events` | [cheque_models.py](../apps/api/didban/cheque_models.py) |
| `ChequeClearance` | `cheque_clearances` | [cheque_models.py](../apps/api/didban/cheque_models.py) |

## تطبیق و مغایرت

| کلاس | جدول | منبع |
|---|---|---|
| `ReconciliationRun` | `reconciliation_runs` | [models.py](../apps/api/didban/models.py) |
| `ReconciliationDecision` | `reconciliation_decisions` | [models.py](../apps/api/didban/models.py) |
| `GroupMatchDecision` | `group_match_decisions` | [group_match_models.py](../apps/api/didban/group_match_models.py) |
| `ManualGroupPreview` | `manual_group_previews` | [manual_group_models.py](../apps/api/didban/manual_group_models.py) |
| `NativeBankMatchPreview` | `native_bank_match_previews` | [native_bank_match_models.py](../apps/api/didban/native_bank_match_models.py) |
| `CounterpartyReconciliationRun` | `counterparty_reconciliation_runs` | [counterparty_reconciliation_models.py](../apps/api/didban/counterparty_reconciliation_models.py) |

## ورود و پردازش

| کلاس | جدول | منبع |
|---|---|---|
| `ProcessingSession` | `processing_sessions` | [models.py](../apps/api/didban/models.py) |
| `ProcessingIssue` | `processing_issues` | [models.py](../apps/api/didban/models.py) |
| `SourceFile` | `source_files` | [models.py](../apps/api/didban/models.py) |
| `ArchivedSpreadsheet` | `archived_spreadsheets` | [document_archive_models.py](../apps/api/didban/document_archive_models.py) |
| `SourceRow` | `source_rows` | [models.py](../apps/api/didban/models.py) |
| `Interpretation` | `interpretations` | [models.py](../apps/api/didban/models.py) |
| `JournalLine` | `journal_lines` | [models.py](../apps/api/didban/models.py) |
| `ResultManifest` | `result_manifests` | [models.py](../apps/api/didban/models.py) |

## گزارش و داشبورد

| کلاس | جدول | منبع |
|---|---|---|
| `Report` | `reports` | [models.py](../apps/api/didban/models.py) |
| `ReportApproval` | `report_approvals` | [models.py](../apps/api/didban/models.py) |
| `NativeStatementRun` | `native_statement_runs` | [native_reporting_models.py](../apps/api/didban/native_reporting_models.py) |
| `NativeStatementApproval` | `native_statement_approvals` | [native_reporting_models.py](../apps/api/didban/native_reporting_models.py) |
| `SavedReportDefinition` | `report_builder_definitions` | [report_builder_models.py](../apps/api/didban/report_builder_models.py) |
| `SavedReportRun` | `report_builder_runs` | [report_builder_models.py](../apps/api/didban/report_builder_models.py) |
| `NativeBuilderRun` | `native_report_builder_runs` | [report_builder_models.py](../apps/api/didban/report_builder_models.py) |
| `NativeInvoiceBuilderRun` | `native_invoice_builder_runs` | [report_builder_models.py](../apps/api/didban/report_builder_models.py) |

## پیش‌بینی و سناریو

| کلاس | جدول | منبع |
|---|---|---|
| `NativeForecastPlan` | `native_forecast_plans` | [native_forecast_models.py](../apps/api/didban/native_forecast_models.py) |
| `NativeForecastRun` | `native_forecast_runs` | [native_forecast_models.py](../apps/api/didban/native_forecast_models.py) |
| `CashScenario` | `cash_scenarios` | [scenario_models.py](../apps/api/didban/scenario_models.py) |
| `NativeCashScenario` | `native_cash_scenarios` | [native_scenario_models.py](../apps/api/didban/native_scenario_models.py) |

## کارکنان و حقوق

| کلاس | جدول | منبع |
|---|---|---|
| `Employee` | `employees` | [payroll_models.py](../apps/api/didban/payroll_models.py) |
| `EmployeeContract` | `employee_contracts` | [payroll_models.py](../apps/api/didban/payroll_models.py) |
| `PayrollRun` | `payroll_runs` | [payroll_models.py](../apps/api/didban/payroll_models.py) |
| `PayrollSlip` | `payroll_slips` | [payroll_models.py](../apps/api/didban/payroll_models.py) |
| `PersonnelRecord` | `personnel_records` | [models.py](../apps/api/didban/models.py) |

## کنترل و همکاری سند

| کلاس | جدول | منبع |
|---|---|---|
| `Finding` | `findings` | [models.py](../apps/api/didban/models.py) |
| `ControlCase` | `control_cases` | [control_models.py](../apps/api/didban/control_models.py) |
| `ControlActivity` | `control_activities` | [control_models.py](../apps/api/didban/control_models.py) |
| `NativeControlRun` | `native_control_runs` | [native_control_models.py](../apps/api/didban/native_control_models.py) |
| `NativeDocumentThread` | `native_document_threads` | [document_thread_models.py](../apps/api/didban/document_thread_models.py) |
| `NativeDocumentActivity` | `native_document_activities` | [document_thread_models.py](../apps/api/didban/document_thread_models.py) |

## ابعاد و گروه شرکت‌ها

| کلاس | جدول | منبع |
|---|---|---|
| `Dimension` | `financial_dimensions` | [dimensions_models.py](../apps/api/didban/dimensions_models.py) |
| `DimensionAllocation` | `dimension_allocations` | [dimensions_models.py](../apps/api/didban/dimensions_models.py) |
| `DimensionReportRun` | `dimension_report_runs` | [dimensions_models.py](../apps/api/didban/dimensions_models.py) |
| `NativeDimensionAllocation` | `native_dimension_allocations` | [dimensions_models.py](../apps/api/didban/dimensions_models.py) |
| `NativeDimensionReportRun` | `native_dimension_report_runs` | [dimensions_models.py](../apps/api/didban/dimensions_models.py) |
| `CompanyGroup` | `company_groups` | [company_group_models.py](../apps/api/didban/company_group_models.py) |
| `CompanyComparisonRun` | `company_comparison_runs` | [company_group_models.py](../apps/api/didban/company_group_models.py) |
| `IntercompanyMapping` | `intercompany_mappings` | [consolidation_models.py](../apps/api/didban/consolidation_models.py) |
| `DraftConsolidationRun` | `draft_consolidation_runs` | [consolidation_models.py](../apps/api/didban/consolidation_models.py) |
| `ConsolidationApproval` | `consolidation_approvals` | [consolidation_approval_models.py](../apps/api/didban/consolidation_approval_models.py) |

## قواعد و یادگیری

| کلاس | جدول | منبع |
|---|---|---|
| `AutomationRule` | `automation_rules` | [automation_models.py](../apps/api/didban/automation_models.py) |
| `AutomationPreview` | `automation_previews` | [automation_models.py](../apps/api/didban/automation_models.py) |
| `AutomationRun` | `automation_runs` | [automation_models.py](../apps/api/didban/automation_models.py) |
| `NativeAutomationPreview` | `native_automation_previews` | [native_automation_models.py](../apps/api/didban/native_automation_models.py) |
| `NativeAutomationRun` | `native_automation_runs` | [native_automation_models.py](../apps/api/didban/native_automation_models.py) |
| `LearningPattern` | `learning_patterns` | [automation_models.py](../apps/api/didban/automation_models.py) |
| `OperationLearningPattern` | `operation_learning_patterns` | [operation_learning_models.py](../apps/api/didban/operation_learning_models.py) |
| `OperationLearningEvent` | `operation_learning_events` | [operation_learning_models.py](../apps/api/didban/operation_learning_models.py) |
| `OperationLearningCorrection` | `operation_learning_corrections` | [operation_learning_models.py](../apps/api/didban/operation_learning_models.py) |

## مدیریت AI

| کلاس | جدول | منبع |
|---|---|---|
| `ModelRequest` | `model_requests` | [models.py](../apps/api/didban/models.py) |
| `ModelTariff` | `model_tariffs` | [models.py](../apps/api/didban/models.py) |
| `BudgetPolicy` | `budget_policies` | [models.py](../apps/api/didban/models.py) |
| `BudgetReservation` | `budget_reservations` | [models.py](../apps/api/didban/models.py) |
| `InstallationModelBudget` | `installation_model_budgets` | [models.py](../apps/api/didban/models.py) |

## مؤدیان

| کلاس | جدول | منبع |
|---|---|---|
| `MoadianTransmission` | `moadian_transmissions` | [moadian_models.py](../apps/api/didban/moadian_models.py) |
| `MoadianTransmissionEvent` | `moadian_transmission_events` | [moadian_models.py](../apps/api/didban/moadian_models.py) |

## بات و مدارک

| کلاس | جدول | منبع |
|---|---|---|
| `BotConnection` | `bot_connections` | [models.py](../apps/api/didban/models.py) |
| `BotUpdate` | `bot_updates` | [models.py](../apps/api/didban/models.py) |
| `BotIntake` | `bot_intakes` | [bot_intake_models.py](../apps/api/didban/bot_intake_models.py) |
| `BotExtractionAttempt` | `bot_extraction_attempts` | [bot_extraction_models.py](../apps/api/didban/bot_extraction_models.py) |
| `BotExtractionProposal` | `bot_extraction_proposals` | [bot_extraction_models.py](../apps/api/didban/bot_extraction_models.py) |
| `BotExtractionReview` | `bot_extraction_reviews` | [bot_extraction_models.py](../apps/api/didban/bot_extraction_models.py) |
| `BotNotificationPreference` | `bot_notification_preferences` | [bot_notification_models.py](../apps/api/didban/bot_notification_models.py) |
| `BotNotificationDelivery` | `bot_notification_deliveries` | [bot_notification_models.py](../apps/api/didban/bot_notification_models.py) |
| `BotPostingDispatch` | `bot_posting_dispatches` | [bot_posting_models.py](../apps/api/didban/bot_posting_models.py) |
| `BotPostingReview` | `bot_posting_reviews` | [bot_posting_models.py](../apps/api/didban/bot_posting_models.py) |

## زیرساخت و ممیزی

| کلاس | جدول | منبع |
|---|---|---|
| `LoginSession` | `login_sessions` | [models.py](../apps/api/didban/models.py) |
| `LoginAttempt` | `login_attempts` | [models.py](../apps/api/didban/models.py) |
| `AuditEvent` | `audit_events` | [models.py](../apps/api/didban/models.py) |
| `InstallationAudit` | `installation_audit_events` | [models.py](../apps/api/didban/models.py) |
| `Idempotency` | `idempotency_keys` | [models.py](../apps/api/didban/models.py) |
| `InstallationIdempotency` | `installation_idempotency_keys` | [models.py](../apps/api/didban/models.py) |
| `Job` | `outbox_jobs` | [models.py](../apps/api/didban/models.py) |
| `Notification` | `notifications` | [models.py](../apps/api/didban/models.py) |
