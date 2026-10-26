# زیرساخت اجرایی

`compose.yaml` پایگاه PostgreSQL 18.6 خصوصی، کار migration، API محدود و وب Next.js غیر root را اجرا می‌کند. imageها با digest قفل‌اند؛ API و وب فایل‌سیستم فقط‌خواندنی دارند. وب فقط نشانی داخلی API را دریافت می‌کند؛ هیچ رمز DB/مدیریت به آن داده نمی‌شود.

`Dockerfile.api` از قفل Python و `Dockerfile.web` از npm lock و خروجی standalone استفاده می‌کنند. برای اجرای کامل `up --build -d web` و راهنمای `docs/web-runtime.fa.md` را ببینید. پورت‌ها فقط loopback هستند. TLS، صف، object storage و استقرار سازمانی هنوز انجام نشده‌اند.

`make test-compose-web` هفت بررسی نصب پاک و HTTP هم‌مبدأ را اجرا و پروژه تصادفی خودش را پاک می‌کند. `make test-compose` آزمون مستقل API قبلی است. گزارش‌ها دامنه و نسخه DB را ثبت می‌کنند؛ قبولی HTTP به معنی آزمون مرورگر نیست.

## افزوده مرحله آماده‌سازی — ۲۰۲۶/۱۰/۲۵

Compose اکنون storage خصوصی، initializer volume، ClamAV و worker جدا را نیز اجرا می‌کند. updater امضا با profile signature-updates فعال می‌شود؛ امضای همراه image را روزآمد فرض نکنید. پنج secret با init-env ساخته می‌شوند. جزئیات در `docs/intake-runtime.fa.md` است.
