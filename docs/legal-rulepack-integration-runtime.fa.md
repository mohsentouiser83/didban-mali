# مسیر ورود شواهد و پیش‌نویس قواعد حقوق

این مسیر در ۲۰۲۶/۱۰/۲۹ پیاده شد. ابزار `tools/payroll_rulepack.py` دریافت منبع، اعتبارسنجی شواهد، آماده‌سازی بسته و ورود پیش‌نویس از API عادی را انجام می‌دهد. هیچ دستور فعال‌سازی قانونی، ثبت تأیید مستقل، دستکاری مجوز، تغییر بودجه یا نوشتن مستقیم پایگاه ندارد. هیچ دستور import روی نصب واقعی اجرا نشده است.

## مرز انواع تأیید

- منبع روی دامنهٔ رسمی، دریافت با TLS معتبر و hash یکسان: شواهد منشأ و تمامیت فایل است؛ محتوای آن یا تفسیر همهٔ استثناهای قانونی را تصدیق نمی‌کند. metadata دریافتِ واردشده نیز ادعای ثبت‌شده است، نه اثبات مستقل منشأ.
- نمونهٔ عددی منطبق با موتور: آزمون محاسبه است؛ تأیید حقوقی نیست. مدیر مالی می‌تواند بازبینی عددی عادی انجام دهد، اما مسیر موجود تأیید مستقل را دور نمی‌زند.
- امضای Ed25519 معتبر: فقط ثابت می‌کند کلید ازپیش‌مجاز، همان hash بسته و محدوده را امضا کرده است. هویت، صلاحیت و استقلال واقعی متخصص و واگذاری مجوز کلید باید خارج از ابزار احراز شود. ابزار کلید یا امضای قانونی تولید نمی‌کند. تنظیم policy توسط تهیه‌کنندهٔ بسته، خودبه‌خود تأیید مستقل ایجاد نمی‌کند.
- حتی بستهٔ دارای امضای معتبر فقط `attested_staging_only` می‌شود؛ تمام خروجی‌های ابزار `legal_verified=false` و `activated=false` دارند. دروازهٔ قانونی فعلی پایگاه و تأیید فیش‌ها تغییر نکرده است.

## دریافت منبع

```text
.venv/bin/python tools/payroll_rulepack.py fetch-source --url OFFICIAL_HTTPS_URL --target NEW_PRIVATE_DIRECTORY --media-type application/pdf
```

برای متن HTML رسمی از `text/html` استفاده می‌شود. حد هر فایل ۳۲ مگابایت و مجموع منابع بسته ۱۰۰ مگابایت است. دامنه‌ها allowlist دقیق دارند؛ HTTP، اطلاعات کاربری داخل URL، تغییر مسیر به دامنهٔ خارج، overwrite، symlink و مسیر خروج از پوشه پذیرفته نمی‌شود. TLS فعال است و proxy محیطی یا دنبال‌کردن خودکار redirect استفاده نمی‌شود. PDF باید نوع پاسخ صحیح، header و نشان پایان PDF داشته باشد. پاسخ HTTP200 حاوی challenge مرورگر، Cloudflare یا صفحهٔ انتقال جاوااسکریپتی، سند قانونی محسوب نمی‌شود.

خروجی پوشه شامل `document` و `retrieval.json` است. receipt دقیقاً این فیلدها را دارد: `format=didban-source-fetch-1`، `url`، `final_url`، `fetched_at` با timezone، `sha256`، `size`، `media_type` و `tls_verified=true`. دریافت منبع، آن را خودکار به پارامتر قابل اجرا تبدیل نمی‌کند.

منبع واقعی بودجهٔ ۱۴۰۵ از [فایل رسمی سازمان امور مالیاتی](https://regulation.tax.gov.ir/uploads/aa27f525068b689822d8990ad74f61cc.pdf) با همین ابزار دریافت شد: ۱۳٬۱۸۱٬۰۹۳ بایت، SHA256 برابر `5417e111e74a84633f2f41fd509a95c334458b51cb3ebd246c3eff3c1891b78b`. فایل کامل و receipt در `.local/legal-rulepack-source-captures/tax-budget1405/` قرار دارند؛ فایل حجیم وارد Git نشده است. استخراج صفحه یا رونویسی عددی، باید به hash همین اصل و محل دقیق جدول متصل بماند؛ نبود فایل محلی نباید با یک URL بدون فایل جایگزین شود.

## بستهٔ کامل و ارجاع پارامترها

`manifest.json` قالب بستهٔ کامل، فقط این کلیدها را می‌پذیرد:

- `format=didban-payroll-rulepack-1`، `pack_id`، `calendar_year`، `effective_from`، `effective_to` و `producer_id`.
- `rules`: همان محتوای قابل اجرای دامنه؛ مقادیر مالی به‌صورت رشتهٔ دقیق، بدون عدد اعشاری JSON. تاریخ میلادی شروع/پایان باید داخل سال شمسی اعلام‌شده باشد.
- `sources`: حداقل یک منبع برای هر محدودهٔ `labour`، `insurance` و `tax`؛ هر ردیف دقیقاً دارای `id`، `scope`، `url`، `file` نسبی، `sha256`، `media_type`، `evidence_kind`، `retrieval_receipt` و `publication_reference` است. نوع شواهد `official_document`، `official_page` یا `web_excerpt` است؛ دو نوع اخیر یا فایل بدون receipt، صرفاً پیش‌نویس ناقص باقی می‌مانند.
- `citations`: نگاشت JSON Pointer هر برگ اجرایی به `{source_id, locator}`. همهٔ نرخ‌ها و مرزهای هر طبقه جداگانه ارجاع دارند؛ از جمله `/tax_bands/0/rate` و `/special_tax_profiles/eidi/tax_bands/0/up_to`. ارجاع صرف به نام کل جدول کافی نیست. تبدیل سالانه به ماهانه یا مبنای پس از معافیت باید در locator/مرجع کارشناسی روشن باشد.
- `fixtures`: حداقل یک نمونه برای هر پنج نوع monthly، eidi، sanavat، termination و arrears. هر نمونه `id`، `kind`، `contract`، `work`، `expected` و `reference` دارد. expected باید تمام ۱۳ نتیجهٔ مالی/مانده‌ای موتور را با رشتهٔ دقیق پوشش دهد. نمونه‌ها جایگزین ماتریس مستقل شرایط مرزی و استثناهای متخصص نیستند.

```text
.venv/bin/python tools/payroll_rulepack.py validate --pack PACK_DIRECTORY
.venv/bin/python tools/payroll_rulepack.py stage --pack PACK_DIRECTORY --target NEW_STAGE_DIRECTORY
```

آماده‌سازی، فقط فایل‌های مرجع را با مجوز خصوصی کپی و نسخهٔ کپی‌شده را دوباره بررسی می‌کند. پوشهٔ مقصد نباید از قبل وجود داشته باشد. hash استاندارد manifest و hash شواهد شامل hash همهٔ فایل‌ها ثبت می‌شود؛ تغییر فایل، locator، نمونه یا قانون، امضای قبلی را نامعتبر می‌کند.

فایل اختیاری `attestation.json` شامل `format=didban-payroll-attestation-1`، `evidence_hash`، `reviewer_id`، `key_id`، `reviewed_at`، `scopes`، `independent_of_producer=true` و `signature` است. signature امضای Ed25519 روی JSON مرتب‌شدهٔ UTF-8 بدون فیلد signature با separators فشرده و بدون ASCII-escape است. policy کلیدها باید خارج از بسته، فایل معمولی متعلق به کاربر با مجوز `0600` باشد؛ قالب `didban-payroll-reviewers-1` و آرایهٔ keys دارد. هر کلید reviewer، public key خام base64، مرجع مجوز، شروع/پایان اعتبار، سال‌های مجاز و سه محدوده را مقید می‌کند. `--trusted-reviewers POLICY --require-attestation` بستهٔ بدون اصل کامل یا امضای معتبر را رد می‌کند. هیچ policy واقعی متخصص در این تغییر ایجاد نشده است.

## استفادهٔ جزئی از جدول مالیات

برای استفاده از منبع مالیاتیِ قابل احراز لازم نیست بیمه و مزد با مقدار ساختگی پر شوند. دستور `validate-component --pack DIRECTORY` قالب مستقل `didban-payroll-tax-component-1` را می‌پذیرد:

- شناسه `component_id`، سال، تاریخ اجرا و `target` یکی از salary/eidi/sanavat/termination/arrears.
- `parameters` شامل فقط tax_mode، tax_exemption_monthly، tax_bands و rounding_unit؛ همهٔ برگ‌ها ارجاع مستقل دارند.
- `sources` فقط محدودهٔ tax، با همان قرارداد فایل/receipt بالا.
- `fixtures` حداقل یک مورد با taxable رشته، months عدد صحیح ۱ تا ۱۲، expected_tax رشته و reference. تطبیق با تابع واقعی مالیات انجام می‌شود.

نتیجه فقط `draft_component_checks_passed` یا `draft_component_evidence_incomplete` است؛ دامنهٔ جزئی در partial_scope مشخص می‌ماند. این جزء به‌تنهایی بستهٔ کامل حقوق نیست و دستور import کامل آن را نمی‌پذیرد. نرخ و مبنای بخشنامهٔ مربوط به عیدی نباید بدون مرجع مستقل به حقوق عادی تعمیم یابد.

## ورود عملی پیش‌نویس

```text
.venv/bin/python tools/payroll_rulepack.py import-draft --pack PACK_DIRECTORY --credential-file PRIVATE_SESSION_FILE --company-id COMPANY_UUID --idempotency-key REQUEST_UUID --receipt-file PRIVATE_RECEIPT_FILE
```

فایل جلسهٔ `0600` فقط origin و session_cookie دارد؛ راز در آرگومان وارد نمی‌شود. origin باید HTTPS یا HTTP روی loopback باشد. ابزار با همان نشست، CSRF عادی می‌گیرد و فقط createPayrollRule را با شناسهٔ idempotency صریح صدا می‌زند. مجوز جاری payroll.manage/view، شرکت، فعال‌بودن ماژول و audit در سرویس موجود اعمال می‌شوند. هیچ review، approval، نصب نرخ یا ثبت legal_review انجام نمی‌شود. نسخهٔ موجود قانون ویرایش نمی‌شود؛ پیش‌نویس تازه ساخته می‌شود.

ورود پیش‌نویس به شواهد کامل بسته و نمونه‌های منطبق نیاز دارد، اما امضای مستقل برای ساخت پیش‌نویس لازم نیست. پاسخ سرور باید دقیقاً همان محتوا و تاریخ‌ها با reviewed=false و legal_verified=false باشد. receipt خصوصی، rule_id، شرکت، hash شواهد، hash محتوای قانون و کلید درخواست را متصل می‌کند؛ cookie در آن نوشته نمی‌شود. اگر پاسخ شبکه نامعلوم شد، همان بسته/شرکت/کلید/receipt را تکرار کنید؛ عوض‌کردن درخواست با receipt قبلی رد می‌شود. receipt موفق، تکرار محلی را بدون درخواست دوباره پاسخ می‌دهد. پوشهٔ شواهد و receipt باید همراه عملیات استقرار و پشتیبان نگهداری شوند؛ در این نسخه فایل‌ها به مخزن objects پایگاه منتقل نمی‌شوند و receipt خارجی به‌تنهایی رکورد قانونی پایگاه نیست.

## قالب بیمه و محدودیت‌های باقیمانده

[مسیر راهنمای رسمی تأمین اجتماعی](https://tamin.ir/tos/ItemGuide?id=26) با درخواست مستقیم TLS پاسخ HTML200 داد، اما بدنه صفحهٔ انتقال/بررسی جاوااسکریپتی بود؛ تشخیص افزوده‌شده آن را رد می‌کند. capture با برچسب `.local/legal-rulepack-source-captures/insurance-guide-index.blocked` و classification غیرقانونی نگه داشته شد. [خدمات غیرحضوری](https://eservices.tamin.ir/) و [درگاه خدمات](https://es.tamin.ir/) نیز در بررسی ابزار وب 403 بودند. schema رسمی جاری، طول/نوع فیلدهای DBF، encoding و نمونهٔ پذیرفته‌شدهٔ ارسال، از منبع رسمی قابل احراز دریافت نشد؛ جدول سایت‌های ثانویه جایگزین آن نشده است.

خروجی قابل بارگذاری بیمه/مالیات همچنان به اصل قالب جاری و آزمون نمونهٔ رسمی وابسته است. به‌روزرسانی نرخ‌ها نیازمند اصل تمام منابع مؤثر، رفع اختلاف مبنا و تاریخ اجرا، نمونه‌های مستقل، متخصص مجاز واقعی و استقرار کنترل‌شده است. ابزار حاضر عمداً مرحلهٔ تأیید قانونی را جعل یا خودکار نمی‌کند.

## بررسی انجام‌شده

۲۰ آزمون مستقل ابزار برای شواهد/امضا، کنترل مسیر و overwrite، HTML/PDF/challenge، ارجاع ریزپارامترها، جزء مالیات، ورود CSRF/idempotency و رد credentials باز؛ موفق. یک آزمون واقعی مسیر API روی پایگاه موقت PostgreSQL 18 نیز موفق شد: مدیر مالی پیش‌نویس را وارد کرد، تکرار همان درخواست قانون اضافه نساخت، viewer رد شد و هیچ legal_review ایجاد نشد. داده‌ها و امضای نمونه‌ها کاملاً مصنوعی‌اند؛ هیچ نرخ یا تأیید واقعی از این آزمون‌ها نتیجه نمی‌شود. قالب جدید migration ندارد و فایل‌های اعمال‌شدهٔ ۰۰۱ تا ۰۳۱ تغییر نکردند.
