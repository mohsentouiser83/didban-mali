# دیدبان مالی — ساخت تازه

رابط فارسی، ورود و مجوزها، شرکت‌ها و دوره‌ها، بارگذاری خصوصی Excel/CSV، تفسیر کنترل‌شده، محاسبات مالی نسخه‌دار، تطبیق بانک/دفتر و مؤدیان، دریافت‌وپرداخت و برنامه تعهدات، گزارش نقدینگی و پیش‌بینی ۳۰روزه پیاده شده‌اند. گزارش‌های ثابت با PDF مدیریتی، Excel جزئیات و CSV ردیف‌های خطادار خودکار ساخته می‌شوند؛ تأیید مسئول مالی مربوط به همان نسخه است. سیاست‌های نسخه‌دار، بایگانی و نگهداری اصل فایل با کنترل وابستگی حذف و ابزار پشتیبان رمز‌شده/بازیابی نیز ساخته شده‌اند. بسته موج سوم روی runtime۱۰، ۱۷migration و ۹۴ جدول برنامه آزموده شد؛ شمار جاری توسعه در `contracts/runtime-extensions.json` ثبت می‌شود. طراحی روشن/بنفش و فونت‌های مصوب حفظ شده‌اند.

آزمون‌های بسته موج سوم، ظرفیت ۲۰هزار ردیف، سه خروجی، بایگانی، بازیابی مستقل و نصب پاک Compose موفق‌اند. اتصال Luna هم‌زمان در گفت‌وگوی «بررسی اتصال GPT Luna» توسعه می‌یابد؛ تغییرهای بعدی مدل و migration۱۸ جزو پذیرش قبلی موج سوم نیستند. [گزارش این بسته](docs/wave3-validation.json) نسخه و دامنه دقیق بررسی را جدا ثبت می‌کند. HTTPS و پذیرش مالی با داده سازمان هنوز انجام نشده‌اند. این مخزن هنوز محصول پذیرفته‌شده برای انتشار سازمانی نیست.

- [گزارش‌ها، خروجی و تأیید نسخه](docs/reports-runtime.fa.md)
- [سیاست‌ها، نگهداری و اصل فایل](docs/policy-retention-runtime.fa.md)
- [نصب، پشتیبان رمز‌شده و بازیابی](docs/installation-readiness.fa.md)
- [اتصال مدل، بودجه و محدودیت‌های دستیار](docs/model-runtime.fa.md)
- [محاسبات مالی پایه و نتایج نسخه‌دار](docs/financial-runtime.fa.md)
- [تقسیم کار مراحل باقی‌مانده](docs/parallel-delivery-plan.fa.md)
- [راهنمای تفسیر و اعتبارسنجی ورودی](docs/interpretation-runtime.fa.md)
- [راهنمای دوره‌ها، بارگذاری و آماده‌سازی](docs/intake-runtime.fa.md)
- [راهنمای وب و نصب یکپارچه](docs/web-runtime.fa.md)
- [ورود، نقش‌ها و راهنمای API](docs/runtime-runbook.fa.md)
- [وضعیت اجرا و آزمون‌ها](docs/implementation-status.fa.md)
- [بررسی مرورگر و محدودیت‌ها](docs/business-ui-validation.json)

پروژه قبلی و داده‌های آن حفظ شده‌اند؛ کد برنامه قدیمی منتقل نشده است. مدیر واقعی اولیه فقط از CLI نصب ساخته می‌شود. حساب‌های ثابت صرفاً در ابزار مستقل آزمون مصنوعی‌اند و وارد نصب محصول نمی‌شوند.

## مسیر مطالعه و ساخت

1. [تصمیم‌های D01–D08](docs/rebuild-decision-review.fa.md) و [مشخصات محصول](docs/rebuild-spec.fa.md)
2. [مدل داده و قیود](docs/data-model.fa.md) — SQL در `database/`
3. [قرارداد API](docs/api-contract.fa.md) — [OpenAPI 3.1.1](contracts/openapi.json)
4. [تراکنش و گردش پردازش](docs/workflow-contract.fa.md)
5. [وضعیت و گام‌های بعد](docs/implementation-status.fa.md)
6. [طراحی مصوب](design.md) و [بسته مرجع مالی](docs/validation/rebuild-v1/README.fa.md)

## ساختار

```text
apps/api/didban/          API، خدمات کاربردی و اتصال‌های مستقل هویت/مالی
apps/web/                 رابط Next.js، اجزای مشترک و proxy هم‌مبدأ
packages/api-client/      نوع‌های تولیدی OpenAPI و کلاینت مشترک
assets/fonts/             اصل فونت‌های مشترک، شامل وزن‌های PDF
contracts/                OpenAPI، نمونه‌های معتبر/نامعتبر و فهرست جدول‌ها
database/                 baseline ثابت 001–003 و migrationهای بعدی
docs/                     تصمیم‌ها، مشخصات تفصیلی و گزارش بررسی‌ها
tools/                    ساخت قراردادها و بررسی سازگاری
tests/                    آزمون قیود در پایگاه موقت
infra/                    Dockerfile و Compose محلی؛ استقرار سازمانی انجام نشده
```

## بررسی قراردادها

Python 3.12 و محیط مجازی مستقل:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.lock
make contracts
make check
```

`requirements-runtime.lock` وابستگی‌های API و `requirements-dev.lock` ابزارهای بررسی/آزمون را قفل می‌کنند. FastAPI، PostgreSQL، رابط Next.js و کلاینت وب اجرایی‌اند؛ `package-lock.json` وابستگی‌های وب را قفل می‌کند. در صورت نیاز، mirror عمومی از تنظیم نصب انتخاب می‌شود؛ وابستگی به URL خصوصی یا کد پروژه قبلی وجود ندارد.

## آزمون واقعی SQL

آزمون به PostgreSQL محلی و اتصال مدیرِ خوشه آزمون نیاز دارد. خودش یک database تصادفی می‌سازد و در پایان حذف می‌کند؛ به پایگاه برنامه قبلی وصل نشوید.

```bash
export DIDBAN_TEST_DSN='host=/path/to/test/socket port=55437 dbname=postgres'
make test-db
make test-http
```

برای ساخت خوشه محلی، `tools/local_test_db.py` را ببینید. اسکریپت فقط زیر `.local/` همین مخزن کار می‌کند و listener شبکه باز نمی‌کند. `make test-compose` نیز یک نصب مصنوعی مستقل می‌سازد و فقط همان منابع آزمون را پاک می‌کند. رمز واقعی یا کلید مدل در مخزن قرار نگیرد. گزارش‌های بررسی و دامنه دقیق آن‌ها در `docs/*-validation.json` هستند.

منبع baseline SQL، `tools/build_schema.py` به‌همراه دو فایل قیود است؛ 001–003 ثابت بمانند و تغییر تازه با migration بعدی انجام شود. runner، DDL و checksum را اتمی ثبت و دست‌کاری migration اعمال‌شده را رد می‌کند. منبع OpenAPI، `tools/build_openapi.py` و افزونه‌های محلی `tools/contract_extensions/` است؛ خروجی تولیدشده را جداگانه دست‌کاری نکنید. `/openapi.json` سرویس فقط مسیرهای پیاده‌شده را ارائه می‌کند.
