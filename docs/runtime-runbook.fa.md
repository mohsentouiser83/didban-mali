# راه‌اندازی زیرساخت و محاسبات مالی پایه

این نسخه، API اجرایی ورود، دعوت، بازیابی رمز، شرکت، عضویت، دسترسی و تأیید گزارش موجود است. رابط وب، دوره مالی و بارگذاری/آماده‌سازی فایل ساخته شده‌اند؛ تفسیر و موتور مالی پایه با نتایج نسخه‌دار و شواهد متصل‌اند. حوزه‌های بعد در financial-runtime.fa.md و parallel-delivery-plan.fa.md مشخص‌اند. مسیر کار فقط مخزن `didban-mali-rebuild` است.

## راه‌اندازی محلی با Docker

ابتدا ابزارهای Python را نصب کنید؛ فایل lock نسخه‌ها را مشخص می‌کند:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.lock
PYTHONPATH=apps/api .venv/bin/python -m didban.manage init-env
docker compose --env-file .env -f infra/compose.yaml up --build -d web
```

`init-env` پنج secret تصادفی را در `.env` با دسترسی ۶۰۰ می‌سازد؛ مقدارها را چاپ و فایل موجود را overwrite نمی‌کند. `.env` و محیط‌های آزمون در Git نیستند. اگر دریافت از PyPI اصلی در محیط شما در دسترس نیست، فقط URL یک mirror عمومی مورداعتماد را در `PIP_INDEX_URL` تنظیم کنید؛ اعتبارنامه خصوصی در build argument قرار نگیرد.

Compose ابتدا PostgreSQL، سپس migration/provision و بعد API را راه‌اندازی می‌کند. پایگاه داده port عمومی ندارد؛ API فقط روی `127.0.0.1:18147` منتشر می‌شود. شناسه‌های immutable تصویر Python و PostgreSQL در فایل‌های زیرساخت ثبت شده‌اند. این پیکربندی محلی، Cookie Secure را فقط برای آدرس loopback خاموش می‌کند؛ برای نصب سازمانی HTTPS و `DIDBAN_COOKIE_SECURE=true` و origin دقیق سازمان لازم‌اند. TLS و استقرار سازمانی در این کار انجام نشده است.

## ساخت اولین مدیر نصب

فقط در نصب خالی، فرمان زیر را اجرا کنید؛ رمز با ورودی پنهان دریافت می‌شود و در آرگومان خط فرمان قرار نمی‌گیرد:

```bash
docker compose --env-file .env -f infra/compose.yaml run --rm -it migrate \
  python -m didban.manage bootstrap --email admin@example.com --name 'مدیر سازمان'
```

ایمیل مثال را با شناسه موردنظر خودتان عوض کنید. Bootstrap برای نصب دارای کاربر دوباره اجرا نمی‌شود و endpoint عمومی ندارد. Bootstrap مدیر نصب می‌سازد؛ تا عضویت صریح شرکت نداشته باشد، به داده مالی هیچ شرکت دسترسی ندارد.

سلامت سرویس در `http://127.0.0.1:18147/health/ready` و قرارداد زنده در `/openapi.json` است. قرارداد زنده فقط ۴۶ عملیات پیاده‌شده را نمایش می‌دهد؛ سند کامل `contracts/openapi.json` حوزه‌های آینده را نیز دارد. مسیرهای ساخته‌نشده موفقیت ساختگی برنمی‌گردانند.

## ترتیب استفاده از API

۱. `GET /api/v1/auth/csrf`، با نگهداری cookieهای همان مرورگر/کلاینت. مقدار token پاسخ در هدر `X-CSRF-Token` قرار گیرد.
۲. `POST /api/v1/auth/login` با email/password و `Idempotency-Key` یکتا. نشست در cookie HttpOnly می‌آید؛ body شامل session token نیست. پس از ورود، CSRF از cookie جدید/مسیر GET دوباره دریافت شود.
۳. مدیر نصب با `POST /api/v1/admin/users` کاربر دعوت‌شده می‌سازد. token یک‌بارمصرف فقط در پاسخ همین عملیات مجاز است و دستی تحویل داده می‌شود؛ ایمیل/پیام بیرونی ارسال نمی‌شود. کاربر در `accept-invitation` رمز خود را تعیین و سپس جداگانه وارد می‌شود.
۴. مدیر نصب با `POST /api/v1/admin/companies` شرکت و مالک اولیه را اتمی ایجاد می‌کند. فهرست `/companies` صرفاً شرکت‌های عضو کاربر را نشان می‌دهد؛ مدیر نصب استثنا ندارد.
۵. مالک، کاربر موجود را به شرکت اضافه و نقش/فعال‌بودن عضویت را مدیریت می‌کند. هر تغییر نسخه‌دار به `If-Match` نیاز دارد. غیرفعال‌کردن آخرین مالک رد می‌شود. تغییر/غیرفعال‌کردن نقش، مجوز صریح تأیید قبلی را در صورت لزوم لغو می‌کند؛ بازگشت نقش آن مجوز را ساکت برنمی‌گرداند.
۶. `/companies/{company_id}/access` نقش و قابلیت‌های فعلی محاسبه‌شده سمت سرور را می‌دهد. مدیر مالی تأییدکننده پیش‌فرض است؛ مالک/مشاور فقط با grant صریح. فقط مالک همان شرکت grant را اعطا یا لغو می‌کند. ETag endpoint مجوز از نسخه عضویت می‌آید.
۷. تأیید گزارش فقط برای گزارش منتشرشده موجود و همان نسخه انجام می‌شود؛ گزارش‌های فعلی از manifest مالی و snapshotهای ثابت حوزه‌ها تولید می‌شوند؛ fixtureهای قدیمی هویت به‌تنهایی شاهد صحت موتور مالی نیستند. عضویت و مجوز هنگام تأیید دوباره کنترل می‌شوند؛ لغو مجوز سابقه تأیید قبلی را حذف نمی‌کند.

برای logout، body ارسال نکنید. خروج، نشست جاری را در سرور لغو می‌کند. retry ورود با کلید قدیمی نمی‌تواند نشست خروج‌شده یا منقضی را زنده کند؛ در این حالت خطای تعارض/احراز هویت مقدم بر replay است.

## بازیابی رمز

مدیر نصب `POST /admin/users/{user_id}/password-reset` را اجرا و کد را دستی به کاربر می‌دهد. کد reset یک ساعت و دعوت ۲۴ ساعت اعتبار دارد. مصرف دوباره با کلید جدید، نوع کد اشتباه یا کد منقضی رد می‌شود. تعیین رمز جدید همه نشست‌های قبلی آن کاربر را لغو می‌کند. رمز قبلی هیچ‌وقت قابل دریافت نیست. تلاش‌های ورود و مصرف کد با شمارنده پایدار DB محدود می‌شوند؛ restart API آن شمارنده را پاک نمی‌کند.

## اجرای بدون Docker

چهار اتصال را جدا نگه دارید: `DIDBAN_MIGRATION_DSN` فقط برای CLI، `DIDBAN_IDENTITY_DSN` برای هویت و `DIDBAN_APP_DSN` برای مالی و `DIDBAN_WORKER_DSN` فقط برای worker. با مدیر DB ابتدا `make migrate` و سپس `didban.manage provision-login` برای سه گروه `didban_identity`، `didban_app` و `didban_worker` اجرا شود. پس از تعیین secret و origin، `make serve-api` API را روی loopback اجرا می‌کند. رمزهای DB در prompt پنهان گرفته می‌شوند؛ در shell history ننویسید.

HTTP process اتصال superuser، BYPASSRLS، CREATEROLE/CREATEDB، مالک جدول یا اتصال ترکیبی دو مرز را در startup رد می‌کند. نام کاربری session و current_user نیز باید یکسان باشد؛ اجرای `SET ROLE` روی اتصال superuser جای login محدود نیست. secret و DSN در repr تنظیمات یا پاسخ خطا چاپ نمی‌شوند.

## آزمون‌ها

```bash
.venv/bin/python tools/local_test_db.py start
export DIDBAN_TEST_DSN='host=/Users/mohsentouiserkani/Projects/didban-mali-rebuild/.local/socket port=55437 dbname=postgres'
make test-db
make test-http
make check
make lint
make test-compose
# اجرای SQL، HTTP و intake روی PostgreSQL 18.6 و ClamAV مستقل
make test-postgres18
.venv/bin/python tools/local_test_db.py stop
```

`DIDBAN_TEST_DSN` باید به خوشه مستقل آزمون اشاره کند. `test-http` از loginهای واقعی محدود و database تصادفی استفاده می‌کند و در پایان آن‌ها را حذف می‌کند. `test-compose` پروژه Docker و رمزهای مصنوعی مستقل می‌سازد، نصب پاک و درخواست TCP واقعی را بررسی و فقط همان container/volumeهای آزمون را پاک می‌کند؛ `.env` یا volume نصب خودتان را بازاستفاده نمی‌کند. برای mirror عمومی آزمون Docker، `DIDBAN_TEST_PIP_INDEX_URL` قابل تنظیم است.

گزارش‌ها در `runtime-validation.json`، `compose-validation.json`، `postgres18-validation.json`، `database-validation.json` و `contract-validation.json` هستند؛ بررسی وب در `ui-validation.json` و `compose-web-validation.json` ثبت می‌شود. این آزمون‌ها جای تست مرورگر، موتور مالی، پنج کاربر هم‌زمان در بار واقعی یا بازیابی پشتیبان سازمانی نیستند.

رابط ورود و مدیریت سازمان اکنون ساخته شده است؛ مراحل استفاده و تنظیم origin وب در [راهنمای وب](web-runtime.fa.md) آمده است. دعوت دوباره برای حساب فعال‌نشده با `POST /admin/users/{user_id}/invitation` در اختیار مدیر نصب است؛ دعوت قبلی را باطل می‌کند.

جزئیات storage، worker، اسکن و نگهداری امضاهای ضدبدافزار در [راهنمای آماده‌سازی](intake-runtime.fa.md) است.

مرحله تفسیر و اعتبارسنجی ورودی اکنون اجرا شده است؛ جزئیات و حدود اعتبار در [راهنمای تفسیر](interpretation-runtime.fa.md) آمده است.

## وضعیت جاری موج سوم — ۲۰۲۶/۱۰/۲۶

این بخش بر وضعیت‌های تاریخی پیشین مقدم است. runtime۱۰ با migrationهای ۰۰۱–۰۱۷، ۹۴ جدول برنامه و ۱۰۴ عملیات ثبت‌شده HTTP اجرا می‌شود؛ قرارداد کامل ۹۸ مسیر، ۱۱۹ عملیات و ۱۷۸ schema دارد. ثبت endpoint به‌تنهایی آزمون کامل آن نیست.

گزارش ثابت پس از تحلیل، نسخه دقیق manifest، تطبیق‌ها، تسویه، نقدینگی، پیش‌بینی و شواهد را نگه می‌دارد و سه کار بادوام PDF، Excel و CSV خطا می‌سازد. `analysis_finished_at` پایان تحلیل است؛ پایان نوبت فقط پس از آماده‌شدن هر سه خروجی و رفع مانع سؤال ثبت می‌شود. `report_id` روی نوبت و لینک همان گزارش در رابط موجود است. تأیید با مجوز جاری و همان نسخه ثبت می‌شود و به نسخه تازه منتقل نمی‌شود. نوبت تمام‌شده دوباره باز نمی‌شود؛ بازبینی پیش‌بینی نوبت ادامه مستقل دارد.

صفحات مستقل گزارش‌ها، سیاست‌ها و اصل فایل متصل‌اند. سقف بارگذاری و فرض پیشنهادی پیش‌بینی نسخه‌دار و مصرف می‌شوند؛ بایگانی اثر مالی و شواهد را حفظ می‌کند. مدت نگهداری بدون پاک‌سازی خودکار است؛ حذف قطعی تنها برای اصل واقعاً فاقد وابستگی، با مجوز و پاک‌سازی فیزیکی بادوام انجام می‌شود. جزئیات در `reports-runtime.fa.md` و `policy-retention-runtime.fa.md` است.

پشتیبان رمز‌شده، تنظیمات HTTPS و بازیابی در مقصد تازه در `installation-readiness.fa.md` شرح داده شده‌اند. آزمون بازیابی برنامه فعلی روی دو PostgreSQL مستقل، مدرک نصب پاک Compose نیست. `capacity-validation.json` وضعیت واقعی آخرین اندازه‌گیری را نشان می‌دهد؛ پنج استفاده‌کننده در یک بسته بانکی مصنوعی به معنی پنج تحلیل سنگین هم‌زمان نیست. ساخت تازه و نصب مستقل Compose با ۱۵ کنترل، شامل فونت PDF و نوشتن خروجی توسط worker، موفق شد؛ HTTPS و بازیابی کامل روی سرور سازمان هنوز بررسی نشده است.

گزارش‌های `reports-validation.json`، `report-rendering-validation.json`، `policy-validation.json`، `delivery-workflow-validation.json`، `backup-bundle-validation.json`، `installation-config-validation.json` و `restore-validation.json` شواهد این مرحله‌اند. ظرفیت کامل و بازیابی با ۱۷migration موفق‌اند؛ اجرای نهایی یکپارچه و حالت‌های باقی‌مانده مرورگر در حال به‌روزرسانی‌اند؛ وضعیت pass/fail و hash هر گزارش مرجع همان دامنه است. `wave2-validation.json` و گزارش‌های نصب مراحل قبل، شاهد نسخه فعلی همه قابلیت‌ها نیستند. مدل زنده و provider برای تشخیص فایل/نگاشت/نقش حساب، ارزیابی قالب‌های متنوع، کاهش حرکت واقعی سیستم‌عامل و پذیرش مالی/سازمانی همچنان باقی‌اند. هیچ پیام بیرونی، نصب روی سازمان یا فراخوانی مدل زنده انجام نشده است.
