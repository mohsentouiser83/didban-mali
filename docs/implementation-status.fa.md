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

### دروازه بعدی

فاز ۳ پس از تأیید: بارگذاری امن فایل، ذخیره‌سازی خصوصی، hash، بررسی نوع/اندازه، metadata و وضعیت job.
