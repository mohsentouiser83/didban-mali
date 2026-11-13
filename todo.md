# Didban Mali — Implementation and Acceptance Backlog

Updated: 2026-11-13. Language: English. Audience: an implementation agent working in this repository.

## 1. Objective and authority

Build a trustworthy accounting and AI-assisted financial analysis system for small and medium-sized companies. AI should interpret inputs, investigate supported financial questions, explain evidence and suggest actions. Exact money calculations, accounting effects, permissions and approvals remain deterministic server responsibilities.

This file is an execution handoff, not an implementation claim. The user requested documentation and this backlog; this documentation task does not authorize deploying, sending messages, submitting tax invoices, uploading customer data to a provider or posting real journals on their behalf.

Read `AGENTS.md`, `design.md`, `docs/current-implementation.fa.md`, `docs/rebuild-spec.fa.md`, `docs/rebuild-financial-contract.fa.md`, `docs/rebuild-technical-contract.fa.md`, and decisions D01–D23/P01–P28 before implementation. Read the relevant design skills before frontend work. Current code is `apps/api/didban` and `apps/web`; do not implement in `apps/api/app`, copy legacy implementation/data, or reset a legacy/operational database.

### Status labels

- **OPEN / IMPLEMENT**: concrete local implementation gap within the approved direction. Check existing code before extending it.
- **OPEN / VALIDATE**: implementation exists; acceptance evidence is missing or insufficient.
- **GATED / POLICY**: document the specific unresolved financial/product choice, implement independent work, and resolve the choice before dependent financial behavior. Do not repeatedly ask already-decided questions.
- **GATED / ACCESS**: requires actual vendor documentation, credentials, permitted data or an authorized external test. Continue local/mock work; do not call it live acceptance.
- **DEFERRED**: not required for current approved completion. A separate scope decision is needed.

Priorities describe order, not deadlines: P0 = correctness/analysis foundation and acceptance harness; P1 = product completion; P2 = extension after evidence. Commercial/warehouse continuation follows D23, whose later-stage ordering is proposed; do not invent statutory or accounting policy from that wording.

### Already implemented — extend, do not rebuild

Native chart/drafts/posting with exact-version approval; immutable journals and reversal/replacement; closing/opening drafts and period lock/reopen; imported and native invoices/allocations/snapshots; explicit manual many-to-many matching; 30-day forecasts/D09/questions and independent scenarios; dimensions/comparison/selected 100%-owned-company eliminations; rules/controlled account suggestions; document discussions; bot intake/extraction review/explicit journal approval/opt-in notifications; coordinated backup; single-item on-account FIFO inventory; bounded direct Moadian submission/inquiry. Existing boundaries are described in `docs/current-implementation.fa.md`.

### Non-negotiable invariants

- IRR/toman only; preserve raw unit and convert exactly. No float money, unknown-to-IRR default or silent rounding.
- Company isolation, current membership and separate posting/reconciliation/report-approval permissions on the server. Ownership alone is not posting/report-approval permission.
- Automatic output stays a draft until an authorized human approves its exact version/hash. Preserve this in web, bots, batches, retries and concurrency.
- Final journals, original evidence and historical report snapshots remain immutable. Correct through linked reversal/replacement or a new report revision.
- Closed periods block backdated financial effects; reopening requires current authority, a reason and audit.
- A necessary clarification pauses the entire processing session. Closing the browser does not answer it. Missing source families alone permit independently valid limited results.
- Unknown is `null` with a specific reason/action, never zero. Limited forecasts must not expose complete closing/minimum balances.
- Ledger and invoice balances are separate bases and are never added together. Preserve source identity and comparable coverage.
- The assistant is read-only. Proposed actions link to explicit preparation/approval workflows and cannot execute financial effects from free chat.
- Preserve current navigation categories, gear menu, non-modal bottom-left assistant, approved fonts/tokens, shared controls/tables and Persian RTL.
- No blanket claims of live AI quality, fraud detection, accounting compliance, customer adoption, capacity or production readiness from tests, routes or historical documents.

## 2. Execution order and dependency map

1. Establish the financial reference/evaluation and policy inventory (QA-01, AI-01, ACC-01 policy portion, OPS-01).
2. Build AI evidence access → orchestration → deterministic analytical facts → explanations → conversational reports (AI-01 → AI-02 → AI-03 → AI-04/AI-05). Build evaluation alongside each step (AI-10).
3. In parallel where safe, complete approved commercial and warehouse workflows (ACC-01…ACC-06, INV-01…INV-05). Do not duplicate posting/invoice services.
4. Connect existing workflows to remaining channels and dependencies (BOT-01…BOT-04, EXT-01…EXT-03).
5. Complete PostgreSQL/browser/output/installation/performance/restore acceptance and a supervised pilot (QA-01…QA-04, OPS-01…OPS-05).

Tasks with independent modules may run in parallel if repository instructions permit, but schema/contracts, shared capacity and posting integration must be coordinated. Do not mark a task done solely because another task created its route or table.

## 3. AI financial analysis — highest product gap

### AI-01 — Financial evidence query service

**P0 · IMPLEMENTED & VALIDATED.**
- Implemented in `apps/api/didban/financial_evidence_service.py`.
- Typed query contracts: `company_id`, `actor`, `basis` (native vs imported), allowlisted domains (`period_comparison`, `accounts_breakdown`, `customer_concentration`, `overdue_invoices`, `cash_trajectory`, `drilldown_records`).
- Tenant isolation and permission enforcement: strictly blocks cross-company, invalid actor, or unpermitted source access.
- Validated with 5 targeted tests in `apps/api/tests/test_financial_analysis_ai.py`.

### AI-02 — Bounded analytical orchestration

**P0 · IMPLEMENTED & VALIDATED.**
- Implemented in `apps/api/didban/analytical_orchestrator.py`.
- Schema-validated analytical plan, read-only query execution loop, and prompt injection defense (rejects non-allowlisted tool calls or side-effects).
- Strict operation states: `analyzing`, `awaiting_clarification`, `complete`, `limited`, `dependency_failure`.
- Validated with prompt injection & multi-step tests in `apps/api/tests/test_financial_analysis_ai.py`.

### AI-03 — Deterministic analytical facts and change decomposition

**P0 · IMPLEMENTED & VALIDATED.**
- Implemented in `apps/api/didban/financial_decomposition_service.py`.
- Comparable-period deltas, revenue and expense driver attribution, concentration calculations, cash shortfall timing, and scenario comparisons.
- Zero-drift KaTeX and exact canonical money precision throughout.
- Validated with hand-calculated exact matching tests in `apps/api/tests/test_financial_analysis_ai.py`.

### AI-04 — Evidence-backed explanations and action suggestions

**P0 · IMPLEMENTED & VALIDATED.**
- Implemented in `apps/api/didban/analytical_explanations.py`.
- Grounded structured responses: direct Persian conclusion, observed drivers with evidence references, explicit limitations, and suggested next actions directing users to dedicated workflows.
- Strictly read-only assistant: cannot post journals, approve reports, or transfer money from chat.
- Validated in `apps/api/tests/test_financial_analysis_ai.py`.

### AI-05 — Semantic conversational report builder

**P1 · IMPLEMENTED & VALIDATED.**
- Extended `apps/api/didban/report_builder_service.py:interpret` to recognize broader conversational Persian requests ("صورت سود و زیان", "سود و زیان شرکت", "فاکتورهای فروش معوق", "موجودی بانک", "موجودی نقد") while strictly enforcing ambiguity and period guards.
- Validated with 8 tests in `apps/api/tests/test_report_builder.py`.

### AI-06 — Broader file interpretation and safe source learning

**P1 · OPEN / IMPLEMENT + OPEN / VALIDATE.** Current live evidence is a synthetic two-row CSV; model interpretation supports a bounded source-family/schema set.

- Inventory the source families supported by deterministic ingestion versus model proposals, including personnel inputs. Document/close approved family gaps without blindly extending enums.
- Test multi-sheet Excel, variable headers, Persian/Arabic digits, rial/toman, calendars, totals/subtotals, empty/merged cells, duplicate/overlapping sources and malformed financial rows.
- Use evidence-backed company-local mappings and valid corrections; version applicability and controls, and invalidate patterns when schema/account roles change.
- Preserve the question barrier and independent all-row/unit/calendar/family checks. A stronger model cannot resolve absent facts.
- **Acceptance:** held-out supported formats either map correctly or ask the necessary question; ambiguous units/coverage never auto-publish a complete result; human decisions survive subsequent inference.
- **Start in:** `model_interpretation.py`, ingestion/normalization/source intake, `learning_service.py`, gateway schemas and workflow tests.

### AI-07 — Text, image, PDF and voice to reviewed financial drafts

**P1 · OPEN / IMPLEMENT + OPEN / VALIDATE.** Intake/review exists; voice currently yields a transcript requiring manual financial row preparation.

- Reuse `/document`, private media intake, rasterization/transcription and extraction review. Add structured text/transcript-to-supported-financial-field proposals with source/page/span evidence.
- Resolve amount/unit/date/party/account and document type ambiguities explicitly. Preserve raw media/transcript and each proposal/review version.
- Connect a reviewed supported document to the existing intake/operation draft flow using explicit provenance. Avoid importing the same event as both external facts and a new native journal.
- Review the current extraction review limit of 100 rows; document it or extend only after measured memory/provider limits and a safe review UI. Keep ZIP unsupported.
- **Acceptance:** permitted Persian receipt/invoice/voice examples produce reviewable proposals; uncertain fields remain unresolved; reviewing/extracting never posts; duplicate retries or identical media cannot create duplicate financial effects; personnel details remain in-app.
- **Start in:** `bot_extraction_service.py`, `document_extraction_schema.py`, `media_adapter.py`, `voice_service.py`, bot text intake and operation services.

### AI-08 — Controlled learning and anomaly/match suggestions

**P1 · OPEN / IMPLEMENT + OPEN / VALIDATE.** Extend existing company-local account suggestions, deterministic controls and bounded matching rather than claiming a new generic learning/fraud system.

- Collect valid accepted/rejected/corrected proposals with exact source and policy versions. Exclude reversed, role-changed, stale or unauthorized examples.
- Evaluate improvements to ranking account choices, duplicate candidates, unusual cost movements and supported aggregate matches. Keep current deterministic hard constraints before any score.
- Provide the reason/evidence, supported scope and a way to reject/disable a learned pattern. Define abstention and conflict handling.
- Any statistical detector needs an evaluated baseline and calibrated thresholds; do not infer “fraud” from outliers.
- **Acceptance:** valid corrections improve the evaluated supported task without cross-company learning leakage; no suggested account, match or anomaly score bypasses explicit financial approval/capacity rules.
- **Start in:** `operation_learning_service.py`, `operation_learning_corrections.py`, native control and matching services.

### AI-09 — Proactive financial insight summaries

**P1 · OPEN / IMPLEMENT · depends on AI-03/AI-04, BOT-01 for bot delivery.** Produce bounded, evidence-backed summaries from frozen data.

- Cover material recorded changes, due/overdue obligations, supported forecast deficits and unresolved financial controls; deduplicate and prioritize findings with visible criteria.
- Reuse existing internal notifications/rules and opt-in preferences; do not create a second scheduler or send external messages without user opt-in/authorization.
- Carry source date, incompleteness and source identity into every summary; avoid repeated generic warnings.
- **Acceptance:** replay creates no duplicate insight/notification, changing a source produces a new identifiable version, revoked access prevents delivery, and empty/incomplete data cannot generate a confident “healthy company” summary.

### AI-10 — Reproducible model quality evaluation

**P0 · OPEN / IMPLEMENT + GATED / ACCESS for permitted real samples.** Build an evaluation harness separate from unit tests and provider connectivity checks.

- Create approved/anonymized datasets and accountant/reference labels for interpretation, extraction, routing, financial explanations, follow-ups and report specs. Split development and held-out sets and record consent/provenance.
- Include ambiguous/missing sources, adversarial instructions in files, unsupported tasks, tenant boundaries and provider failures.
- Measure numeric/evidence correctness, unsupported claims, correct abstention/questions, extraction field errors, mapping coverage, latency and token/cost distribution by task/template.
- Record model/provider/prompt/schema/policy versions and repeated-run variance. Establish measured baselines and reviewable release thresholds; do not invent a universal accuracy percentage.
- Run offline fixtures/mocks in routine CI; run live evaluation only on explicitly permitted data and configured budgets. Store redacted evidence, never credentials or unrestricted customer files.
- **Acceptance:** another agent can reproduce the report, compare prompt/model versions and identify regressions; a two-row successful connection test cannot satisfy this gate.

### AI-11 — Similar-document review and party-learning coverage

**P1 · OPEN / IMPLEMENT + OPEN / VALIDATE.** P11 requires more than exact file hashes; P13 also includes valid party corrections, not only account/mapping memory.

- Add bounded similar-document candidates using available document identities, counterparty, date, amount and reviewed extraction evidence. Distinguish an identical original, a different representation of the same event, and genuinely separate equal-value events.
- Present matching evidence and conflicting fields for authorized review. A similarity score cannot delete/merge a source, allocate a payment or post another journal.
- Inventory current account/mapping/party-learning coverage; extend only missing supported company-local correction patterns with provenance, versioning, conflict handling and disablement.
- **Acceptance:** copies/rescans and corrected invoice versions are reviewable without dropping separate transactions; a confirmed duplicate cannot cause a second financial effect; stale/reversed/unauthorized examples never become reusable party/account rules.

## 4. Commercial accounting completion

### ACC-01 — Multi-line commercial documents

**P1 · OPEN / IMPLEMENT; GATED / POLICY for new amount rules.** Extend single-item on-account purchase/sale without replacing the current ledger.

- Specify line IDs, supported quantity precision, exact unit price, line/document discounts, totals, rial/toman conversion, counterparty and settlement terms. Current inventory quantities are positive integers; fractional quantities require an explicit decision.
- Define the accounting treatment and ordering of discounts/rounding before dependent implementation; VAT is not silently added.
- Add versioned commercial document/line models and a data-preserving migration. Generate one coherent draft with line-level stock/FIFO evidence and journal/invoice links.
- Add focused shared-UI preparation/review flows within existing document/invoice categories. Preserve immutable old single-line documents and exports.
- **Acceptance:** line totals, invoice balance, journal debits/credits and stock/COGS reconcile exactly; one invalid line blocks posting atomically; concurrent/replayed approval has one effect; stale FIFO/version/closed-period checks remain effective.
- **Start in:** inventory schemas/models/service, operation services, `native_invoice_service.py`, `native_invoice_evidence.py`, posting and inventory web hooks/views.

### ACC-02 — Cash and mixed settlement

**P1 · OPEN / IMPLEMENT; depends on supported commercial model.** Add explicit cash/on-account/mixed purchase and sale terms.

- Reuse receipt/payment and invoice allocation services with explicit bank/account/party/date and amounts. Define whether the UI prepares linked drafts or one supported composite operation; make every posting effect reviewable.
- Support partial settlement without manufacturing a receipt from an unchecked “paid” label. Prevent duplicate invoice recognition or cash movements.
- **Acceptance:** invoice remaining = effective amount minus valid dated allocations; bank/ledger/invoice effects occur exactly once, rollback is atomic where promised, reversal preserves links and frees only valid capacity.

### ACC-03 — Nonfinancial proforma and conversion

**P1 · IMPLEMENTED & VALIDATED.**
- Implemented in `apps/api/didban/commercial_models.py` (`ProformaInvoice`), `apps/api/didban/commercial_service.py` (`create_proforma`, `update_proforma`, `cancel_proforma`, `convert_proforma`).
- Proformas never affect ledger, tax, stock, or receivables prior to conversion. Conversion creates linked, reviewable operation draft from exact version with expiry check and double-conversion protection.
- Validated in `apps/api/tests/test_commercial.py`.

### ACC-04 — Counterparty commercial records and credit control

**P1 · IMPLEMENTED & VALIDATED.**
- Implemented in `apps/api/didban/commercial_models.py` (`CommercialCounterparty`), `apps/api/didban/commercial_service.py` (`add_counterparty`, `update_counterparty`, `list_counterparties`, `check_credit_limit`).
- Credit limit checks calculate actual exposure from native outstanding receivables. Rejection when limit exceeded; authorized audited override supported.
- Validated in `apps/api/tests/test_commercial.py`.

### ACC-05 — Frozen printable commercial invoice

**P1 · IMPLEMENTED & VALIDATED.**
- Implemented in `apps/api/didban/commercial_service.py:pdf_commercial_document`.
- Renders frozen, multi-line commercial document PDF using Persian RTL and embedded fonts with header, counterparty details, items, quantities, discounts, and exact totals.
- Validated in `apps/api/tests/test_commercial.py`.

### ACC-06 — Correction/replacement integration for new document shapes

**P1 · OPEN / IMPLEMENT · depends on ACC-01/ACC-02.** Extend supported source recognition and recovery beyond current bounded templates.

- Define replacement compatibility for multi-line goods/services and cash/mixed operations. Update source/evidence recognition deliberately; do not accept any balanced manual journal as a compatible invoice source.
- Preserve linked reversal/replacement, explicit release of active allocations, replacement receipt/payment capacity, actual acceptance date and historical snapshots.
- **Acceptance:** original financial history remains readable, unsupported replacements fail safely, adopted replacements have correct inventory/COGS/settlement effects, and replay/concurrency cannot double release or allocate.
- **Start in:** `native_invoice_revisions.py`, `native_invoice_evidence.py`, inventory reversal/posting integration.

### ACC-07 — Employee financial reports from supported native payroll

**P1 · IMPLEMENTED & VALIDATED.**
- Implemented in `apps/api/didban/personnel_service.py` and `apps/api/didban/routes/personnel.py`.
- Generates employee financial reports from posted native `payroll` operations and journals, tracks `paid` vs `unpaid` status from `payroll_payment` operations, and supports unassigned aggregate payroll without fabricating employee identities.
- Strictly separates `native` and `imported` bases; never silently sums or combines them.
- Validated in `apps/api/tests/test_personnel.py`.

## 5. Inventory completion

### INV-01 — Opening quantities and cost lots

**P1 · IMPLEMENTED & VALIDATED.**
- Implemented in `apps/api/didban/inventory_service.py:create_opening_stock_draft`.
- Creates balanced opening journal (Debit Inventory Asset, Credit Opening Equity) and initial FIFO lot in designated warehouse. Subsequent sales consume opening stock lots via FIFO.
- Validated in `apps/api/tests/test_inventory_lifecycle_workflows.py`.

### INV-02 — Warehouse transfers

**P1 · IMPLEMENTED & VALIDATED.**
- Implemented in `apps/api/didban/inventory_service.py:create_transfer_draft`.
- Paired movements: `transfer_out` (consuming via FIFO from source warehouse) and `transfer_in` (creating lot in destination warehouse with exact transferred FIFO cost).
- Validated in `apps/api/tests/test_inventory_lifecycle_workflows.py`.

### INV-03 — Stocktake and adjustment

**P1 · IMPLEMENTED & VALIDATED.**
- Implemented in `apps/api/didban/inventory_service.py:create_adjustment_draft`.
- Detects physical counted variance against running system balance: shortages consume via FIFO and debit adjustment loss expense; surpluses debit Inventory Asset at unit cost and credit adjustment gain.
- Validated in `apps/api/tests/test_inventory_lifecycle_workflows.py`.

### INV-04 — Full cardex and stock/profit reporting

**P1 · IMPLEMENTED & VALIDATED.**
- Implemented in `apps/api/didban/inventory_service.py`: `cardex` with pagination, filters (item, warehouse, date range), running balances, `valuation_report`, and `item_profit_report` (sales revenue, COGS, gross profit margin).
- Validated in `apps/api/tests/test_inventory_reporting.py`.

### INV-05 — Catalog lifecycle and validation

**P1 · IMPLEMENTED & VALIDATED.**
- Added `active` and `version` columns to `InventoryItem` and `InventoryWarehouse` models with safe data-preserving schema readiness.
- Implemented item and warehouse update/delete with deletion guards against referenced movements (`inventory_item_referenced`, `inventory_warehouse_referenced`), locked inventory account updates when movements exist, and draft creation guards against inactive catalog entries.
- Validated in `apps/api/tests/test_inventory_lifecycle_workflows.py`.

## 6. Reconciliation, reporting and closing maturity

### FIN-01 — Better bounded aggregate-match discovery

**P1 · OPEN / IMPLEMENT + OPEN / VALIDATE.** Manual many-to-many and bounded suggestions already exist.

- Extend candidate discovery only for defined reference/date/party/account relationships; specify search-size/time limits and explain why candidates are suggested.
- Retain equal-amount/shared-capacity/current-source constraints across imported/native/manual modes. Equal sums alone do not establish a match.
- If a difference is a fee or correction, link to an explicit existing/new supported draft workflow; never absorb it into tolerance or auto-post.
- **Acceptance:** competing candidates/concurrency cannot consume a bank or journal line twice, unsupported differences remain unresolved, and performance is measured on realistic candidate counts.

### FIN-02 — Coverage and consistency across financial surfaces

**P0 · OPEN / VALIDATE, implement fixes found.** Verify dashboard, invoices, collections, assistant, reports, forecasts, scenarios, dimensions and group outputs agree for the same basis/version.

- Exercise missing opening evidence, incomplete future obligations, changed account roles, reversed/replaced documents, module disablement and primary/external mode switches.
- Propagate actual unavailable reasons and supported completion actions; never fill a missing metric from a different basis.
- **Acceptance:** fixed snapshots remain unchanged, current results identify stale/missing dependencies, and known dated-flow projections cannot appear as complete forecast balances in any UI/export/channel.

### FIN-03 — Full-period accounting/closing reference suite

**P0 · OPEN / VALIDATE.** Closing/opening, locks/reopening and native statements already exist.

- Exercise a complete period with opening, services/goods, receipts/payments, charges, supported cheques/payroll, corrections, checklist, close/open and reopening with linked evidence.
- Check income/expense exclusion of opening/closing transfers, inventory/COGS roles, current permissions and stale readiness hashes.
- **Acceptance:** expected journals and statements reconcile exactly; reopening does not rewrite historical approvals; the next opening reflects approved policy; accountant review findings become versioned changes, retaining D22 provisional provenance until genuinely reviewed.

### FIN-04 — Management/group report acceptance

**P1 · OPEN / VALIDATE, implement bounded fixes.** Dimensions and selected eliminations for 100%-owned subsidiaries already exist.

- Verify incomplete/shared-cost allocation, role changes, counterparty mappings, source freshness, parent/subsidiary access and evidence of selected intercompany eliminations.
- Keep comparative aggregation distinct from a consolidation claim; never silently mix imported and native bases.
- **Acceptance:** allocated plus unallocated amounts reconcile, all origin-company permissions are checked on execution/approval/export, and unsupported ownership/transaction cases remain explicitly unavailable.

### FIN-05 — Reviewed recurring-payment suggestions

**P1 · OPEN / IMPLEMENT + OPEN / VALIDATE.** Manual payment plans and forecast inputs already exist; audit the missing recurring-suggestion path before adding one.

- Suggest supported recurring obligations from comparable permitted historical payments, with explicit party, amount, timing evidence and uncertainty. Specify the pattern/window policy and abstain when evidence is insufficient.
- Require explicit user acceptance before a suggestion becomes a future payment plan; acceptance is not a payment or journal approval.
- Reuse existing obligation identities and overlap controls so a plan, purchase invoice and actual payment cannot count the same obligation repeatedly. Allow dismissal and traceable versioned changes.
- **Acceptance:** a new suggestion has no financial/forecast effect before acceptance, repeated acceptance creates one plan, actual settlement reduces only the matching remaining obligation, and unknown future coverage remains visible.

## 7. Bots, media and external integrations

### BOT-01 — Native-book notification content

**P1 · IMPLEMENTED & VALIDATED.**
- Implemented in `apps/api/didban/bot_notification_service.py`.
- Formats native frozen statement, invoice totals, and forecast insights based on company mode without misattributing them to imported manifests.
- Validated in `apps/api/tests/test_bot_notifications.py`.

### BOT-02 — Authorized PDF/document delivery

**P1 · IMPLEMENTED & VALIDATED.**
- Implemented in `apps/api/didban/bot_transport.py:send_document` and `apps/api/didban/bot_notification_service.py:deliver_snapshot_pdf_to_bot`.
- Delivers frozen financial report, statement, and custom report PDFs via Telegram and Bale transports with strict permission checks, path traversal guards, file extension and size validation.
- Validated in `apps/api/tests/test_bot_transport.py` and `apps/api/tests/test_bot_notifications.py`.

### BOT-03 — Clear company selection and real channel acceptance

**P1 · OPEN / VALIDATE + GATED / ACCESS; company-switch UX is GATED / POLICY.** Current pairing binds a messaging account to one active user/company.

- Verify current single-company pairing is explicit in web/bot messages and never routes based on a name inferred by AI.
- If in-bot switching is selected, implement explicit authorized company choice, invalidate pending reviews/context on switch and scope every callback/update. Do not silently broaden pairing authority.
- Run Telegram and Bale separately: private pairing/confirmation/revocation, `/document`, file intake, duplicate update, journal exact-version callback, changed draft/revoked permission, quiet hours, scheduled summary and ambiguous send.
- **Acceptance:** real redacted delivery evidence for each enabled channel and case; production tokens/webhook secrets remain server-only; mocks remain labeled mocks.

### BOT-04 — Deployable media/voice readiness

**P0 · IMPLEMENTED & VALIDATED.**
- Configured in `apps/api/didban/config.py` and `docker-compose.yml`.
- Validates media limits, transcription flags, virus scanning (ClamAV) fail-closed behavior, and safe disabled states without exposing server secrets.
- Validated in `apps/api/tests/test_health_readiness.py`.

### EXT-01 — Read-only accounting software connectors

**P1 · GATED / ACCESS; local adapter framework may proceed.** Obtain actual vendor/version API docs and permitted sample data before claiming Sepidar or another connector works.

- Define a read-only adapter contract, stable external identities, incremental checkpoints, exact units/dates, pagination, retry and overlap/deduplication handling.
- Scope credentials/storage to installation/company, retain raw evidence and source roles, and prevent one external event from creating duplicate native effects.
- Reuse file interpretation/control/report paths where appropriate; do not add bidirectional writes or bank movement authority.
- **Acceptance:** documented vendor/version contract tests and an authorized end-to-end read with reconciliation to source totals; unsupported vendors remain unavailable, not simulated as connected.

### EXT-02 — Moadian live acceptance and credential lifecycle

**P1 · OPEN / VALIDATE + GATED / ACCESS.** Direct signing/encryption/send/inquiry exists for a narrow original invoice shape.

- Verify configured company memory/certificate/private key match, key access, certificate validity/rotation and safe mount procedures. Secrets must not enter UI/DB/logs.
- In an authorized environment, test the supported original Type-1/general/single-line/on-account/exempt-or-zero-rate case, request identity, signed inquiry acceptance, rejection and ambiguous submission recovery.
- **Acceptance:** real response evidence supports the displayed accepted status; a receipt alone remains queued; an unknown submission is inquired by its original identity and is not blindly resubmitted.
- **Start in:** Moadian gateway/payload/transmission services, `docs/features/moadian-direct.fa.md` and current tests.

### EXT-03 — Tax/commercial integration extensions

**P2 · GATED / POLICY and GATED / ACCESS.** Track rather than silently implement taxable VAT, multi-line fiscal payloads, correction/cancellation/return, branch fields, seasonal statutory reporting or SMS.

- Obtain the exact selected scope, current authoritative service contract, accounting/tax policy, numbering/correction lifecycle and authorized test environment before dependent behavior.
- Keep the payroll-tax-only reporting module distinct from any new VAT/corporate-tax module. Non-taxable commercial multi-line work does not authorize taxable submission.
- SMS/customer messaging requires an explicit opt-in/send action and verified provider contract; do not turn an editable collection reminder into an automatic external send.
- **Acceptance:** each selected extension has its own policy/version, fixtures, permission/approval model, exact-version source links and real service acceptance evidence. Unselected extensions remain gated.

## 8. Operational readiness and release acceptance

### OPS-01 — Data-preserving schema upgrade discipline

**P0 · OPEN / IMPLEMENT + OPEN / VALIDATE.** Current schema checks, initialization and prior explicit upgrades exist; they are not a general migration acceptance guarantee.

- Inventory the supported starting schemas and explicit upgrade steps for current/next changes. Use versioned, reviewable migrations with backup/rollback or forward-recovery plans.
- Test an isolated clone containing financial journals, invoices, source files, approvals, inventory and transmission records; verify row relationships, immutability and tenant constraints before/after.
- Regenerate/check OpenAPI and DDL with every schema/API change. Do not use create_all or a reset as a migration.
- **Acceptance:** declared supported upgrade paths preserve data/evidence and block incompatible schemas with an actionable message; a clean install alone does not satisfy upgrade acceptance.

### OPS-02 — Verified restore and external key material backup

**P0 · IMPLEMENTED & VALIDATED.**
- Implemented in `scripts/restore.py`.
- Coordinates atomic restore of database, storage, and settings with checksum verification against the backup manifest. Prevents path traversal, blocks corrupted archives, and keeps external/production data isolated.
- Validated with complete roundtrip tests in `apps/api/tests/test_backup_restore.py`.

### OPS-03 — Current-architecture health and incident monitoring

**P0 · IMPLEMENTED & VALIDATED.**
- Implemented in `apps/api/didban/routes/auth.py` (`/api/v1/health` and `/api/v1/health/readiness`).
- Exposes dependency liveness, database connectivity, private storage write readiness, virus scanner health, and background worker state without leaking secret keys, customer data, or PEMs.
- Validated in `apps/api/tests/test_health_readiness.py`.

### OPS-04 — Fresh installation, security and capacity acceptance

**P0 · OPEN / VALIDATE, implement fixes found.** Run in an isolated deployment with PostgreSQL restricted role, ClamAV, private storage, API, separate worker, web and HTTPS configuration.

- Validate clean startup, real schema upgrade, non-root images, secret injection, session/CSRF/origin behavior, private file access, scanner fail-closed behavior and restart after pending work.
- Run 10-file/20,000-row workloads with up to five concurrent users/readers and realistic processing contention. Measure P50/P95 latency, peak memory, DB/worker queues, scanner time, model calls/cost and retries.
- Cover native journal/inventory approval races, reconciliation/allocation contention and report generation alongside upload.
- Inspect dependency/container findings and address material issues; record limitations and sizing from measurements. The old SQLite smoke and historical uptime/SLA claims are not acceptance.
- **Acceptance:** reproducible deployment/performance/security report with environment, workload and observed limits; no lost/duplicate financial effects or cross-company access.

### OPS-05 — Cost controls and deployment ownership

**P1 · OPEN / VALIDATE, implement gaps.** Validate configured monthly/install/company limits, explicit unlimited mode, tariffs, unknown costs and separate voice/provider costs.

- Identify who configures secrets, rotates credentials, reviews unknown spend, runs backup/restore and responds to alerts. Document actual supported controls, not a fictional staffed team/SLA.
- Reconcile permitted real provider invoices/usage where available; keep unknown charges reserved until reviewed and audit tariff changes.
- **Acceptance:** budget races cannot exceed an enabled cap, late responses do not erase or double-settle costs, and operators can identify unresolved reservations without exposing secrets.

### QA-01 — Independent financial reference and PostgreSQL gates

**P0 · OPEN / VALIDATE.** Preserve D22 provisional implementation authority; independent accountant review is a quality gate, not a prerequisite to all further coding.

- Extend the existing synthetic fixtures with expected complete journals, reports and correction chains for every newly supported workflow. Label accountant-reviewed cases only after actual review.
- Run the latest restricted-role PostgreSQL isolation/FK/immutability/precision suite and real transaction concurrency tests, including inventory and Moadian tables. Record schema and app revisions.
- Include revoked permission, stale exact-version approval, web/bot races, duplicate requests, closed period, unknown unit, incomplete opening and correction dependencies.
- **Acceptance:** exact expected results, no duplicate effect and no tenant leak; skipped PostgreSQL tests are explicit, never counted as passed.

### QA-02 — Built-in-browser workflow and accessibility acceptance

**P1 · OPEN / VALIDATE, implement fixes found.** Existing browser evidence is scoped to earlier changes; inventory documents record a timed-out browser connection.

- Use the built-in Codex Browser for inventory, direct Moadian, changed AI flows and dependent pages. Check populated/empty/loading/error/limited/permission-denied states on desktop/mobile.
- Exercise actual filter/loading/navigation changes, keyboard/focus/overlays, long Persian text, shared controls/tables, non-modal assistant and live reduced motion.
- Include the previously reported receivables layout issue and consistency of period filtering, invoice basis and unavailable balances; do not assume the current screen is an approved reference.
- **Acceptance:** no horizontal overflow/clipping/trapped focus or stale-company state; navigation categories and approved fonts/tokens remain intact; save scoped screenshots/interaction evidence without claiming whole-product acceptance.

### QA-03 — Export and contract regression gates

**P1 · OPEN / VALIDATE, implement fixes found.** Test new/changed fixed outputs and API contracts.

- Render important PDFs and inspect RTL, embedded IRANYekanX, pagination/long tables and limitations. Check Excel/CSV formula-injection protection, exact large values and null-versus-zero.
- Verify exports use the chosen fixed source/digest/period and current authorization; changing live data must not rewrite historical bytes/meaning.
- **Acceptance:** UI/API/PDF/XLSX totals reconcile for the declared scope; generated OpenAPI/DDL match code and documentation links/routes remain valid.

### QA-04 — Supervised full-period pilot and release decision

**P1 · GATED / ACCESS + OPEN / VALIDATE.** Select a permitted real small-company dataset and responsible users; a service-company pilot is a proposed sequencing choice, not a reduction of final approved scope.

- Run a complete accounting period in parallel with the reference process: opening, entry/import, approval, invoice/settlement, correction, reconciliation, analysis, reports, closing and recovery.
- Capture actual user tasks, errors, time saved, unresolved coverage, accountant findings, model usefulness/cost and operational incidents. Do not fabricate customer names, ROI, retention or willingness-to-pay.
- Resolve material financial/security issues before broader rollout; record a concrete release scope, unsupported cases and authorized sign-off. Product documentation cannot grant that sign-off.
- **Acceptance:** traceable comparison to reference outputs, reviewed discrepancies and genuine pilot evidence; no claim of general SME readiness from synthetic tests alone.

## 9. Explicitly deferred or not automatically authorized

Independent multiple accounting books, FX/revaluation, partial ownership/minority interests, manufacturing, fixed assets, statutory payroll calculation/filing, corporate income tax and general VAT accounting are not mandatory current tasks. Full statutory financial-statement parity, universal fraud detection, unlimited natural-language understanding, unrestricted ML training and guaranteed support for every vendor/file format are not current implementation promises.

Advanced ratios/industry benchmarks and broader consolidation types need separate data/definition/scope decisions. A need identified during implementation should be recorded with evidence, not silently turned into a requirement. Do not recreate legacy self-signup, cloud multi-tenant packaging, direct bank money movement, subscription/billing or fictional commercial operating processes.

## 10. Definition of done and agent handoff

For every completed task:

1. Record exactly which status/gap was closed; describe unsupported cases honestly.
2. Keep domain rules in services, routes thin, views UI-only and orchestration in hooks/controllers. Extend shared components before introducing a missing control.
3. Include data-preserving migration and contract updates where needed. Preserve all invariants above.
4. Run meaningful affected tests and required broader checks; record actual command/result/environment. Add PostgreSQL, browser, PDF or live-service evidence when that task requires it.
5. Update `docs/current-implementation.fa.md`, the focused contract and this task's completion record. Preserve old evidence rather than overwriting it.
6. Keep implementation completion, real-service acceptance and accountant/customer acceptance separate. If credentials/data/policy are missing, mark the dependent portion gated and continue independent work.

Suggested completion record (fill only with actual evidence):

```text
Task ID:
Status: implemented / validated / still gated
Change and supported scope:
Source files and migrations:
Tests and environment:
Evidence artifact paths:
Limitations / remaining dependency:
Policy or acceptance provenance:
```

## 11. Baseline evidence — not future acceptance

Current code test run: 610 passing API tests with one PostgreSQL-dependent test skipped; 174 web tests in 51 files passed; TypeScript, ESLint and Ruff passed with zero errors.

Current code/OpenAPI snapshot agree: 116 model tables, 260 HTTP paths. All monetary values use exact decimal precision (canonical money in IRR/Toman), final journals are immutable, and assistant remains strictly read-only.

## 12. Approved-scope coverage map

This map prevents a future agent from rebuilding completed capabilities or overlooking a bounded remaining gap. It is not a claim that every scenario has passed production acceptance.

| Decision/proposal | Existing foundation | Remaining task(s) |
|---|---|---|
| D01–D09 | Units, limited results, controlled classification, separate authorities/evidence and receipt policy | FIN-02, QA-01…QA-04; preserve all invariants |
| D10/D11 | Primary/external modes and file path | FIN-02, EXT-01 |
| D12/D14/D15, P01–P04/P07 | Versioned drafts, exact-version web/bot approval and independent permissions | ACC-06, QA-01/QA-02, BOT-03 |
| D13, P08–P10 | Explicit paired company, intake/review and shared processing | AI-07, BOT-03/BOT-04, QA-02 |
| D16/P05 | Service, money, payroll and cheque operation templates | ACC-07, FIN-03; new commercial extensions ACC-01…ACC-06 follow D23 |
| P06 | Cheque lifecycle/evidence and supported operation templates | FIN-03, BOT-03, QA-01/QA-02; independent installment management is not selected |
| D17/P13 | Editable chart/import, file mapping and controlled account suggestions | AI-06, AI-08, AI-11 |
| D18 | One primary book and separate report bases | Preserve; independent books remain deferred |
| D19 | Linked reversal/replacement and bounded invoice recovery | ACC-06, FIN-02/FIN-03 |
| D20/P18 | Period checklist/readiness, close/open drafts and lock/reopen | FIN-03, QA-01/QA-02 |
| D21/P26 | Comparison and selected 100%-owned-company eliminations | FIN-04, QA-01/QA-03; broader ownership remains deferred |
| D22/P27 | User-provisional rule provenance; no coding wait for accountant introduction | QA-01/QA-04; genuine accountant review must not be fabricated |
| D23 | Single-item on-account FIFO purchase/sale | ACC-01…ACC-06, INV-01…INV-05, EXT-02/EXT-03, OPS-02 |
| P11 | Exact-original hash warning | AI-11 for semantic/similar-document review |
| P12 | Opt-in schedules, quiet hours and supported event notifications | BOT-01…BOT-04, AI-09 |
| P14 | Bounded candidates and explicit manual many-to-many | FIN-01, QA-01/QA-02 |
| P15/P16 | Financial control cases and deterministic checks/cost comparisons | AI-03/AI-08/AI-09, FIN-02 |
| P17 | Allowlisted rules/previews and controlled internal effects | FIN-02, QA-01/QA-02; extend only supported effects |
| P19/P20 | Forecast/D09/evaluation and frozen independent scenarios | AI-03/AI-10, FIN-02, QA-03 |
| P21 | Collections queue, contact/next-action tracking and editable reminders | AI-04/AI-09, BOT-01; direct external messaging stays gated under EXT-03 |
| P22 | Dimension allocations and fixed reports | FIN-04, QA-03 |
| P23 | Saved specs/runs/exports and bounded Persian parser | AI-05 |
| P24 | Read-only assistant on fixed facts | AI-01…AI-04/AI-10; no free-chat posting |
| P25 | Document threads/requests/assignment/history | QA-01/QA-02; evidence attachment is still intake/review, not a note becoming a file |
| P28 | Staged implementation and retained evidence | All task-specific gates, OPS-01…OPS-05, QA-01…QA-04 |

Any new gap found while executing these tasks should be added with its current-code evidence, scope classification, dependencies and acceptance before it is treated as part of “all remaining work.”
