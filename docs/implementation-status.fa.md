# وضعیت پیاده‌سازی دیدبان مالی

## فاز ۱ — مخزن و محیط توسعه

**وضعیت:** تکمیل‌شده
**تاریخ:** ۱۴۰۵/۰۶/۲۱

### خروجی‌ها

- monorepo با workspaceهای وب و packageهای مشترک
- رابط فارسی RTL روی Next.js و TypeScript
- API ماژولار FastAPI با endpointهای liveness و readiness
- baseline مهاجرت Alembic
- Celery worker با Redis broker/backend
- PostgreSQL، Redis و MinIO در Docker Compose
- ساخت bucket خصوصی به‌صورت idempotent
- Dockerfileهای غیر root برای API و وب
- lint، typecheck، unit test، production build و workflow کنترل کیفیت
- تنظیمات محیط نمونه بدون secret واقعی

### نتیجه دروازه کیفیت

| کنترل | نتیجه |
|---|---|
| ESLint رابط | موفق |
| TypeScript strict | موفق |
| Vitest | ۱ از ۱ موفق |
| Next.js production build | موفق |
| Ruff backend | موفق |
| Mypy strict | موفق |
| Pytest | ۲ از ۲ موفق |
| Docker Compose config | موفق |
| PostgreSQL | healthy |
| Redis | healthy |
| MinIO و bucket initializer | healthy / completed |
| Alembic | نسخه `20260912_0001` اعمال شد |
| FastAPI readiness | database و redis آماده |
| Celery worker | پاسخ `pong` |
| رابط production | healthy، بدون خطای console |

## فاز ۲ — هویت و شرکت

**وضعیت:** تکمیل‌شده
**تاریخ:** ۱۴۰۵/۰۶/۲۱

### خروجی‌ها

- ثبت‌نام، ورود، خروج و بازیابی نشست با access token کوتاه‌عمر
- refresh token چرخشی و ذخیرهٔ hash آن در پایگاه‌داده
- کوکی HttpOnly و محافظت double-submit CSRF برای عملیات تغییردهنده
- نقش‌های مالک، مدیر مالی، مشاور و مشاهده‌گر با کنترل سمت سرور
- ایجاد، مشاهده و ویرایش شرکت و مدیریت اعضای آن
- Company Switcher و داشبورد فارسی RTL واکنش‌گرا
- کاربر محدود `didban_app` بدون امتیاز superuser یا bypass RLS
- سیاست‌های PostgreSQL RLS برای شرکت، دسترسی شرکت و رویدادهای ممیزی
- ثبت audit event برای عملیات حساس هویت و شرکت
- آزمون یکپارچهٔ leakage در API و مستقیماً در پایگاه‌داده

### نتیجه دروازه کیفیت

| کنترل | نتیجه |
|---|---|
| ثبت‌نام و نشست امن | موفق |
| درخواست تغییردهنده بدون CSRF | رد با ۴۰۳ |
| دسترسی شرکت A به شناسه شرکت B | پنهان با ۴۰۴ |
| مشاهده مستقیم داده با نقش محدود DB | فقط شرکت مجاز |
| تغییر شرکت توسط مشاهده‌گر | رد با ۴۰۳ |
| Ruff و Mypy strict | موفق |
| Pytest شامل isolation | ۳ از ۳ موفق |
| ESLint و TypeScript strict | موفق |
| Vitest | ۱ از ۱ موفق |
| مسیر واقعی مرورگر | ثبت‌نام و ایجاد شرکت موفق، بدون خطای JavaScript |

## فاز ۳ — بارگذاری و ذخیره‌سازی امن

**وضعیت:** تکمیل‌شده
**تاریخ:** ۱۴۰۵/۰۶/۲۱

### خروجی‌ها

- دریافت جریان‌محور فایل‌های CSV و XLSX تا سقف ۵۰ مگابایت
- پاک‌سازی نام فایل و استفاده از کلید تصادفی به‌جای نام کاربر در فضای ذخیره‌سازی
- محاسبهٔ SHA-256، تشخیص فایل تکراری و ثبت metadata ساختاری
- رد فایل اجراییِ تغییرنام‌یافته، XLSX نامعتبر، آرشیو مشکوک و فایل ماکرو‌دار
- نگهداری فایل در قرنطینه تا پایان اسکن ClamAV و انتقال نسخهٔ سالم به ناحیهٔ خصوصی
- وضعیت پایدار job در PostgreSQL از `uploaded` تا `awaiting_mapping` یا `failed`
- صف Celery با retry کنترل‌شده برای عدم دسترسی موقت به اسکنر
- دانلود فقط پس از نتیجهٔ clean و فقط برای اعضای همان شرکت
- سیاست‌های RLS و ایندکس‌های tenant/FK برای source، file و import batch
- رابط فارسی RTL برای drag-and-drop، وضعیت زندهٔ اسکن، هشدار فایل تکراری و دانلود
- ثبت audit event برای دریافت و نتیجهٔ اسکن

### نتیجه دروازه کیفیت

| کنترل | نتیجه |
|---|---|
| فایل سالم CSV | اسکن clean و دانلود بایت‌به‌بایت موفق |
| نمونهٔ استاندارد آزمون بدافزار | تشخیص و رد؛ دانلود با ۴۰۹ مسدود |
| دسترسی شرکت دیگر به import/download | پنهان با ۴۰۴ |
| مشاهده مستقیم import با کاربر شرکت دیگر در DB | صفر رکورد |
| CSV اجرایی‌نما و XLSX ماکرو‌دار | رد با ۴۱۵ |
| Ruff و Mypy strict | موفق |
| Pytest واحد | ۶ موفق |
| آزمون یکپارچه | ۲ موفق |
| ESLint، TypeScript و production build | موفق |
| مسیر واقعی مرورگر | ثبت‌نام، ایجاد شرکت، بارگذاری، اسکن و نمایش دانلود موفق |
| Docker Compose | API، وب، PostgreSQL، Redis، MinIO، worker و ClamAV سالم |
| Alembic | نسخه `6702092c0984` اعمال شد |

### دروازه بعدی

فاز ۴ پس از تأیید: پیش‌نمایش فارسی داده، تطبیق ستون‌ها، تبدیل‌های صریح، validation issue و گزارش coverage برای سه قالب متفاوت.
