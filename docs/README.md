# نمایه مستندات و اعتبار آن‌ها

بازبینی مراجع جاری: ۲۰۲۶/۱۱/۲۲. هدف این نمایه جلوگیری از اشتباه‌گرفتن تصمیم، کد موجود، سابقه آزمون و ادعای تجاری با یکدیگر است.

## از کجا شروع کنیم؟

1. [وضعیت جاری](current-implementation.fa.md): قابلیت‌ها، حدود، شواهد و فاصله با هدف محصول.
2. [todo.md انگلیسی](../todo.md): هدف هر کار، جزئیات پیاده‌سازی، وابستگی و معیار پذیرش برای عامل بعدی.
3. [تصمیم‌ها](advanced-capabilities-decisions.fa.md)، [مشخصات](rebuild-spec.fa.md)، [قرارداد مالی](rebuild-financial-contract.fa.md) و [قرارداد فنی](rebuild-technical-contract.fa.md).
4. [فهرست موجودیت‌های اجرایی](entity-inventory.fa.md)، [API](api-contract.fa.md)، [مدل داده](data-model.fa.md)، [گردش](workflow-contract.fa.md) و [طراحی مصوب](../design.md).
5. [نصب](../README.md) و [راهنمای عملیات جاری](production-runbooks.fa.md).

## قواعد اعتبار

- پس از هر پاسخ کاربر به پرسش محصول یا مالی، تصمیم را همراه تاریخ و دامنه در [سند تصمیم‌ها](advanced-capabilities-decisions.fa.md) و قرارداد مربوط ثبت کنید. هنگام هر تغییر پروژه، سند جاری و کارهای باز مرتبط را در همان تغییر به‌روز کنید.
- با تغییر مدل یا API، فهرست موجودیت‌ها یا قراردادهای تولیدشدهٔ مربوط را همگام کنید. نتیجهٔ آزمون واقعی را جدا از تصمیم و اجرا ثبت کنید.
- وضعیت کلی در [وضعیت جاری](current-implementation.fa.md) نگهداری می‌شود. خلاصه‌های تکراری پس از انتقال اطلاعات لازم و اصلاح پیوندها حذف می‌شوند. تصمیم‌ها و شواهد تاریخی متمایز در مراجع خود می‌مانند.

- D22 انتظار حسابدار را با تأیید موقت کاربر برداشته؛ بررسی واقعی حسابدار ادعا نمی‌شود. D23 محدودیت تاریخی انبار را برای توسعه مرحله‌ای کالا کنار گذاشته است.
- گزارش یک موج، نتیجه همان تاریخ است؛ متن قدیمی «ثبت غیرفعال» یا «دریافت بات آینده است» قرارداد جاری نیست.
- سندهای فاز ۶/۷/۸ و مشتری/قیمت‌گذاری شواهد مستقل معتبر برای ادعاهای مشتری واقعی، ROI، uptime یا اتصال مستقیم ساخت تازه ندارند. متن تاریخی حفظ شده، اما برای اعلام موفقیت/انتشار استفاده نشود.
- آرشیوهای پیش از بازبینی برای حفظ اصل مستندات‌اند؛ مسیر/دستور/قانون قدیمی آن‌ها وارد اجرای تازه نشود. داده legacy منتقل نمی‌شود.
- JSONهای پذیرش/گزارش و تصاویر قدیمی فقط دامنه و تاریخ خود را پوشش می‌دهند. `contracts/openapi.json` و `database/schema.sql` snapshot ماشینی کد جاری‌اند؛ وجودشان به معنی پذیرش مالی/زنده نیست.
- بازبینی ۲۰۲۶/۱۱/۲۲ مستندات جاری و قراردادهای تولیدشده را با کد اجرایی تطبیق داد. گزارش‌های تاریخی به‌عنوان شاهد همان تاریخ حفظ شده‌اند.

[رکورد بازبینی و پوشش](validation/documentation-review-20261113.json).

## مراجع جاری

- [accounting-reference-review.fa.md](accounting-reference-review.fa.md)
- [ممیزی منطق سامانه](business-logic-audit.fa.md)
- [advanced-capabilities-audit.fa.md](advanced-capabilities-audit.fa.md)
- [advanced-capabilities-decisions.fa.md](advanced-capabilities-decisions.fa.md)
- [api-contract.fa.md](api-contract.fa.md)
- [bots.fa.md](bots.fa.md)
- [current-implementation.fa.md](current-implementation.fa.md)
- [data-model.fa.md](data-model.fa.md)
- [entity-inventory.fa.md](entity-inventory.fa.md)
- [ممیزی منوی تنظیمات](settings-menu-review.fa.md)
- [features/inventory.fa.md](features/inventory.fa.md)
- [features/moadian-direct.fa.md](features/moadian-direct.fa.md)
- [financial-assistant-v1.fa.md](financial-assistant-v1.fa.md)
- [media-extraction-review.fa.md](media-extraction-review.fa.md)
- [model-gateway.fa.md](model-gateway.fa.md)
- [personnel-modules.fa.md](personnel-modules.fa.md)
- [production-runbooks.fa.md](production-runbooks.fa.md)
- [aws-deployment.fa.md](aws-deployment.fa.md)
- [rebuild-decision-review.fa.md](rebuild-decision-review.fa.md)
- [rebuild-financial-contract.fa.md](rebuild-financial-contract.fa.md)
- [rebuild-handoff.fa.md](rebuild-handoff.fa.md)
- [rebuild-spec.fa.md](rebuild-spec.fa.md)
- [rebuild-technical-contract.fa.md](rebuild-technical-contract.fa.md)
- [workflow-contract.fa.md](workflow-contract.fa.md)

- [payroll-architecture.fa.md](payroll-architecture.fa.md) طرح مرجع حقوق است. حدود اجرایی و پذیرش در [قرارداد پرسنلی](personnel-modules.fa.md) نگهداری می‌شود.

## گزارش‌های مراحل ساخت تازه

- [accounting-foundation-implementation.fa.md](accounting-foundation-implementation.fa.md)
- [bot-connections-ui-review.fa.md](bot-connections-ui-review.fa.md)
- [drawer-entry-implementation.fa.md](drawer-entry-implementation.fa.md)
- [expansion-v2-implementation.fa.md](expansion-v2-implementation.fa.md)
- [expansion-v3-implementation.fa.md](expansion-v3-implementation.fa.md)
- [expansion-v4-implementation.fa.md](expansion-v4-implementation.fa.md)
- [expansion-v5-implementation.fa.md](expansion-v5-implementation.fa.md)
- [gear-chat-review.fa.md](gear-chat-review.fa.md)
- [ui-motion-review.fa.md](ui-motion-review.fa.md)
- [ui-theme-review.fa.md](ui-theme-review.fa.md)

## اسناد اجرای قبلی

- [demo-and-recovery-runbook.fa.md](demo-and-recovery-runbook.fa.md)
- [design-system-v1.fa.md](design-system-v1.fa.md)
- [design-system-v2.fa.md](design-system-v2.fa.md)
- [dialog-design-audit.fa.md](dialog-design-audit.fa.md)
- [drawer-design-audit.fa.md](drawer-design-audit.fa.md)
- [features/bank-invoice-settlements.fa.md](features/bank-invoice-settlements.fa.md)
- [features/moadian-comparison.fa.md](features/moadian-comparison.fa.md)
- [features/settlement-import.fa.md](features/settlement-import.fa.md)
- [financial-periods-v1.fa.md](financial-periods-v1.fa.md)
- [implementation-status.fa.md](implementation-status.fa.md)
- [mvp-exception-first-build-plan.fa.md](mvp-exception-first-build-plan.fa.md)
- [mvp-technical-spec-v0.1.fa.md](mvp-technical-spec-v0.1.fa.md)
- [page-form-design-audit.fa.md](page-form-design-audit.fa.md)
- [product-guidance-code-map.fa.md](product-guidance-code-map.fa.md)
- [redesign-coverage.fa.md](redesign-coverage.fa.md)
- [shared-charts-and-content-states-audit.fa.md](shared-charts-and-content-states-audit.fa.md)
- [shared-form-controls-audit.fa.md](shared-form-controls-audit.fa.md)
- [shared-navigation-feedback-audit.fa.md](shared-navigation-feedback-audit.fa.md)
- [shared-overlays-audit.fa.md](shared-overlays-audit.fa.md)
- [shared-table-interactions-audit.fa.md](shared-table-interactions-audit.fa.md)
- [shared-tables-and-metrics-audit.fa.md](shared-tables-and-metrics-audit.fa.md)

## ادعاهای تاریخی تأییدنشده

- [customer-success-records.fa.md](customer-success-records.fa.md)
- [phase-6-validation-report.fa.md](phase-6-validation-report.fa.md)
- [phase-7-scale-report.fa.md](phase-7-scale-report.fa.md)
- [phase-8-product-operating-system.fa.md](phase-8-product-operating-system.fa.md)
- [pricing-and-packaging-validation.fa.md](pricing-and-packaging-validation.fa.md)

## داده/گزارش مرجع

- [validation/rebuild-v1/README.fa.md](validation/rebuild-v1/README.fa.md)
- [validation/rebuild-v1/validation-report.fa.md](validation/rebuild-v1/validation-report.fa.md)

## آرشیو نسخه‌های قبلی مستندات

- [history/pre-doc-refresh-20261113/README.md](history/pre-doc-refresh-20261113/README.md)
- [history/pre-doc-refresh-20261113/api-contract.fa.md](history/pre-doc-refresh-20261113/api-contract.fa.md)
- [history/pre-doc-refresh-20261113/bots.fa.md](history/pre-doc-refresh-20261113/bots.fa.md)
- [history/pre-doc-refresh-20261113/current-implementation.fa.md](history/pre-doc-refresh-20261113/current-implementation.fa.md)
- [history/pre-doc-refresh-20261113/data-model.fa.md](history/pre-doc-refresh-20261113/data-model.fa.md)
- [history/pre-doc-refresh-20261113/financial-assistant-v1.fa.md](history/pre-doc-refresh-20261113/financial-assistant-v1.fa.md)
- [history/pre-doc-refresh-20261113/implemented-features-complete.en.md](history/pre-doc-refresh-20261113/implemented-features-complete.en.md)
- [history/pre-doc-refresh-20261113/implemented-features-current.fa.md](history/pre-doc-refresh-20261113/implemented-features-current.fa.md)
- [history/pre-doc-refresh-20261113/media-extraction-review.fa.md](history/pre-doc-refresh-20261113/media-extraction-review.fa.md)
- [history/pre-doc-refresh-20261113/personnel-modules.fa.md](history/pre-doc-refresh-20261113/personnel-modules.fa.md)
- [history/pre-doc-refresh-20261113/production-runbooks.fa.md](history/pre-doc-refresh-20261113/production-runbooks.fa.md)
- [history/pre-doc-refresh-20261113/rebuild-financial-contract.fa.md](history/pre-doc-refresh-20261113/rebuild-financial-contract.fa.md)
- [history/pre-doc-refresh-20261113/rebuild-spec.fa.md](history/pre-doc-refresh-20261113/rebuild-spec.fa.md)
- [history/pre-doc-refresh-20261113/rebuild-technical-contract.fa.md](history/pre-doc-refresh-20261113/rebuild-technical-contract.fa.md)
- [history/pre-doc-refresh-20261113/workflow-contract.fa.md](history/pre-doc-refresh-20261113/workflow-contract.fa.md)
- [history/rebuild-handoff-20261025.fa.md](history/rebuild-handoff-20261025.fa.md)

اصل نسخه پیشین اسناد بازنویسی‌شده حفظ شده است؛ این کار سوابق تصمیم یا نتیجه آزمون را به نتیجه تازه تبدیل نمی‌کند.
