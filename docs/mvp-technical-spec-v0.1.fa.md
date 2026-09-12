# مشخصات فنی MVP دیدبان مالی — نسخه ۰٫۱

**وضعیت:** پیشنهادی برای بازبینی  
**تاریخ:** ۱۴۰۵/۰۶/۲۱  
**نام فنی:** `didban-mali`  
**اصل راهنما:** صحت بر هوش مصنوعی، قابلیت ردیابی بر جادو، و شواهد بر ادعا مقدم است.

## خلاصه تصمیم‌های معماری

دیدبان مالی در MVP یک **Modular Monolith** با Next.js و FastAPI است. PostgreSQL مرجع داده ساخت‌یافته، MinIO/S3 محل فایل اصلی، Redis صف و Celery مجری کارهای طولانی است. Polars برای پردازش جدولی و DuckDB فقط برای تحلیل درون‌پردازه‌ای فایل‌های بزرگ استفاده می‌شود. محاسبات و تطبیق‌های قطعی در کد انجام می‌شوند؛ AI فقط در آخرین فاز برای تطبیق معنایی و نگارش توضیح از روی داده تأییدشده وارد می‌شود.

تصمیم‌های نیازمند تأیید پیش از فاز ۱ در انتهای سند آمده‌اند.

---

## ۱. دامنه نهایی MVP

### درون دامنه

- ایجاد و انتخاب شرکت برای یک مشاور مالی
- عضویت چندکاربره محدود با نقش‌های مالک، مدیر مالی، مشاور/حسابدار و مشاهده‌گر
- دریافت فایل XLSX/CSV حسابداری و بانک؛ فایل فروش اختیاری
- انتخاب شیت، تشخیص سرستون، پیشنهاد نگاشت و تأیید دستی کاربر
- اعتبارسنجی، ثبت خطاها و هشدارها، حفظ فایل و ردیف اصلی
- نرمال‌سازی به مدل مالی کانونیکال بدون تغییر خاموش داده
- نگاشت سرفصل‌های حسابداری به طبقه‌بندی ساده مالی
- محاسبه درآمد، سود ناخالص، هزینه عملیاتی، سود خالص، نقد، دریافتنی و پرداختنی در حد داده موجود
- تطبیق بانک و حسابداری در سه سطح: قطعی، قاعده‌ای/فازی، و در فاز آخر AI-assisted
- فقط ۸ یافته: تراکنش احتمالاً مفقود، تکراری، مغایرت مبلغ، مغایرت تاریخ، افت درآمد، افت سود، رشد هزینه و رشد حساب‌های دریافتنی
- امتیاز اولویت نسخه‌دار و قابل توضیح
- مشاهده شواهد و ردیف‌های منبع
- تأیید، رد، پیگیری و یادداشت مشاور با سابقه ممیزی
- داشبورد مالی فارسی و گزارش پایه قابل چاپ/PDF
- نمایش پوشش تحلیل و دلیل تحلیل‌نشدن هر بخش

### خارج از دامنه

ثبت سند حسابداری، اصلاح فایل منبع، اتصال مستقیم بانکی/حسابداری، ارسال اظهارنامه مالیاتی، گردش خزانه، بودجه، حقوق، انبار، ERP/MRP، چت عمومی، عامل خودمختار و اپ موبایل.

### معیار مرزی

هر قابلیت فقط زمانی وارد MVP است که مستقیماً مسیر «فایل واقعی ← یافته قابل اعتماد ← شواهد ← تصمیم مشاور» را کامل کند.

## ۲. کاربران و نقش‌ها

### مشاور مالی / حسابدار ارشد — کاربر اصلی

شرکت‌ها را مدیریت می‌کند، فایل‌ها را وارد و نگاشت می‌کند، خطاها را رفع می‌کند، یافته‌ها و شواهد را بررسی و نتیجه را ثبت می‌کند و گزارش می‌سازد.

### مدیر مالی / CFO

وضعیت مالی، یافته‌های اولویت‌دار، پوشش داده و گزارش را می‌بیند؛ در صورت داشتن مجوز نتیجه بررسی را ثبت می‌کند.

### مدیرعامل / مشاهده‌گر

خلاصه و گزارش‌های تأییدشده را به‌صورت فقط‌خواندنی می‌بیند.

### مالک فضای کاری

اعضا، نقش‌ها و شرکت‌ها را مدیریت می‌کند. دسترسی پلتفرمی به داده مالی ندارد مگر عضو همان فضای کاری/شرکت باشد.

## ۳. جریان‌های کاربر

### راه‌اندازی و تحلیل

ثبت‌نام ← ایجاد فضای کاری ← ایجاد شرکت ← تعیین واحد پول و سال مالی ← بارگذاری حسابداری ← نگاشت/اعتبارسنجی ← بارگذاری بانک ← نگاشت/اعتبارسنجی ← فروش اختیاری ← طبقه‌بندی حساب‌ها ← اجرای تحلیل ← داشبورد.

### رسیدگی به یافته

فهرست یافته‌ها ← فیلتر اولویت/نوع/وضعیت ← جزئیات ← علت و محاسبه ← شواهد ← رکورد و فایل اصلی ← تأیید/رد/پیگیری ← یادداشت ← ثبت رویداد ممیزی.

### گزارش

انتخاب دوره ← کنترل پوشش و یافته‌ها ← افزودن یادداشت مشاور ← پیش‌نمایش ← تولید نسخه ثابت گزارش ← دانلود PDF.

### بازیابی واردسازی ناقص

مشاهده اجرای ناموفق/محدود ← دانلود خطاهای ردیفی ← اصلاح نگاشت یا فایل ← ایجاد نسخه واردسازی تازه؛ اجرای قبلی حذف یا بازنویسی نمی‌شود.

## ۴. مدل دامنه

- **Workspace:** مرز مالکیت و عضویت مشاور.
- **Company:** مستأجر داده مالی و مرز اصلی ایزوله‌سازی.
- **Membership / CompanyAccess:** نقش و دامنه دسترسی کاربر.
- **DataSource:** نوع منبع مانند accounting، bank یا sales.
- **ImportBatch:** یک تلاش ورود فایل و وضعیت چرخه آن.
- **SourceFile:** مشخصات، هش و محل فایل تغییرناپذیر.
- **MappingProfile / MappingVersion:** نگاشت قابل استفاده مجدد و نسخه تأییدشده برای هر واردسازی.
- **SourceRow:** ردیف اصلی با شماره ردیف و JSON خام.
- **ValidationIssue:** خطا/هشدار فایل یا ردیف.
- **Account / AccountClassification:** حساب منبع و طبقه مالی مورد تأیید انسان.
- **JournalEntry / JournalLine:** سند و آرتیکل حسابداری کانونیکال.
- **BankAccount / BankTransaction:** حساب و تراکنش بانکی کانونیکال.
- **SalesInvoice / SalesInvoiceLine / Counterparty:** داده اختیاری فروش و طرف حساب.
- **AnalysisRun:** اجرای ثابت و قابل تکرار تحلیل روی نسخه مشخص داده و قواعد.
- **MetricObservation:** مقدار محاسبه‌شده یک شاخص در یک دوره.
- **ReconciliationRun / ReconciliationMatch:** اجرای تطبیق و رابطه کاندید/قطعی.
- **Finding:** ادعای ساخت‌یافته و محدودشده با وضعیت عدم‌قطعیت.
- **EvidenceItem:** پیوند یافته به محاسبه، رکورد کانونیکال و منبع اصلی.
- **ReviewDecision / FindingNote:** تصمیم و توضیح انسانی append-only.
- **ReportSnapshot:** تصویر ثابت داده و متن گزارش در زمان تولید.
- **AuditEvent:** چه کسی، چه کاری، چه زمانی، روی چه چیزی و با چه تغییراتی.

## ۵. روابط موجودیت‌ها

```text
Workspace 1─* Membership *─1 User
Workspace 1─* Company 1─* CompanyAccess
Company 1─* ImportBatch 1─1 SourceFile
ImportBatch 1─1 MappingVersion
ImportBatch 1─* SourceRow 1─* ValidationIssue
SourceRow 1─0..* JournalEntry/JournalLine/BankTransaction/SalesInvoice
Company 1─* Account 1─* JournalLine
Company 1─* BankAccount 1─* BankTransaction
Company 1─* Counterparty 1─* SalesInvoice
Company 1─* AnalysisRun 1─* MetricObservation
AnalysisRun 1─0..* ReconciliationRun 1─* ReconciliationMatch
AnalysisRun 1─* Finding 1─* EvidenceItem
Finding 1─* ReviewDecision
Finding 1─* FindingNote
Company 1─* ReportSnapshot
Company 1─* AuditEvent
```

تمام موجودیت‌های مالی `company_id` دارند؛ شناسه شرکت از URL پذیرفته می‌شود اما مجوز آن مستقل از ورودی کاربر از عضویت سرور استخراج و کنترل می‌شود.

## ۶. طرح PostgreSQL

همه کلیدها UUIDv7، زمان‌ها `timestamptz`، مبالغ `numeric(20,0)` بر حسب **ریال** و نسبت‌ها `numeric(12,6)` هستند. تاریخ مالی `date` میلادی ذخیره و در UI شمسی نمایش داده می‌شود. متن اصلی فارسی دست‌نخورده و یک نسخه نرمال‌شده جداگانه ذخیره می‌شود.

### هویت و tenancy

| جدول | فیلدهای اصلی و قیود |
|---|---|
| `users` | `id`, `email` unique, `password_hash`, `is_active`, timestamps |
| `workspaces` | `id`, `name`, `owner_user_id` |
| `memberships` | `workspace_id`, `user_id`, `role`; unique pair |
| `companies` | `id`, `workspace_id`, `legal_name`, `national_id`, `currency='IRR'`, `fiscal_year_start_month`, `timezone` |
| `company_access` | `company_id`, `user_id`, `role`; unique pair |

### ورود و lineage

| جدول | فیلدهای اصلی و قیود |
|---|---|
| `data_sources` | `id`, `company_id`, `kind`, `label`, `bank_account_id?` |
| `source_files` | `id`, `company_id`, `object_key`, `original_name`, `sha256`, `size_bytes`, `mime_type`, `uploaded_by` |
| `import_batches` | `id`, `company_id`, `source_id`, `file_id`, `status`, `sheet_name`, `header_row`, `row_count`, `accepted_count`, `rejected_count`, `coverage`, `failure_code`, timestamps |
| `mapping_profiles` | `id`, `company_id`, `source_kind`, `name` |
| `mapping_versions` | `id`, `profile_id?`, `import_batch_id`, `version`, `mapping_json`, `transforms_json`, `confirmed_by`, `confirmed_at` |
| `source_rows` | `id`, `company_id`, `import_batch_id`, `sheet`, `row_number`, `raw_json`, `raw_hash`; unique `(import_batch_id,sheet,row_number)` |
| `validation_issues` | `id`, `company_id`, `import_batch_id`, `source_row_id?`, `field?`, `severity`, `code`, `message`, `raw_value` |

### مدل کانونیکال

| جدول | فیلدهای اصلی و قیود |
|---|---|
| `accounts` | `id`, `company_id`, `source_code`, `name`, `normalized_name`; unique `(company_id,source_code)` |
| `account_classifications` | `account_id`, `class`, `effective_from`, `confirmed_by`, `rule_version` |
| `journal_entries` | `id`, `company_id`, `source_row_id`, `source_entry_id?`, `entry_date`, `reference?`, `description`, `description_normalized`, `fiscal_period` |
| `journal_lines` | `id`, `company_id`, `entry_id`, `account_id`, `debit_irr`, `credit_irr`, `counterparty_id?`, `invoice_ref?`; check nonnegative and not both positive |
| `bank_accounts` | `id`, `company_id`, `bank_name`, `iban_masked?`, `account_last4?`, `label` |
| `bank_transactions` | `id`, `company_id`, `bank_account_id`, `source_row_id`, `source_transaction_id?`, `booking_date`, `value_date?`, `amount_irr` signed, `description`, `description_normalized`, `reference?`, `running_balance_irr?` |
| `counterparties` | `id`, `company_id`, `name`, `normalized_name`, `national_id?`, `kind` |
| `sales_invoices` | `id`, `company_id`, `source_row_id`, `invoice_no`, `counterparty_id?`, `issue_date`, `due_date?`, `gross_amount_irr`, `tax_amount_irr?`, `paid_amount_irr?`, `status?` |

### تحلیل، یافته و ممیزی

| جدول | فیلدهای اصلی و قیود |
|---|---|
| `analysis_runs` | `id`, `company_id`, `period_start/end`, `status`, `input_manifest_json`, `rule_set_version`, `coverage_json`, timestamps |
| `metric_observations` | `id`, `company_id`, `analysis_run_id`, `metric_code`, `period_start/end`, `value_irr/value_ratio`, `calculation_json` |
| `reconciliation_runs` | `id`, `company_id`, `analysis_run_id`, `config_version`, counts |
| `reconciliation_matches` | `id`, `company_id`, `run_id`, `bank_transaction_id`, `journal_entry_id?`, `match_level`, `status`, `score`, `features_json`, `rule_code`; partial unique indexes prevent two accepted matches for one record |
| `findings` | fields specified in section ۱۵; unique `(analysis_run_id,fingerprint)` for idempotency |
| `evidence_items` | fields specified in section ۱۷ |
| `review_decisions` | `id`, `company_id`, `finding_id`, `decision`, `note?`, `actor_id`, `created_at`; append-only |
| `finding_notes` | `id`, `company_id`, `finding_id`, `body`, `actor_id`, `created_at`, `supersedes_id?` |
| `report_snapshots` | `id`, `company_id`, `analysis_run_id`, `period`, `payload_json`, `object_key?`, `created_by`, `created_at` |
| `audit_events` | fields specified in section ۲۹; append-only |

### قواعد پایگاه داده

- FK مرکب یا trigger کنترل می‌کند که روابط دو جدول `company_id` یکسان دارند.
- index روی همه `company_id`ها و indexهای دوره/وضعیت مورد استفاده فیلترها.
- `source_files`, `source_rows`, `mapping_versions`, `review_decisions`, `report_snapshots`, `audit_events` پس از ثبت immutable هستند.
- حذف شرکت در MVP نرم و نیازمند جریان نگهداشت داده است؛ cascade فیزیکی از API عمومی وجود ندارد.

## ۷. قرارداد داده حسابداری

حداقل یکی از دو قالب پشتیبانی می‌شود:

1. **قالب سطر سند:** `entry_date`, `description` و `debit`/`credit`؛ بهتر است `entry_id`, `line_id`, `account_code`, `account_name`, `reference`, `counterparty`, `invoice_ref` نیز موجود باشد.
2. **قالب تراکنش خالص:** `date`, `description`, `amount` با `direction` یا علامت مشخص؛ پوشش تحلیل حساب‌ها محدود اعلام می‌شود.

قواعد:

- تاریخ ورودی می‌تواند شمسی یا میلادی باشد؛ parser و تقویم انتخاب‌شده ثبت می‌شود.
- واحد پول/مقیاس «ریال یا تومان» باید در مرحله نگاشت صریحاً تأیید شود؛ مقدار کانونیکال ریال است.
- بدهکار و بستانکار منفی مجاز نیستند؛ یک سطر نمی‌تواند هر دو را مثبت داشته باشد مگر کاربر قالب ویژه‌ای را صریحاً انتخاب کند.
- تراز سند در سطح `entry_id` کنترل می‌شود. فقدان شناسه سند باعث محدودشدن این کنترل می‌شود، نه شکست کل واردسازی.
- شناسه خارجی به‌عنوان متن نگهداری می‌شود تا صفرهای ابتدایی حذف نشوند.

## ۸. قرارداد داده بانک

الزامی: `booking_date`, `description` و یکی از `amount_signed` یا زوج `deposit_amount`/`withdrawal_amount`.

اختیاری: `transaction_id`, `reference`, `value_date`, `running_balance`, `counterparty_name`, `iban`, `branch`.

قواعد:

- قرارداد علامت کانونیکال: واریز مثبت، برداشت منفی.
- حساب بانکی و واحد ریال/تومان پیش از commit تأیید می‌شود.
- شماره شبا فقط در صورت وجود رمزگذاری و در UI mask می‌شود.
- کنترل مانده، در صورت وجود مانده جاری، اختلاف `previous_balance + amount = current_balance` را با لحاظ ترتیب منبع می‌سنجد؛ خطا فقط کیفیت داده است و یافته جدیدی خارج از ۸ مورد تولید نمی‌کند.

## ۹. قرارداد داده فروش

الزامی: `invoice_no`, `issue_date`, `customer_name`, `gross_amount`.

اختیاری: `due_date`, `tax_amount`, `net_amount`, `paid_amount`, `payment_date`, `customer_national_id`, `status`, اقلام فاکتور.

قواعد:

- unique منطقی `(company_id, invoice_no, issue_date)` با ثبت تعارض به‌جای حذف خاموش.
- اگر تاریخ سررسید یا پرداخت موجود نباشد، aging/وصول محدود و در پوشش اعلام می‌شود.
- MVP داده فروش را مرجع کمکی می‌داند؛ ارقام صورت سود و زیان پیش‌فرض از حساب‌های طبقه‌بندی‌شده حسابداری می‌آیند. تعارض منبع فقط پوشش/هشدار است تا زمانی که finding مستقل تصویب شود.

## ۱۰. خط لوله واردسازی

1. **Upload:** streaming، محدودیت حجم قابل تنظیم (پیش‌فرض پیشنهادی ۵۰MB)، allowlist پسوند و MIME، محاسبه SHA-256 و ذخیره در quarantine.
2. **Inspect:** اسکن بدافزار، فهرست شیت‌ها، نمونه‌برداری بدون اجرای macro/formula، تشخیص encoding و delimiter.
3. **Map:** پیشنهاد نگاشت با aliasهای فارسی/انگلیسی؛ تأیید انسان الزامی.
4. **Validate preview:** قواعد فایل، ستون و نمونه ردیف؛ نمایش خطا و اثر آن بر پوشش.
5. **Commit mapping:** نسخه نگاشت immutable.
6. **Parse:** خواندن chunked با Polars؛ XLSX فقط values و بدون اجرای فرمول.
7. **Persist raw:** ذخیره هر ردیف و lineage.
8. **Validate full:** ثبت مسئله‌های بلوک‌کننده و غیربلوک‌کننده.
9. **Normalize:** ایجاد رکوردهای کانونیکال در transactionهای chunked و idempotent.
10. **Finalize:** وضعیت `completed`, `completed_limited` یا `failed` و انتشار پوشش.

ماشین وضعیت: `uploaded → inspecting → awaiting_mapping → validating → queued → processing → completed|completed_limited|failed|cancelled`.

فایل تکراری هشدار می‌گیرد؛ dedup خودکار نمی‌شود. retry با همان batch id و کلید idempotency رکورد مضاعف نمی‌سازد.

## ۱۱. سامانه نگاشت

- فرهنگ alias نسخه‌دار برای عناوینی مانند تاریخ/تاریخ سند، شرح، بدهکار، بستانکار، واریز، برداشت و مبلغ.
- پیشنهاد بر اساس نام ستون، نوع مقادیر و چند ردیف نمونه؛ هیچ پیشنهاد بدون تأیید اعمال نمی‌شود.
- تبدیل‌های مجاز و صریح: trim، تبدیل ارقام فارسی/عربی به لاتین داخلی، حذف جداکننده هزارگان، پارس تاریخ، تعیین علامت و تبدیل تومان به ریال.
- مقدار خام همواره در `source_rows.raw_json` باقی می‌ماند.
- preview شامل مقدار خام، مقدار تبدیل‌شده و خطا است.
- پروفایل نگاشت برای همان شرکت و fingerprint ستون‌ها قابل استفاده مجدد است، ولی کاربر در هر import آن را تأیید می‌کند.

## ۱۲. سامانه اعتبارسنجی

سه سطح دارد:

- **Blocking/File:** فایل خراب، نوع غیرمجاز، نبود همه ستون‌های حیاتی، واحد پول تأییدنشده؛ import شکست می‌خورد.
- **Row Error:** تاریخ/مبلغ غیرقابل‌خواندن یا رابطه حیاتی نامعتبر؛ ردیف رد و import ممکن است `completed_limited` شود.
- **Warning/Coverage:** شناسه اختیاری، تاریخ سررسید یا مرجع موجود نیست؛ داده پذیرفته ولی تحلیل متناظر محدود می‌شود.

هر issue دارای `code`, `severity`, مکان، مقدار خام، پیام فارسی و راه اصلاح است. درصد پوشش یک عدد مبهم تنها نیست:

```json
{
  "overall": 78,
  "reconciliation": {"available": true, "score": 84, "reasons": []},
  "profit_analysis": {"available": true, "score": 72, "reasons": ["۱۲٪ حساب‌ها طبقه‌بندی نشده‌اند"]},
  "receivables": {"available": false, "score": 0, "reasons": ["تاریخ سررسید و مانده دریافتنی موجود نیست"]}
}
```

امتیاز کلی میانگین وزنی قابلیت‌های درخواست‌شده است و همراه اجزا نمایش داده می‌شود. «موفق با پوشش محدود» هرگز با «ناموفق» یکی نمایش داده نمی‌شود.

## ۱۳. مدل نرمال‌سازی

- Unicode به NFC، یکسان‌سازی `ي/ی` و `ك/ک` فقط در ستون `*_normalized`؛ متن اصلی حفظ می‌شود.
- ارقام برای محاسبه داخلی لاتین و برای نمایش فارسی قابل قالب‌بندی‌اند.
- تاریخ به Gregorian `date` و metadata شامل تقویم ورودی و متن خام.
- مبلغ به ریال integer decimal؛ نرخ تبدیل مقیاس و تصمیم کاربر در lineage.
- شرح نرمال‌شده شامل lowercase انگلیسی، فاصله یکنواخت و حذف علائم کم‌اهمیت است؛ اعداد و شناسه‌ها حذف نمی‌شوند.
- داده حسابداری در سطح سند و آرتیکل نگهداری می‌شود، نه یک جدول تخت مبهم.
- همه رکوردهای کانونیکال `source_row_id` دارند؛ داده مشتق‌شده `analysis_run_id` و نسخه قاعده دارد.

## ۱۴. الگوریتم تطبیق

### پیش‌نیاز

برای هر تراکنش bank و کاندید حسابداری، ویژگی‌های مبلغ signed، تاریخ، reference، invoice reference، tokenهای شرح و طرف حساب ساخته می‌شوند. بازه تاریخ و آستانه‌ها در `reconciliation_config` نسخه‌دار هستند.

### ترتیب و precedence

1. **تشخیص تکرار در هر منبع:** fingerprint قوی از شناسه خارجی، یا fingerprint ضعیف از تاریخ+مبلغ+شرح+مرجع. شناسه قوی یکسان، duplicate با اطمینان بالا است؛ fingerprint ضعیف فقط «تکراری احتمالی» و نیازمند بررسی است. reversal و چند پرداخت واقعی نباید خودکار duplicate شوند.
2. **Exact match:** مبلغ، تاریخ و حداقل یک شناسه قوی یکسان؛ یا مبلغ/تاریخ/شرح نرمال‌شده کاملاً یکسان با کاندید یکتا. وضعیت `auto_matched` و شواهد قاعده‌ای.
3. **Rule/fuzzy candidate:** کاندیدسازی محدود با مبلغ برابر و فاصله تاریخ قابل تنظیم (پیشنهاد اولیه ±۳ روز کاری) یا reference مشترک. score از amount، date proximity، reference و similarity شرح تشکیل می‌شود.
4. **Amount mismatch:** reference/شناسه قوی یا ترکیب تاریخ و شرح رابطه را قوی می‌کند ولی مبلغ متفاوت است. اختلاف و درصد آن ثبت می‌شود؛ هیچ منبعی «صحیح» اعلام نمی‌شود.
5. **Date mismatch:** مبلغ و شناسه/شرح قوی یکسان ولی تاریخ خارج از بازه exact و داخل بازه بررسی (پیشنهاد اولیه تا ۱۰ روز تقویمی).
6. **AI-assisted:** فقط برای کاندیدهای حل‌نشده، خروجی JSON ساخت‌یافته شامل candidate، confidence، reason و نقل شناسه‌های موجود. همیشه `potential_match` و نیازمند انسان.
7. **Potential missing:** رکورد بدون match پذیرفته‌شده پس از پایان همه مراحل؛ عنوان جهت‌دار و محتاطانه مانند «تراکنش بانکی احتمالاً فاقد ثبت متناظر حسابداری».

### حل تعارض

- یک تطبیق پذیرفته‌شده به‌طور پیش‌فرض one-to-one است.
- split/merge خودکار در MVP انجام نمی‌شود؛ کاندیدهای چندبه‌یک به‌عنوان مبهم برای پیگیری می‌مانند.
- اگر دو کاندید امتیاز نزدیک داشته باشند، auto-match ممنوع است.
- اجرای مجدد روی snapshot یکسان و config یکسان باید نتیجه یکسان و idempotent بدهد.
- exact/rule نتایج قطعی محاسباتی‌اند؛ برچسب «تأیید حسابداری» فقط تصمیم انسان است.

## ۱۵. مدل یافته

`findings`:

- `id`, `company_id`, `analysis_run_id`, `fingerprint`
- `finding_code`: یکی از ۸ کد مجاز
- `kind`: `risk | anomaly | discrepancy | insight`
- `category`: `reconciliation | financial_analysis`
- `title_fa`, `summary_fa`
- `assertion_status`: `deterministic | hypothesis | ai_assisted`
- `severity`: شدت اثر ذاتی
- `priority_band`, `priority_score`, `priority_explanation_json`, `priority_model_version`
- `confidence_score`, `confidence_basis`
- `affected_amount_irr?`, `affected_ratio?`
- `period_start`, `period_end`
- `reason_code`, `reason_parameters_json`
- `calculation_json`, `rule_version`
- `workflow_status`: `needs_review | confirmed | dismissed | follow_up | resolved`
- timestamps؛ وضعیت جاری از آخرین ReviewDecision مشتق/کش می‌شود.

زبان UI بر پایه certainty است: «احتمالاً»، «مغایرت مشاهده شد»، «نیازمند بررسی»؛ واژه‌هایی مانند تقلب یا قطعیت منبع مجاز نیستند.

## ۱۶. مدل اولویت

نسخه آغازین score صدنمره‌ای:

`priority = 0.40×impact + 0.25×materiality + 0.20×confidence + 0.15×urgency`

- **Impact:** اثر بر نقد، سود یا عملیات؛ از نوع finding و اندازه اثر.
- **Materiality:** نسبت مبلغ به درآمد دوره و نیز آستانه اهمیت تعیین‌شده شرکت. مبلغ مطلق به‌تنهایی کافی نیست.
- **Confidence:** کیفیت و قوت شواهد، نه اهمیت.
- **Urgency:** نزدیکی به دوره جاری/بستن حساب‌ها و عمر مسئله.

باندهای پیشنهادی برای پایلوت: Critical ≥ ۸۰، High ≥ ۶۰، Medium ≥ ۳۵، Low کمتر از ۳۵. این‌ها **فرض اولیه قابل تنظیم** هستند و پیش از پایلوت با مدیر مالی تأیید و سپس با داده واقعی کالیبره می‌شوند. config و نسخه‌اش با هر finding ذخیره می‌شود.

`priority_explanation_json` سهم هر عامل و جمله فارسی را نگه می‌دارد، مثلاً: «مبلغ معادل ۱۸٪ درآمد ماه»، «تطبیق مبتنی بر شناسه قوی»، «اثر بر نقد دوره جاری». Critical با confidence پایین مجاز نیست مگر قانون روشن urgency آن را ایجاد کند؛ در آن صورت uncertainty برجسته می‌شود.

## ۱۷. مدل شواهد

`evidence_items` شامل:

- `id`, `company_id`, `finding_id`, `ordinal`
- `evidence_type`: `source_record | comparison | calculation | rule | coverage`
- `claim_code`: ادعایی که این مدرک پشتیبانی می‌کند
- `source_entity_type`, `source_entity_id?`, `source_row_id?`, `source_file_id?`
- `field_snapshot_json`: فقط فیلدهای مرتبط با حفظ مقدار خام و نرمال
- `calculation_json`: ورودی، عملگر، خروجی و واحد
- `rule_code`, `rule_version`
- `created_at`

زنجیره UI: یافته ← دلیل ← فرمول/قاعده ← مقایسه ← رکورد کانونیکال ← ردیف و فایل اصلی. Evidence در snapshot تحلیل immutable است و با تغییر تصمیم مشاور بازنویسی نمی‌شود.

## ۱۸. گردش بررسی انسانی

- یافته‌های فازی و AI-assisted با `needs_review` آغاز می‌شوند.
- اقدامات: `confirmed`, `dismissed`, `follow_up`; برای پایان پیگیری `resolved`.
- هر اقدام ReviewDecision جدید می‌سازد؛ رکورد قبلی و actor/time باقی می‌ماند.
- note در confirm/dismiss اختیاری است، اما برای AI-assisted و amount mismatch توصیه/در تنظیم سازمان قابل الزام است.
- فقط Advisor/Finance Manager می‌توانند تصمیم ثبت کنند؛ Viewer فقط می‌خواند.
- گزارش، وضعیت و آخرین تصمیم را نشان می‌دهد و یافته dismissed به‌صورت پیش‌فرض از «Top findings» خارج ولی در ضمیمه قابل مشاهده است.

## ۱۹. مرزهای AI

### مجاز

- رتبه‌بندی معنایی کاندیدهای از پیش محدودشده توسط موتور قطعی
- توضیح فارسی نتیجه، فقط از payload ساخت‌یافته و با ارجاع به evidence ID
- تحلیل علت احتمالی با زبان احتمالی
- نگارش گزارش از metrics/findings تأییدشده

### ممنوع

- محاسبه رقم، ساخت تراکنش، انتخاب حقیقت بین بانک و حسابداری، تغییر رکورد مالی، تأیید finding، تولید حکم مالیاتی یا پاسخ بدون ابزار/داده ساخت‌یافته.

### کنترل فنی

- ورودی حداقلی و tenant-scoped؛ داده حساس غیرضروری حذف می‌شود.
- خروجی JSON Schema-validated؛ عدد خروجی باید دقیقاً با عدد allowlisted ورودی تطبیق کند.
- prompt/model/version، evidence IDs، latency و outcome ثبت می‌شوند؛ متن chain-of-thought ذخیره نمی‌شود.
- timeout/failure AI تحلیل قطعی را متوقف نمی‌کند.
- feature flag سراسری و شرکتی؛ AI در فاز ۱۳ فعال می‌شود.

## ۲۰. قرارداد API

REST تحت `/api/v1`، JSON، تاریخ ISO-8601، مبلغ به شکل string ریالی برای جلوگیری از خطای JavaScript. همه عملیات mutation دارای `Idempotency-Key` و خطاها Problem Details هستند.

### هویت و شرکت

- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`
- `GET/POST /companies`, `GET/PATCH /companies/{id}`
- `GET/POST /companies/{id}/members`, `PATCH/DELETE /companies/{id}/members/{user_id}`

### ورود داده

- `POST /companies/{id}/imports/uploads` → signed/stream upload session
- `POST /companies/{id}/imports` → batch
- `GET /companies/{id}/imports/{batch_id}`
- `GET /companies/{id}/imports/{batch_id}/preview`
- `PUT /companies/{id}/imports/{batch_id}/mapping`
- `POST /companies/{id}/imports/{batch_id}/validate`
- `POST /companies/{id}/imports/{batch_id}/commit`
- `GET /companies/{id}/imports/{batch_id}/issues` (pagination/export)

### طبقه‌بندی و تحلیل

- `GET /companies/{id}/accounts/unclassified`
- `PUT /companies/{id}/accounts/{account_id}/classification`
- `POST /companies/{id}/analysis-runs`
- `GET /companies/{id}/analysis-runs/{run_id}`
- `GET /companies/{id}/analysis-runs/{run_id}/coverage`
- `GET /companies/{id}/metrics?period=...`

### یافته، شواهد و بررسی

- `GET /companies/{id}/findings?...filters&cursor=...`
- `GET /companies/{id}/findings/{finding_id}`
- `GET /companies/{id}/findings/{finding_id}/evidence`
- `POST /companies/{id}/findings/{finding_id}/decisions`
- `POST /companies/{id}/findings/{finding_id}/notes`

### داشبورد و گزارش

- `GET /companies/{id}/dashboard?period=...&analysis_run_id=...`
- `POST /companies/{id}/reports`
- `GET /companies/{id}/reports/{report_id}`
- `GET /companies/{id}/reports/{report_id}/download`

Job endpoints وضعیت، درصد، مرحله، failure code و retryability را برمی‌گردانند. لیست‌ها cursor-pagination دارند. OpenAPI قرارداد تولید client TypeScript است.

## ۲۱. مسیرهای Frontend

```text
/login
/onboarding
/companies
/companies/[companyId]/overview
/companies/[companyId]/imports
/companies/[companyId]/imports/new
/companies/[companyId]/imports/[importId]/mapping
/companies/[companyId]/imports/[importId]/validation
/companies/[companyId]/analysis/[runId]
/companies/[companyId]/findings
/companies/[companyId]/findings/[findingId]
/companies/[companyId]/reports
/companies/[companyId]/reports/[reportId]
/companies/[companyId]/settings/profile
/companies/[companyId]/settings/members
/companies/[companyId]/settings/classification
```

RTL پیش‌فرض، locale فارسی، نمایش شمسی، رقم فارسی در متن فارسی و ریال با امکان نمایش کمکی تومان. URL/شناسه‌ها لاتین باقی می‌مانند.

## ۲۲. معماری اجزای Frontend

- `AppShell`, `CompanySwitcher`, `PeriodSelector`
- `FinancialHealthSummary`, `MetricCard`, `MetricTrend`
- `CoverageBadge`, `CoverageBreakdown`, `UnavailableAnalysisNotice`
- `FindingList`, `FindingFilters`, `FindingCard`, `PriorityReasons`
- `FindingNarrative`, `CalculationBreakdown`, `EvidenceTimeline`, `SourceRecordDrawer`
- `ReviewPanel`, `DecisionHistory`, `AdvisorNoteEditor`
- `FileDropzone`, `SheetSelector`, `ColumnMapper`, `TransformPreview`, `ValidationSummary`, `IssueTable`, `JobProgress`
- `ReportPreview`, `ReportStatusBadge`

ساختار feature-based است. Server Components برای shell/read-first، Client Components فقط برای تعامل؛ TanStack Query برای server state، React Hook Form+Zod برای فرم. ارقام خام مالی در state محاسبه نمی‌شوند؛ فقط نمایش داده API هستند.

## ۲۳. ساختار ماژول‌های Backend

```text
app/
  identity/       # auth, membership, RBAC
  companies/      # tenant context
  imports/        # files, mapping, validation, normalization orchestration
  accounting/     # journal/account domain
  banking/        # bank domain
  sales/          # optional sales domain
  financials/     # deterministic metrics
  reconciliation/# matching engine
  findings/       # catalog, generation, priority, evidence
  reviews/        # decisions and notes
  reports/        # snapshots and PDF payload
  ai/             # guarded provider adapter and schemas
  audit/          # immutable audit events
  shared/         # db, errors, money/date primitives
```

هر ماژول router، schemas، service، repository/model و tests دارد. ارتباط بین ماژول‌ها از service interface در همان process است؛ event broker توزیع‌شده وجود ندارد. Domain code از FastAPI و provider AI مستقل نگه داشته می‌شود.

## ۲۴. ساختار پوشه‌ها

```text
didban-mali/
  apps/
    web/                 # Next.js
    api/                 # FastAPI modular monolith
  packages/
    api-client/          # generated OpenAPI client
    ui/                  # shared product components/tokens
    config/              # eslint/typescript config
  infra/
    docker/
  data/
    demo/                # synthetic input files and scenario manifest
  docs/
    decisions/           # ADRs
    mvp-technical-spec-v0.1.fa.md
  docker-compose.yml
  .env.example
  Makefile
  README.md
```

یک monorepo و یک تاریخچه نسخه؛ ابزار پیچیده monorepo تا زمان نیاز اضافه نمی‌شود.

## ۲۵. معماری کارهای پس‌زمینه

Celery+Redis انتخاب MVP است چون import/analysis در اکوسیستم Python اجرا می‌شود و retry، progress و time limit نیاز دارد.

Queueها: `imports`, `analysis`, `reports`. taskها شناسه batch/run را می‌گیرند، نه payload مالی کامل. هر task idempotent، tenant-aware و دارای soft/hard timeout است. progress در DB مرجع است؛ Redis مرجع حقیقت نیست. retry فقط برای خطاهای گذرا با backoff محدود؛ خطای داده retry خودکار نمی‌شود. در MVP یک worker می‌تواند همه queueها را اجرا کند و بعداً جدا شود.

## ۲۶. معماری ذخیره‌سازی

- Local: MinIO؛ Production: S3-compatible با bucket خصوصی.
- object key شامل شناسه تصادفی شرکت/import است و نام فایل کاربر مسیر نمی‌سازد.
- upload با URL کوتاه‌عمر یا stream backend؛ download با کنترل مجوز و URL کوتاه‌عمر.
- فایل خام immutable، SHA-256 و metadata در DB.
- quarantine تا اسکن؛ فایل macro-enabled و archive در MVP رد می‌شود.
- رمزگذاری at rest توسط storage و TLS in transit. کلیدها در secret manager محیط production.
- retention اولیه پیشنهادی: فایل و lineage تا زمان نگهداری شرکت؛ سیاست حذف/قانونی قبل از production باید تصویب شود.

## ۲۷. احراز هویت و مجوز

- ایمیل/رمز با Argon2id، access token کوتاه‌عمر در cookie امن HttpOnly و refresh rotation؛ CSRF برای mutation.
- RBAC: `owner`, `finance_manager`, `advisor`, `viewer`.
- permission matrix در backend؛ UI فقط پنهان‌سازی کمکی است.
- rate limit برای login/upload/AI، قفل موقت و ثبت رخداد امنیتی.
- MFA خارج از MVP pilot ولی پیش‌نیاز production عمومی است.
- لاگ‌ها فاقد token، رمز، فایل خام و شرح کامل تراکنش‌اند.

## ۲۸. چندمستأجری

`company_id` مرز داده مالی است و از context احرازشده تزریق می‌شود. تمام repositoryها company-scoped هستند. PostgreSQL RLS به‌عنوان دفاع دوم از ابتدای schema فعال می‌شود؛ هر request در transaction مقدار `app.company_id` را set می‌کند. worker نیز context شرکت را از job معتبر می‌گیرد و set می‌کند.

تست اجباری isolation برای هر endpoint و task: کاربر شرکت A با شناسه معتبر رکورد شرکت B باید 404 بگیرد. cache key، object key، audit و export هم company-scoped هستند. نقش platform admin به‌طور پیش‌فرض به payload مالی دسترسی ندارد؛ پشتیبانی نیازمند جریان break-glass آینده است.

## ۲۹. ثبت ممیزی

`audit_events`: `id`, `company_id?`, `workspace_id`, `actor_type`, `actor_id?`, `action`, `entity_type`, `entity_id`, `request_id`, `ip_hash?`, `user_agent?`, `before_json?`, `after_json?`, `metadata_json`, `occurred_at`.

رویدادهای الزامی: login، تغییر عضو/نقش، upload/download، تأیید mapping، commit import، طبقه‌بندی حساب، آغاز/پایان تحلیل، تغییر config، مشاهده فایل حساس، تصمیم finding، یادداشت و تولید/دانلود گزارش. audit append-only و دسترسی آن محدود است. داده کامل مالی در audit کپی نمی‌شود؛ diff حداقلی و شناسه مرجع ذخیره می‌شود.

## ۳۰. محیط Docker

سرویس‌های توسعه:

- `web` Next.js
- `api` FastAPI/Uvicorn
- `worker` Celery
- `postgres` PostgreSQL
- `redis` Redis
- `minio` و job ساخت bucket
- `clamav` برای اسکن upload (می‌تواند در محیط توسعه profile اختیاری باشد، در staging اجباری)

migration به‌صورت job یک‌باره قبل از api اجرا می‌شود. healthcheck و volumeهای نام‌دار وجود دارند. `.env.example` فقط placeholder دارد. Sentry با DSN اختیاری و scrub داده حساس فعال می‌شود.

## ۳۱. راهبرد آزمون

- **Unit/Pytest:** parser تاریخ شمسی، money، validation، محاسبات، score و هر ۸ rule.
- **Property-based:** invariants مانند حفظ جمع مبالغ، عدم ساخت رکورد از ردیف ردشده و idempotency.
- **Integration:** PostgreSQL/RLS، MinIO، Celery eager/worker، import واقعی XLSX/CSV.
- **Golden datasets:** ورودی ثابت و expected metrics/matches/findings/evidence؛ هر تغییر rule diff قابل بازبینی می‌سازد.
- **Frontend/Vitest:** mapper، coverage، priority explanations و stateهای خطا/RTL.
- **Contract:** OpenAPI و client generated؛ schema AI.
- **Browser/Playwright:** مسیر کامل پذیرش با سه فایل نمونه و review/report.
- **Security:** tenant leakage، IDOR، upload spoofing، formula injection در export، auth/session.
- **Visual:** صفحه‌های فارسی در desktop/mobile و PDF برای clipping، جهت متن و اعداد.

برای engine مالی، expected values دستی و مستقل محاسبه و به‌عنوان fixture امضاشده نگهداری می‌شود؛ snapshot کور جای assertion مالی را نمی‌گیرد.

## ۳۲. طراحی داده seed

شرکت ساختگی: **شرکت راهکار گستر آریانا**، خدمات و توزیع B2B، سه حساب بانکی و دوره نمونه شش‌ماهه. طرف‌ها مانند «فناوری سپهر پارس»، «بازرگانی هیراد شرق»، «توسعه سازه البرز» و «داده‌پردازان نقش جهان»؛ شماره سند، فاکتور، شناسه پیگیری و شرح بانکی واقع‌نما ولی کاملاً مصنوعی‌اند.

فایل‌ها:

- `accounting_1405.xlsx`: اسناد دوبل، سرفصل‌ها، دریافتنی/پرداختنی و رکوردهای پاک
- `bank_mellat_1405.xlsx`, `bank_saman_1405.csv`: تطبیق‌های exact، fuzzy و رکورد بدون متناظر
- `sales_1405.xlsx`: فاکتور، سررسید و وصول
- variantهای خطادار برای تست نگاشت/validation
- `scenario-manifest.json`: شناسه سناریو، ردیف‌های درگیر، نتیجه و دلیل مورد انتظار

توزیع هدف: حداقل ۲۰ exact clean، ۵ fuzzy قابل بررسی، و دست‌کم ۲ نمونه معنادار از هر ۸ finding. روند ماه‌ها عمداً افت درآمد و سود، رشد هزینه و دریافتنی ایجاد می‌کند، ولی ماه‌ها و حساب‌های سالم کافی وجود دارند تا precision قابل سنجش باشد. هیچ نام/شماره/شبا متعلق به شخص یا شرکت واقعی نیست.

## ۳۳. معیارهای پذیرش MVP

1. کاربر مجاز شرکت می‌سازد و کاربر شرکت دیگر هیچ داده‌ای نمی‌بیند.
2. فایل‌های حسابداری و بانک و فروش اختیاری با نگاشت فارسی وارد می‌شوند و raw lineage حفظ است.
3. خطای blocking از import محدود تفکیک و coverage دلیل‌دار نمایش داده می‌شود.
4. واحد تومان/ریال و تقویم بدون تأیید حدس نهایی زده نمی‌شود.
5. metrics داده seed دقیقاً با expected دستی برابرند.
6. موتور، هر ۸ finding مصوب و هیچ نوع نهمی تولید نمی‌کند.
7. exact/fuzzy/AI برچسب متفاوت دارند و AI هیچ match را تأیید نمی‌کند.
8. هر finding مهم حداقل یک evidence معتبر تا ردیف و فایل منبع دارد.
9. priority دارای breakdown قابل فهم و نسخه config است.
10. Confirm/Dismiss/Follow Up/Note با actor و زمان audit می‌شود.
11. داشبورد به «وضعیت چیست؟» و «اول چه چیزی بررسی شود؟» پاسخ می‌دهد و یافته کم‌اولویت را پنهان نمی‌کند.
12. گزارش شامل وضعیت، یافته‌ها، overview، drivers، coverage، notes و review status است و ارقام فقط از snapshot ساخت‌یافته می‌آیند.
13. اجرای دوباره روی ورودی/config یکسان نتیجه مالی و fingerprint یکسان می‌دهد.
14. Playwright مسیر انتها‌به‌انتها را بدون خطای بحرانی اجرا می‌کند.
15. تست leakage، upload و audit عبور می‌کند؛ هیچ secret یا payload مالی در log دیده نمی‌شود.

هدف پایلوت برای کیفیت تطبیق روی golden dataset: precision حداقل ۹۵٪ برای auto exact؛ rule/fuzzy خودکار تأیید نمی‌شود و recall آن صرفاً اندازه‌گیری می‌شود. هدف‌های production پس از داده واقعی و review تعیین می‌شوند.

## ۳۴. فازهای پیاده‌سازی و دروازه‌ها

### فاز ۰ — مشخصات (همین سند)

خروجی: scope، مدل، قراردادها، acceptance و تصمیم‌های باز. **Gate:** تأیید کاربر.

### فاز ۱ — مخزن و محیط توسعه

monorepo، Docker Compose، Next.js/FastAPI، lint/test/migration/CI smoke. **Gate:** همه سرویس‌ها healthy و تست smoke سبز.

### فاز ۲ — هویت و شرکت

auth، RBAC، CompanySwitcher، RLS و تست leakage. **Gate:** isolation اثبات‌شده.

### فاز ۳ — upload و storage

فایل خصوصی، hash، scan، metadata و job state. **Gate:** upload امن و download مجاز.

### فاز ۴ — mapping و validation

preview فارسی، تبدیل‌ها، issue/coverage. **Gate:** سه قالب متفاوت بدون تغییر خاموش.

### فاز ۵ — مدل مالی کانونیکال

normalization، lineage و account classification. **Gate:** invariantها و golden import.

### فاز ۶ — محاسبات مالی

metrics و دوره‌ها. **Gate:** برابری با expected دستی.

### فاز ۷ — تطبیق

duplicate/exact/fuzzy، mismatch و unresolved. **Gate:** precision exact و evidence.

### فاز ۸ — موتور یافته

فقط ۸ catalog rule. **Gate:** همه سناریوها و عدم finding اضافه.

### فاز ۹ — اولویت و شواهد

score نسخه‌دار، breakdown و evidence chain. **Gate:** توضیح کامل همه یافته‌ها.

### فاز ۱۰ — داشبورد

health، metrics، findings و coverage. **Gate:** UX فارسی و stateهای محدودیت.

### فاز ۱۱ — بررسی مشاور

تصمیم، یادداشت و history. **Gate:** audit و permissions.

### فاز ۱۲ — گزارش پایه

snapshot و PDF فارسی A4. فونت IRANYekanX در صورت موجودبودن embed، حاشیه ۱۸–۲۲mm، RTL/shaping و بازبینی تصویری تمام صفحات. اگر فونت موجود نباشد، پیش از fallback از کاربر سؤال می‌شود. **Gate:** تطبیق ارقام و QA بصری.

### فاز ۱۳ — AI

semantic candidate و explanation محدود. **Gate:** schema validation، عدم اختراع عدد و graceful failure.

### فاز ۱۴ — E2E و آماده‌سازی دمو

seed کامل، Playwright، امنیت، recovery و acceptance. **Gate:** عبور ۱۵ معیار بخش ۳۳.

پس از هر Gate، گزارش خروجی و تصمیم فاز بعد ارائه می‌شود؛ تغییر دامنه بدون تأیید وارد نمی‌شود.

## ۳۵. قابلیت‌های صریحاً موکول‌شده

- اتصال مستقیم بانک/حسابداری/ERP و sync زمان‌واقعی
- ثبت یا اصلاح سند و هرگونه write-back
- مالیات، اظهارنامه و تضمین انطباق قانونی
- continuous close، خزانه، بودجه و FP&A
- AP/AR workflow کامل، collection و پرداخت
- حقوق، قرارداد، انبار، تولید، BOM/MRP
- ledger بومی و graph database
- split/merge reconciliation خودکار
- عامل خودمختار، RAG/vector DB و framework چندعاملی
- mobile app، multi-currency و consolidation چندشرکتی
- Kubernetes، Kafka، Elasticsearch، Airflow و microservices
- SSO/SAML، SCIM، MFA و break-glass پشتیبانی تا پیش از production عمومی
- report builder آزاد و query زبانی عمومی؛ پس از تثبیت مدل داده

---

## تصمیم‌های باز برای تأیید

این تصمیم‌ها معماری پایه را عوض نمی‌کنند، اما باید پیش از فاز مرتبط نهایی شوند:

1. **واحد مرجع:** پیشنهاد: ذخیره همه مبالغ به ریال و نمایش اختیاری تومان.
2. **تقویم:** پیشنهاد: ذخیره میلادی، نمایش و ورود شمسی/میلادی با تأیید mapping.
3. **احراز هویت MVP:** پیشنهاد: ایمیل/رمز داخلی؛ پیامک و SSO موکول شود.
4. **دامنه پایلوت:** پیشنهاد: یک workspace مشاوره، چند شرکت، فارسی و IRR-only.
5. **آستانه‌های تحلیل:** پیشنهاد: config اولیه نسخه‌دار، سپس کالیبراسیون با golden dataset و تأیید مدیر مالی؛ عددها به‌عنوان حقیقت کسب‌وکار hardcode نشوند.
6. **AI provider و محل پردازش داده:** تا فاز ۱۳ باز بماند؛ بدون تصمیم امنیت/اقامت داده، داده مالی به provider خارجی ارسال نشود.

## پیشنهاد تصویب نسخه ۰٫۱

تصویب این سند به معنی اجازه آغاز **فاز ۱: مخزن و محیط توسعه** با تصمیم‌های پیشنهادی ۱ تا ۵ است. تصمیم ۶ تا فاز ۱۳ معلق می‌ماند. هر اصلاح دامنه یا مدل، ابتدا در این سند/ADR ثبت و سپس پیاده‌سازی می‌شود.
