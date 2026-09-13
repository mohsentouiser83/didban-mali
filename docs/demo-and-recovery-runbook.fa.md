# راهنمای دمو و بازیابی MVP

این راهنما برای سناریوی کاملاً ساختگی `demo-1405-v1` است. هیچ نام، شناسه، شماره حساب یا داده واقعی مشتری در seed وجود ندارد.

## ساخت داده دمو

```bash
make seed-demo
```

خروجی در پوشه محلی `demo-data/` ساخته می‌شود و شامل دفتر حسابداری، گردش سه حساب بانکی، فروش، دو فایل خطادار و manifest امضاشده سناریو است. این پوشه عمداً در Git نگهداری نمی‌شود؛ منبع حقیقت، مولد نسخه‌دار و آزمون‌های golden است.

## دروازه پذیرش

```bash
make test-acceptance
make test-integration
make test-e2e
```

آزمون acceptance این موارد را مستقل از snapshot بررسی می‌کند: حداقل ۲۰ exact، precision حداقل ۹۵٪، حداقل ۵ fuzzy فقط برای بررسی، دو نمونه از هر ۸ finding، ثبات نتیجه، صحت هش manifest، قابل‌خواندن‌بودن فایل‌ها، رد formula و ردیف خراب، و حذف secret/payload مالی از log.

آزمون integration مسیر API را از ثبت‌نام و شرکت تا upload، اسکن، mapping، validation، normalization، metrics، reconciliation، findings، review، dashboard، PDF، AI غیرفعال و RLS طی می‌کند.

آزمون E2E از مرورگر واقعی وارد حساب دمو می‌شود، نه صفحهٔ اصلی محصول را طی می‌کند، وجود هر سه منبع حسابداری، بانک و فروش را کنترل می‌کند، تم و بارگذاری مجدد را می‌آزماید و نمای موبایل را از نظر overflow و خطاهای بحرانی مرورگر می‌سنجد.

برای مشاهده دستی، با `admin / admin` وارد شوید و از منوی شرکت به «آمادگی و پذیرش» بروید. هر ایستگاه به صفحهٔ عملیاتی همان بخش وصل است.

## بازیابی سرویس‌ها

### توقف worker یا Redis

رکوردهای `queued` و `processing` منبع حقیقت باقی می‌مانند و درخواست‌های mutation دارای Idempotency-Key هستند. پس از بازگشت Redis/worker، همان درخواست با همان کلید تکرار می‌شود؛ رکورد مالی جدید ساخته نمی‌شود. jobهای گزارش و اسکن retry محدود و backoff دارند و شکست نهایی را با `failure_code` و `retryable` ثبت می‌کنند.

### توقف MinIO حین تولید گزارش

artifact ناقص پاک می‌شود. Snapshot گزارش تغییر نمی‌کند و job ذخیره‌سازی حداکثر سه بار retry می‌شود. پس از شکست نهایی، وضعیت `failed` قابل مشاهده است و payload ثابت گزارش برای بررسی حفظ می‌شود.

### توقف ClamAV

فایل از quarantine خارج نمی‌شود. پس از retry محدود، import با `MALWARE_SCAN_UNAVAILABLE` و `retryable=true` شکست می‌خورد. فایل تا اسکن پاک، قابل preview، normalization یا download نیست.

### توقف PostgreSQL

readiness با HTTP 503 پاسخ می‌دهد و orchestration نباید ترافیک جدید بفرستد. پس از بازگشت دیتابیس، migration یک‌باره اجرا و سپس API/worker بالا آورده می‌شوند:

```bash
docker compose up -d postgres redis minio clamav
docker compose run --rm migrate
docker compose up -d api worker
```

## کنترل نهایی قبل از دمو

```bash
make verify-mvp
```

این فرمان lint، typecheck، build تولیدی، آزمون‌های واحد و integration، اعتبار Compose، نبود schema drift و مسیر مرورگری را کنترل می‌کند. فعال‌کردن AI واقعی بخشی از دمو نیست و همچنان به تصویب ارائه‌دهنده و محل پردازش داده وابسته است.
