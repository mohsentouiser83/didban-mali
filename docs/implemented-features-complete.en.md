> طبقه‌بندی مستند — ۲۰۲۶/۱۱/۱۳: مرجع جاری؛ تصمیم مصوب، اجرای موجود و پذیرش آزموده‌شده یکسان نیستند. [وضعیت جاری](current-implementation.fa.md) و [کارهای باز](../todo.md) حدود و وابستگی‌ها را مشخص می‌کنند.

# Didban Mali — Current Capability Guide

Documentation review: 2026-11-13. The earlier pre-rebuild feature guide is preserved in [history](history/pre-doc-refresh-20261113/implemented-features-complete.en.md). Its legacy architecture, routes and live-connection claims do not describe the current application.

The maintained capability/status inventory is [current implementation](current-implementation.fa.md). The actionable English handoff is [todo.md](../todo.md), which separates implementation, validation, access gates and deferred scope.

| Area | Implemented scope | Boundary |
|---|---|---|
| Primary accounting | Chart, versioned drafts, exact-version human posting, immutable journals, reversal/replacement, periods and statements | D22 user-provisional accounting policy; no independent accountant acceptance claim |
| File analysis | Excel/CSV intake, private originals, interpretation/controls, persistent clarification barrier, frozen results | Arbitrary format correctness and production capacity are not guaranteed |
| Financial workflows | Native invoices/allocations, bounded bank matching including manual many-to-many, collections, 30-day forecasts and independent scenarios | Source bases and incomplete/unknown states remain explicit |
| Management | Dimensions, controlled rules/learning, document collaboration, saved reports and selected 100%-owned-company eliminations | Not unrestricted learning, fraud detection, multi-book or universal consolidation |
| AI assistant | Structured model gateway, optional interpretation/extraction, general chat and report fact selection | Native context currently exposes six statement metrics; deeper analysis and semantic report planning remain work |
| Personnel | Imported employee/payroll financial reporting and supported native payroll journal templates | Not statutory payroll/tax calculation or filing |
| Inventory | Single-item on-account purchases/sales, perpetual FIFO and linked ledger/invoice/settlement | Opening stock, transfers, stocktake, cash and multi-line workflows remain incomplete |
| Moadian | File comparison and bounded signed/encrypted direct submission/inquiry | Original Type-1/general/single-line/on-account/exempt-or-zero-rate scope; no live acceptance evidence |
| Bots/media | Pairing, read-only questions, intake/review, explicit journal approval and opt-in notifications | Real channel/OCR/speech acceptance and PDF delivery remain outstanding |
| Operations | Independent Compose stack, restricted PostgreSQL, private storage, scanner and coordinated backup | Verified restore, production workload and deployment acceptance are separate gates |

Accounts are administrator-managed; public signup is not available. The current stack uses a database outbox worker and private storage volume, not the historical Redis/Celery/MinIO stack. Customer adoption, ROI, uptime and commercial validation in older reports are unverified for this rebuild.
