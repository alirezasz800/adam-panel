# Adam Panel — Phase 1

پنل مدیریتی ماژولار آدام برای Cloudflare Workers + D1.

## قابلیت‌های همین نسخه
- ورود مدیر با Secret به نام `ADMIN_PASSWORD`
- نشست امن با کوکی HttpOnly / Secure / SameSite=Strict
- محدودسازی تلاش ورود
- مدیریت حداکثر ۵ کاربر (افزودن، فعال/غیرفعال، حذف)
- ذخیره اطلاعات در D1 با binding به نام `DB`
- ثبت رویدادهای مدیریتی در `audit_logs`
- API بدون CORS عمومی و با کنترل نشست

## محدودیت مهم
این نسخه **فقط پنل مدیریت کاربران** است. در این نسخه تونل VPN، ورودی TCP عمومی، اتصال VLESS واقعی، محاسبه واقعی ترافیک و تولید کانفیگ قابل اتصال پیاده‌سازی نشده‌اند. رابط کاربری این موارد را ادعا نمی‌کند. قبل از طراحی data plane باید امکان‌پذیری فنی و شرایط سرویس Cloudflare جداگانه بررسی و در محیط آزمایشی تست شود.

## پیش‌نیاز Cloudflare
- Worker با نام `adam-panel`
- D1 database با نام `adam-db`
- D1 binding با variable name دقیق `DB`
- Secret با نام دقیق `ADMIN_PASSWORD` و حداقل ۱۶ کاراکتر

شناسه D1 در `wrangler.jsonc` از قبل برای دیتابیس فعلی این پروژه وارد شده است.

## استقرار از GitHub
در تنظیمات Worker Builds:
- Repository: `alirezasz800/adam-panel`
- Branch: `main`
- Root directory: `/`
- Build command: خالی (این پروژه مرحله build جداگانه ندارد)
- اگر فیلد Deploy command نمایش داده شد: `npx wrangler deploy`

بعد از اولین deploy، در تنظیمات همان Worker بررسی کن:
1. Settings → Bindings: اتصال D1 با نام `DB` به `adam-db`
2. Settings → Variables and Secrets: Secret به نام `ADMIN_PASSWORD`

**نکته:** Secretهای Worker قبلی لزوماً به Worker جدید یا Worker ساخته‌شده از GitHub منتقل نمی‌شوند. وجود Secret را روی همان Worker نهایی بررسی کن. مقدار رمز را در GitHub یا فایل‌های پروژه قرار نده.

## اجرای migration
Migrationها idempotent هستند و جدول‌ها/ایندکس‌های موجود را دوباره ایجاد نمی‌کنند. پس از اتصال D1 و قبل از استفاده، اجرا کن:

```bash
npm install
npx wrangler d1 migrations apply adam-db --remote
```

اگر migration شماره 0001 قبلاً به‌صورت دستی اجرا شده و Wrangler درباره تاریخچه migrationها اختلاف نشان داد، اجرای اجباری یا حذف جدول انجام نده؛ ابتدا خروجی را بررسی کن.

## تست اولیه
- `GET /health` باید JSON با `ok: true` برگرداند.
- صفحه اصلی باید فرم ورود مدیر را نشان دهد.
- ورود با `ADMIN_PASSWORD` باید موفق شود.
- افزودن کاربر ششم باید با پیام ظرفیت ۵ کاربر رد شود.

## امنیت و نگهداری
- رمز مدیریت را در GitHub commit نکن.
- از رمز قوی و منحصربه‌فرد استفاده کن.
- لاگ‌ها را از نظر خطا بررسی کن و اطلاعات حساس را در پیام‌ها یا URLها قرار نده.
- پیش از استفاده واقعی، تست‌های امنیتی و پشتیبان‌گیری D1 لازم است.
