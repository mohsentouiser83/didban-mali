> طبقه‌بندی مستند — ۲۰۲۶/۱۱/۱۳: مرجع جاری؛ تصمیم مصوب، اجرای موجود و پذیرش آزموده‌شده یکسان نیستند. [وضعیت جاری](current-implementation.fa.md) و [کارهای باز](../todo.md) حدود و وابستگی‌ها را مشخص می‌کنند.

# مدل داده جاری

بازبینی کد: ۲۰۲۶/۱۱/۲۶. رجیستری اجرایی شامل ۱۳۸ کلاس و ۱۳۸ جدول مدل است. DDL با جدول فنی `didban_schema_version` شامل ۱۳۹ دستور CREATE TABLE است. [فهرست کامل مدل، جدول و فایل](entity-inventory.fa.md) از رجیستری API استخراج شده است.

| حوزه | مدل‌ها/جدول‌های شاخص | مسئولیت |
|---|---|---|
| نصب و هویت | users، login_sessions، installation_audit_events | حساب مدیریت‌شده، نشست و ممیزی نصب |
| شرکت | companies، memberships، company_modules، accounting_permissions | عضویت و تنظیم نسخه‌دار دسترسی ماژول/عملیات در `memberships.module_access`، اختیارهای مستقل شرکت و وضعیت ماژول |
| منابع | processing_sessions، source_files، source_rows، interpretations، processing_issues | اصل ثابت، تفسیر نسخه‌دار، سؤال پایدار |
| اجرا | outbox_jobs، idempotency_keys | lease، fence، generation و replay |
| واردات مالی | journal_lines، bank_movements، invoices، settlements، allocations، invoice_snapshots | facts واردشده با مبنای منبع مستقل |
| دفتر بومی | accounting_accounts، accounting_account_hierarchy، accounting_detail_links، accounting_drafts، accounting_operations، native_journals، native_journal_lines، journal_correction_drafts | پیش‌نویس/ثبت، نسخه دقیق، سطر دائمی سند، برگشت و جایگزین |
| فاکتور بومی | native_invoices، native_invoice_terms، native_invoice_allocations، native_invoice_allocation_reversals، native_invoice_source_revisions، native_invoice_snapshots | اصل ثابت، شرایط، تسویه، پذیرش جایگزین. جدول snapshot برای خواندن شواهد گزارش‌های تاریخی حفظ شده است. |
| بازرگانی | commercial_counterparties، commercial_counterparty_roles، proforma_invoices، commercial_documents، commercial_document_lines، commercial_returns، commercial_return_lines، counterparty_credits، counterparty_credit_applications | کارت و نقش‌های طرف‌حساب، پیش‌فاکتور، فاکتور چندردیفی D24–D34، مرجوعی، قرنطینه و اعتبار مشتری/تأمین‌کننده |
| انبار | inventory_items، inventory_units، inventory_warehouses، inventory_warehouse_items، inventory_movements | هویت کالا با نام واحد پایه، فهرست واحدهای تعریف‌شدهٔ شرکت، انبار، پیوند یکتای کالا و انبار با دو کلید خارجی هم‌شرکت، و گردش چندردیفی متصل به ردیف سند و شواهد FIFO |
| مؤدیان مستقیم | moadian_transmissions، moadian_transmission_events | نسخه تأییدشده، اتصال به فاکتور تجاری و موضوع ۱ تا ۴، شناسه درخواست و سابقه ارسال/استعلام؛ PEM در DB نیست |
| خزانه و چک | treasury_accounts، treasury_points_of_sale، treasury_tool_points_of_sale، treasury_documents، treasury_tool_lines، treasury_allocations، cheques، cheque_events، cheque_clearances | بانک، صندوق، تنخواه و کارت‌خوان متصل به بانک، پیوند تغییرناپذیر کارت‌خوانِ ابزار سند خزانه، سند خزانه، ابزار و تخصیص، صیاد و پشت‌نویسی چک با ظرفیت مشترک بانک |
| دوره | financial_periods، period_locks، period_lock_events، period_checklist_items، period_accounting_drafts | مدیریت/قفل/چک‌لیست/اسناد دوره |
| گزارش بومی | native_account_roles، native_opening_evidence، native_zero_opening_evidence، native_statement_runs، native_statement_approvals | نقش صریح، افتتاح معتبر، صورت مالی و تأیید دقیق |
| پیش‌بینی و سناریو | native_forecast_plans، native_forecast_runs، native_cash_scenarios، cash_scenarios | برنامه نسخه‌دار، سؤال و نتیجه ثابت بدون اثر سند |
| کنترل و تطبیق | native_control_runs، control_cases، native_bank_match_previews، group_match_decisions، manual_group_previews | مبنای ثابت، ظرفیت مشترک و پیگیری |
| قواعد و یادگیری | automation_rules، native_automation_previews/runs، learning_patterns، operation_learning_patterns/corrections/events | قواعد محدود و پیشنهاد از شواهد شرکت |
| ابعاد مدیریتی | financial_dimensions، dimension_allocations/report_runs، native_dimension_allocations/report_runs | تخصیص و گزارش مستقل پروژه، شعبه و مرکز هزینه |
| همکاری | native_document_threads، native_document_activities، control_activities | نظر، مسئول، مهلت و سابقه سند |
| کارکنان | employees، employee_contracts، company_payroll_workshops، payroll_runs، payroll_slips، personnel_records | پروفایل، قرارداد قانونی، کارگاه بیمه، کارکرد واقعی و اسنپ‌شات ثابت فیش بومی، به‌همراه facts مستقل حقوق ورودی |
| بات/رسانه | bot_connections، bot_updates، bot_intakes، bot_extraction_*، bot_posting_*، bot_notification_* | اتصال شخصی، دریافت/بررسی و تأیید مستقل؛ جدول‌های اعلان برای نگهداری سابقه باقی مانده‌اند |
| AI | model_requests، model_tariffs، budget_reservations، installation_model_budgets | درخواست، تعرفه ثابت، تعهد/هزینه و شواهد پاسخ |
| خروجی | result_manifests، reports، report_approvals، report_builder_definitions/runs، native_report_builder_runs، native_invoice_builder_runs | snapshots و اجراهای قابل ردیابی با مبنای صریح |

فهرست کامل ستون‌ها، FK، index و trigger از DDL خوانده شود؛ علامت `/` یا `*` در جدول بالا گروه‌بندی توضیحی است، نام یک جدول تازه نیست.

اصل فایل‌های ورودی جدول و کدینگ در `archived_spreadsheets` به‌صورت ثابت با هش، منشأ، شرکت و بارگذار نگهداری می‌شود. فهرست، محتوای فایل را بارگیری نمی‌کند. اصل‌های پردازش و بات در مدل‌های قبلی خود هستند.

## قیود مشترک

- مبلغ کانونیکال IRR دقیق با numeric(38,6)؛ خام/واحد اصلی حفظ و تومان دقیقاً ×۱۰ می‌شود. هزینه USD مدل حسابداری ریالی نیست.
- تولید DDL برای ۱۰۹ جدول دارای ستون company_id سیاست RLS اجباری ایجاد می‌کند. کلیدهای مرکب شرکت و کنترل سرویس در روابط مالی به کار می‌روند. این بازتولید آزمون اجرایی RLS یا ارتقای نصب موجود نیست.
- جدول‌های سراسری هویت/مسیریابی بات با کنترل actor/عضویت محافظت می‌شوند؛ وجود company_ref به‌تنهایی RLS مالی نیست.
- اصل فایل، رویداد، سند نهایی و snapshot مالی بازنویسی نمی‌شوند؛ برگشت، revision و جایگزینی سابقه را حفظ می‌کنند.
- رکوردهای قدیمی `company_modules` برای حفظ داده در طرح باقی‌اند. تغییر کاربرد شرکت حق خواندن مجاز تاریخچه را حذف نمی‌کند.
- تغییر مدل باید migration صریح و آزمون ارتقای داده‌دار داشته باشد؛ نسخه schema و create_all کافی نیستند.

[قرارداد مالی](rebuild-financial-contract.fa.md)، [اجرای جاری](current-implementation.fa.md)، [کارهای باز](../todo.md).

## مرزهای مهم برای توسعه

- `JournalLine`، `Invoice` و `PersonnelRecord` دادهٔ ورودی‌اند. `NativeJournal`، `NativeInvoice` و مدل‌های کارمند/فیش، گردش بومی را پوشش می‌دهند. پیوند گزارش نباید مبنای آن‌ها را ضمنی عوض کند.
- اقلام پیش‌فاکتور، ردیف‌های پیش‌نویس، تصویر ثبت و شواهد FIFO به صورت JSON در مدل‌های مربوط نگهداری می‌شوند. گردش انبار جدول مستقل دارد و به کالا، انبار، عملیات و سند متصل است. قید یکتایی فعلی بر سند، انبار و نوع حرکت برای چندردیفی شدن باید بازبینی شود.
- داشبورد فعال در `SavedReportDefinition.spec` نگهداری می‌شود. `parties` در رجیستری گزارش‌ساز نمای محاسبه‌شده از دفتر ورودی است. کارت تجاری مستقل در `CommercialCounterparty` قرار دارد.

قابلیت‌های مقایسهٔ شرکت‌ها و حذف‌های درون‌گروهی و پنج مدل اختصاصی آن‌ها در ۲۰۲۶/۱۱/۲۳ حذف شدند. DDL بازتولیدشده فقط نصب تازه را توصیف می‌کند؛ حذف جدول یا تغییر دادهٔ نصب موجود اجرا نشده است. قیود و شواهد موجود در پایگاه نصب‌شده حفظ می‌شوند.

## رزرو شمارهٔ سند — ۲۰۲۶/۱۱/۲۳

`NumberingAssignment` در `numbering_assignments` شمارهٔ ثابت را به شرکت، نوع موجودیت و شناسه پیش‌نویس پیوند می‌دهد. قید یکتایی هم برای رکورد و هم شماره در شرکت/نوع و حفاظت افزایشی برقرار است. schema جاری ۱۱۹ جدول مدل دارد؛ تعریف کامل در entity-inventory و DDL تولیدشده است.

## نوع کارت تجاری — ۲۰۲۶/۱۱/۲۳

`CommercialCounterparty.type` رشتهٔ غیرتهی با محدودیت پایگاه داده به `supplier/customer/employee/other` است. ارتقای افزایشی در `db.initialize` ستون را به جدول موجود اضافه می‌کند و رکوردهای پیشین را بدون تغییر سایر داده‌ها `other` قرار می‌دهد؛ این مقدار پیش‌فرض مهندسی است و از روی نام طبقه‌بندی نمی‌شود.

## حساب تفصیلی ردیف سند — ۲۰۲۶/۱۱/۲۶

`accounting_drafts.lines` شناسهٔ اختیاری `detail_account_id` را جدا از حساب اصلی و هویت تجاری نگه می‌دارد. `native_journals.snapshot` شناسه، کد، نام و نسخهٔ تفصیلی زمان بازبینی را نگه می‌دارد. گردش دفتر در `native_journal_lines` بر اساس همان حساب اصلی ثبت می‌شود.

## سطح حساب — ۲۰۲۶/۱۱/۲۵ (اصلاح ساختار چهارسطحی)

`accounting_account_hierarchy` فرادادهٔ صریح حساب گروه/کل/معین/تفصیلی (`group` / `general` / `subsidiary` / `detail`) را با کلید حساب و ارجاع‌های مرکب شرکت/حساب نگه می‌دارد. حساب‌های بدون این فراداده «تعیین‌نشده» باقی می‌مانند. گروه بالادست ندارد (کد ۲ رقمی)؛ کل (۴ رقمی) به گروه، معین (۶ رقمی) به کل و تفصیلی (حداقل ۸ رقمی) به معین همان شرکت متصل می‌شود. تغییر سطح ناسازگار با زیرمجموعه رد می‌شود. کد در `accounting_accounts` در هر شرکت یکتا است و کد ثبت‌شده از ویرایش بازنویسی نمی‌شود. در ارتقای افزایشی از ساختار سه‌سطحی پیشین، ریشهٔ بدون بالادست به `group` و زیرمجموعه‌ها یک سطح جابه‌جا می‌شوند؛ داده‌ها و اسناد قبلی حذف نمی‌شوند.
