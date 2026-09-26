# دستورالعمل‌های عملیاتی و راهنمای مدیریت حوادث دیدبان مالی (Production Runbooks)

این سند مرجع رسمی تیم مهندسی، امنیت و پشتیبانی دیدبان مالی جهت مدیریت حوادث، پایداری زیرساخت و حفظ ایزولاسیون چندمستأجری (Multi-Tenant Isolation) در محیط عملیاتی است.

---

## ۱. سطوح بحران و زمان پاسخگویی (SLA & Severities)

| سطح | تعریف | حداکثر زمان واکنش (MTTA) | حداکثر زمان حل (MTTR) | مسئول اصلی |
| :--- | :--- | :--- | :--- | :--- |
| **P1 - بحرانی** | نقض ایزولاسیون داده، خطای یکپارچگی مالی، قطعی کامل سامانه | ۱۵ دقیقه | ۱ ساعت | تیم امنیت و مهندس ارشد |
| **P2 - عمده** | از کار افتادن صف نرمال‌سازی یا آنتی‌ویروس، افزایش تاخیر به بالای ۲ ثانیه | ۳۰ دقیقه | ۴ ساعت | تیم زیرساخت |
| **P3 - جزئی** | خطاهای مقطعی در گزارش‌گیری منفرد، کندی غیراساسی | ۲ ساعت | ۲۴ ساعت | تیم توسعه |

---

## ۲. ران‌بوک‌های وضعیت بحرانی (P1 Runbooks)

### ران‌بوک P1-01: هشدار نشت داده میان‌مستأجری (Cross-Tenant Data Leak Alert)
- **علائم:** دریافت خطای ۴۰۳/۴۰۴ غیرمنتظره، مشاهده داده یک شرکت توسط شرکت دیگر در گزارش‌ها، یا ثبت شناسه شرکت نادرست در `audit_events`.
- **اقدامات فوری:**
  1. اگر تهدید فعال وجود دارد، فوراً ترافیک کاربر مهاجم را در لایه WAF یا با دستور ابطال نشست‌ها قطع کنید:
     ```bash
     docker compose exec postgres psql -U didban_admin -d didban_mali -c \
       "UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = '<COMPROMISED_USER_ID>';"
     ```
  2. بررسی فعال بودن RLS روی تمامی جداول حساس:
     ```bash
     docker compose exec postgres psql -U didban_admin -d didban_mali -c \
       "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r';"
     ```
  3. اجرای تست ایزولاسیون مستأجر در محیط محلی یا سرور:
     ```bash
     RUN_INTEGRATION_TESTS=1 .venv/bin/pytest apps/api/tests/test_tenant_isolation.py
     ```
  4. استخراج لاگ‌های ممیزی مربوط به درخواست مشکوک:
     ```bash
     docker compose exec postgres psql -U didban_admin -d didban_mali -c \
       "SELECT * FROM audit_events WHERE company_id = '<TARGET_COMPANY_ID>' ORDER BY occurred_at DESC LIMIT 50;"
     ```

---

### ران‌بوک P1-02: انباشت صف و توقف پردازشگرهای پس‌زمینه (Worker Outage)
- **علائم:** افزایش مقدار `queue_depth` در `/api/v1/health/metrics`، معلق ماندن فایل‌ها در وضعیت `queued`.
- **اقدامات:**
  1. بررسی عمق صف Redis:
     ```bash
     docker compose exec redis redis-cli -n 1 llen celery
     ```
  2. بررسی لاگ‌های کانتینر کارگر:
     ```bash
     docker compose logs --tail=100 -f worker
     ```
  3. بازنشانی و مقیاس‌دهی کانتینر کارگر:
     ```bash
     docker compose restart worker
     # یا افزایش تعداد پردازشگرها
     docker compose up -d --scale worker=3
     ```
  4. استعلام سلامت کارگرها از طریق ابزار بازرسی Celery:
     ```bash
     docker compose exec worker celery -A app.core.celery_app inspect active
     ```

---

### ران‌بوک P1-03: پر شدن استخر اتصالات پایگاه داده (Connection Pool Exhaustion)
- **علائم:** کندی شدید API و دریافت خطای `TimeoutError: QueuePool limit of size 20 overflow 10 reached`.
- **اقدامات:**
  1. بررسی اتصالات فعال پایگاه داده:
     ```bash
     docker compose exec postgres psql -U didban_admin -d didban_mali -c \
       "SELECT pid, client_addr, state, wait_event_type, query FROM pg_stat_activity WHERE datname = 'didban_mali';"
     ```
  2. متوقف ساختن کوئری‌های معلق یا طولانی‌تر از ۶۰ ثانیه:
     ```bash
     docker compose exec postgres psql -U didban_admin -d didban_mali -c \
       "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'didban_mali' AND state = 'active' AND now() - query_start > interval '60 seconds';"
     ```
  3. بررسی تنظیمات استخر در `apps/api/app/core/database.py` (مقادیر مصوب: `pool_size=20`, `max_overflow=10`, `pool_recycle=1800`, `pool_pre_ping=True`).

---

### ران‌بوک P1-04: بازیابی اضطراری از نسخه پشتیبان (Disaster Recovery & Restore)
- **سناریو:** تخریب دیسک یا پاک شدن داده‌های مالی.
- **مراحل اجرا:**
  1. یافتن آخرین نسخه پشتیبان تایید شده:
     ```bash
     ls -lt /tmp/didban_backups/*.dump.gz
     ```
  2. اجرای اسکریپت بازگردانی با تایید رسمی:
     ```bash
     ./scripts/restore_database.sh /tmp/didban_backups/<BACKUP_FILE>.dump.gz --confirm
     ```
  3. راه‌اندازی مجدد سرویس API و Worker جهت اتصال مجدد استخر:
     ```bash
     docker compose restart api worker
     ```
  4. اعتبارسنجی سلامت کامل با تست پایشگر:
     ```bash
     curl -s http://localhost:8000/api/v1/health/ready
     RUN_INTEGRATION_TESTS=1 .venv/bin/pytest apps/api/tests/test_tenant_isolation.py
     ```

---

## ۳. ران‌بوک‌های وضعیت عمده (P2 Runbooks)

### ران‌بوک P2-01: خطای آنتی‌ویروس ClamAV
- **علائم:** رد شدن بارگذاری فایل‌ها با خطای `CLAMD_UNAVAILABLE`.
- **اقدامات:**
  1. بررسی سلامت کانتینر ClamAV:
     ```bash
     docker compose ps clamav
     docker compose logs --tail=50 clamav
     ```
  2. ارسال دستور پینگ به دیمن clamd:
     ```bash
     docker compose exec clamav clamdscan --version
     ```
  3. در صورت نیاز به راه‌اندازی مجدد:
     ```bash
     docker compose restart clamav
     ```

---

### ران‌بوک P2-02: فعال شدن محدودکننده نرخ درخواست (Rate Limiting)
- **علائم:** دریافت پاسخ HTTP 429 توسط کلاینت‌ها.
- **اقدامات:**
  1. بررسی لاگ‌های ریت‌لیمیت: کلاینت از طریق هدرهای `X-RateLimit-Limit` و `Retry-After` زمان آزادسازی را دریافت می‌کند.
  2. در صورت حملات DoS روی مسیرهای احراز هویت، کلیدهای موقت در ردیس قابل بررسی هستند:
     ```bash
     docker compose exec redis redis-cli keys "rate_limit:*"
     ```

---

## ۴. چک‌لیست پایش مستمر روزانه (Daily Ops Checklist)

- [ ] بررسی وضعیت `/api/v1/health/ready` و `/api/v1/health/metrics`
- [ ] اجرای موفق نسخه پشتیبان خودکار شبانه با تولید فایل `.sha256`
- [ ] بررسی عدم وجود صف معلق (`queue_depth == 0`)
- [ ] مانیتورینگ فضای دیسک داکر (`docker system df`)
- [ ] اطمینان از اعمال اصل حداقل دسترسی (`didban_app` فاقد دسترسی UPDATE روی جداول داده خام و حسابرسی)
