> آرشیو پیش از بازبینی ۲۰۲۶/۱۱/۱۳؛ برای حفظ سابقه نگه‌داری شده و قرارداد، قابلیت یا پذیرش جاری نیست. مرجع معتبر [وضعیت جاری](../../current-implementation.fa.md) است. ادعاهای داخل این متن، شاهد تازه اجرا یا مشتری واقعی نیستند.

# دیدبان مالی — ساخت تازه

این مخزن از ۱ نوامبر ۲۰۲۶ با دستور کاربر از نو پیاده می‌شود. کد و تنظیمات نسخه قبلی، شامل تغییرات ثبت‌نشده، در پوشهٔ پشتیبان کنار مخزن حفظ شده‌اند؛ مسیر دقیق در [`docs/replacement-backup.json`](../../replacement-backup.json) ثبت است. داده و کاربران نسخه قبلی وارد ساخت تازه نمی‌شوند.

مرجع محصول [`docs/rebuild-spec.fa.md`](../../rebuild-spec.fa.md)، قرارداد مالی [`docs/rebuild-financial-contract.fa.md`](../../rebuild-financial-contract.fa.md) و مرجع بصری [`design.md`](../../../design.md) هستند. تصمیم تازهٔ جایگزینی در همین پوشه، مقصد قدیمی D07 را تغییر داده است. گزارش‌های فازهای نسخه قدیمی، وضعیت ساخت تازه را اثبات نمی‌کنند.

دامنهٔ تازهٔ مصوب در [تصمیم‌های حسابداری و قابلیت‌های پیشرفته](../../advanced-capabilities-decisions.fa.md) ثبت است: تصمیم‌های D10–D20 و هر ۲۸ پیشنهاد تأییدشده. این سند بر محدودیت‌های دامنه‌ای قدیمی متعارض مقدم است؛ اجرای فعلی و شواهد آزمون در [وضعیت پیاده‌سازی](../../current-implementation.fa.md) جدا گزارش می‌شوند.

آخرین وضعیت: [ممیزی ۱۵ قابلیت](../../advanced-capabilities-audit.fa.md) و [موج پنجم](../../expansion-v5-implementation.fa.md)، با اتصال قابلیت‌ها به دفتر بومی و فاکتورهای خدماتی، پیش‌بینی و گزارش‌های ثابت. نتایج آزمون و حدود باقی‌مانده در همین دو سند ثبت‌اند؛ اتصال زنده و پذیرش تولیدی مستقل‌اند.

## اجرای توسعه

نیازمندی‌ها: Python 3.12 و Node.js 22 با pnpm 12.16.1.

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r apps/api/requirements.txt
pnpm install --frozen-lockfile
cp .env.example .env
.venv/bin/python scripts/bootstrap.py --email admin@example.local --name 'مدیر نصب' --admin --company 'شرکت من'
```

رمز در ترمینال و بدون نمایش دریافت می‌شود. مالک شرکت به‌طور ضمنی مجوز تأیید گزارش ندارد. حساب‌ها از داخل نصب ساخته می‌شوند؛ ثبت‌نام عمومی وجود ندارد.

در دو ترمینال جدا (worker توسعه در فرآیند API اجرا می‌شود):

```sh
pnpm dev:api
pnpm dev:web
```

در توسعه، worker همراه API اجرا می‌شود؛ در Compose سرویس worker جداست. کانتینرهای قدیمی `didban-mali-*` متعلق به نسخهٔ پیشین‌اند؛ اجرای دوبارهٔ آن‌ها با کد فعلی پشتیبانی نمی‌شود و API قدیمی پورت ۸۰۰۰ را اشغال می‌کند. سرویس‌های Compose فعلی با نام `didban-fresh` ساخته می‌شوند؛ داده و volumeهای قدیمی را حذف نکنید.

رابط توسعه در [127.0.0.1:3000](http://127.0.0.1:3000) و API در [127.0.0.1:8000](http://127.0.0.1:8000) اجرا می‌شوند. پیش از اجرا، سرویس قدیمی اشغال‌کنندهٔ پورت ۸۰۰۰ را متوقف کنید؛ پایگاه و فضای ذخیره‌سازی ساخت تازه مستقل می‌مانند. SQLite فقط برای توسعه است. در حالت توسعه بدون تنظیم اسکنر، فایل با وضعیت `development_unscanned` ثبت می‌شود؛ این حالت برای نصب عملیاتی مناسب نیست.

## اجرای محلی با Docker Compose

در `.env`، مقدارهای `DIDBAN_PRODUCTION=false` و `DIDBAN_WEB_ORIGIN=http://127.0.0.1:3000` را قرار دهید و دو رمز مستقل URL-safe برای `DIDBAN_POSTGRES_ADMIN_PASSWORD` و `DIDBAN_APP_DB_PASSWORD` تنظیم کنید. نمونهٔ تنظیمات در `.env.example` است. پیش از تغییر از اجرای مستقیم به Docker، فرآیندهای محلی وب/API روی پورت‌های ۳۰۰۰ و ۸۰۰۰ را متوقف کنید.

```sh
docker compose config --quiet
docker compose up --build -d
docker compose ps
```

وب در [127.0.0.1:3000](http://127.0.0.1:3000) باز می‌شود. در Docker Desktop، گروه `didban-fresh` شامل PostgreSQL، scanner، API، worker و web است. worker فقط در سرویس جدا اجرا می‌شود. این نصب پایگاه و فایل‌های مستقل دارد؛ کاربران و دادهٔ SQLite توسعه به‌طور خودکار منتقل نمی‌شوند. برای ساخت اولین حساب:

```sh
docker compose exec api python scripts/bootstrap.py --email admin@example.local --name 'مدیر نصب' --admin --company 'شرکت من'
```

رمز حساب در ترمینال دریافت می‌شود. برای توقف بدون حذف داده‌ها، `docker compose stop` و برای مشاهدهٔ خطاها، `docker compose logs --tail=100 api worker web` را اجرا کنید. گروه قدیمی `didban-mali` را برای این نسخه اجرا نکنید.

## نصب خصوصی عملیاتی با Docker Compose

مقدار `DIDBAN_PRODUCTION=true` را صریحاً تنظیم کنید. دو رمز مستقل تصادفی در `.env` برای `DIDBAN_POSTGRES_ADMIN_PASSWORD` و `DIDBAN_APP_DB_PASSWORD` تنظیم کنید؛ برای رمز متصل به URL از کاراکترهای URL-safe استفاده کنید. مقدار `DIDBAN_WEB_ORIGIN` را به دامنه HTTPS نصب، مانند `https://finance.example.org` تغییر دهید و reverse proxy دارای TLS را به وب روی پورت ۳۰۰۰ متصل کنید. نشست نصب عملیاتی کوکی Secure دارد؛ ورود آن از HTTP محلی پشتیبانی نمی‌شود. سپس:

```sh
docker compose config --quiet
docker compose up --build -d
docker compose exec api python scripts/bootstrap.py --email admin@example.local --name 'مدیر نصب' --admin --company 'شرکت من'
```

نام Compose برابر `didban-fresh` و volumeها مستقل‌اند. دستورهای این نصب، سرویس‌ها و volumeهای نسخه قدیمی را حذف نمی‌کنند. PostgreSQL، اسکنر، API، worker و وب اجرا می‌شوند. DB با نقش `didban_app` بدون superuser/BYPASSRLS استفاده می‌شود. فقط پورت‌های loopback میزبان منتشر شده‌اند. شروع حالت production با origin غیر HTTPS رد می‌شود.

در Compose، وب با آدرس داخلی `http://api:8000` build می‌شود. برای استقرار جداگانه وب، `DIDBAN_API_URL` باید در مرحله build صحیح باشد.

برای بازنشانی رمز حساب مدیریت‌شده:

```sh
.venv/bin/python scripts/reset_password.py --actor admin@example.local --email user@example.local
```

این فرمان رمز مدیر نصب را می‌خواهد، نشست‌های قبلی کاربر را باطل و رویداد ممیزی نصب ثبت می‌کند.

## کنترل کیفیت و قرارداد

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
PYTHONPATH=apps/api .venv/bin/python -m pytest apps/api/tests
PYTHONPATH=apps/api .venv/bin/python -m ruff check apps/api scripts
```

OpenAPI اجرای فعلی در `/openapi.json` ارائه می‌شود. snapshot قابل بررسی با فرمان `.venv/bin/python scripts/generate_contracts.py` از source به `contracts/openapi.json` و `database/schema.sql` تولید می‌شود. نسخه schema در DB کنترل می‌شود؛ ارتقای آینده نیازمند migration صریح نسخه‌دار است و `create_all` جای migration نیست. بخش‌های تکمیل‌نشده و نتیجه واقعی آزمون‌ها در [`docs/current-implementation.fa.md`](../../current-implementation.fa.md) ثبت می‌شوند. وجود صفحه یا قرارداد به معنی تأیید حسابدار، اتصال Luna یا آمادگی انتشار نیست.

هنگام راه‌اندازی، وجود ستون‌های مدل و کلیدهای یکتای `(company_id, id)` نیز کنترل می‌شود. پایگاه قدیمی با پیام `Database schema is outdated` و نام موارد مفقود متوقف می‌شود تا به‌جای خطاهای پراکندهٔ API، نیاز به ارتقای صریح ساختار روشن باشد؛ این کنترل داده یا ساختار جدول‌های موجود را مهاجرت نمی‌دهد.

## مدل و هزینه

ارائه‌دهنده و مدل جاری در [سند اتصال مدل](../../model-gateway.fa.md) ثبت‌اند؛ تنظیم فعلی کد AvalAI و `gpt-5.6-luna` است. پیش‌فرض کد غیرفعال است و تنظیم محلی سرور می‌تواند آن را فعال کند. کلید فقط در محیط سرور با `DIDBAN_OPENAI_API_KEY` قرار می‌گیرد؛ API یا فرم مرورگر آن را دریافت یا بازنمی‌گرداند. در حالت دارای سقف، فعال‌سازی با `DIDBAN_MODEL_ENABLED=true` به‌تنهایی کافی نیست: بودجه نصب، بودجه شرکت و تعرفه نسخه‌دار USD باید صریحاً تنظیم شوند. حالت بدون سقف فقط با تنظیم صریح سرور فعال می‌شود و دفتر مصرف/هزینه همچنان حفظ می‌شود. تفسیر مدل فقط بعد از کنترل مستقل همه ردیف‌ها می‌تواند نگاشت خودکار بسازد؛ واحد و تقویم از گفته مدل فرض نمی‌شوند. جزئیات قیود، endpointهای مدیریت و وضعیت آزمون در [`docs/model-gateway.fa.md`](../../model-gateway.fa.md) ثبت است. هیچ اتصال زنده یا تأیید کیفیت عمومی مدل با آزمون ساختگی اثبات نشده است.

## پشتیبان و بازیابی

```sh
.venv/bin/python scripts/backup.py --mode sqlite --output /path/outside/repo/didban-backup
.venv/bin/python scripts/backup.py --mode compose --output /path/outside/repo/didban-backup
```

حالت SQLite قفل نوشتن را هنگام snapshot پایگاه و اصل فایل‌ها نگه می‌دارد. حالت Compose، API و worker فعال را موقتاً متوقف و پس از تهیهٔ dump و آرشیو اصل فایل‌ها دوباره اجرا می‌کند. فایل تنظیمات، در صورت وجود، با دسترسی محدود حفظ می‌شود؛ پشتیبان حاوی اسرار است و باید خارج از دیسک اصلی با دسترسی محدود نگهداری شود. فایل `manifest.json` هش و اندازه خروجی‌ها را ثبت می‌کند. پاک‌سازی یا retention خودکار وجود ندارد.

بازیابی را ابتدا در نصب ایزوله با همان نسخه برنامه انجام دهید: صحت هش‌ها، DB، اصل فایل‌ها، تنظیمات، membershipها و گزارش‌های ثابت را کنترل کنید. SQLite را فقط با سرویس‌های متوقف جایگزین کنید. در PostgreSQL نقش‌ها و schema با همان نسخه برنامه آماده و dump با نقش مدیریت بازیابی شود؛ سپس مالکیت جدول‌ها و نقش محدود برنامه و RLS دوباره کنترل شوند. موفقیت تهیهٔ پشتیبان، موفقیت بازیابی را اثبات نمی‌کند.

## بررسی تم رابط

صفحات ساخت تازه با تم مصوب `didban-luminous` و اجزای مشترک هماهنگ‌اند. [گزارش بررسی رابط](../../ui-theme-review.fa.md) شامل مسیرهای کنترل‌شده در مرورگر داخلی، تصاویر دسکتاپ/موبایل، آزمون زنده کاهش حرکت و محدودیت‌های نتیجه است.
