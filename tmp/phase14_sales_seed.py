from pathlib import Path

from playwright.sync_api import sync_playwright


company_id = "01a09a02-b689-7179-9c05-fd4ce398ccef"
sales_file = Path("demo-data/sales_1405.xlsx").resolve()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    page.goto("http://localhost:3000/login", wait_until="networkidle")
    page.locator('input[name="email"]').fill("admin")
    page.locator('input[name="password"]').fill("admin")
    page.get_by_role("button", name="ورود به دیدبان").click()
    page.wait_for_url(lambda url: "/companies/" in url, timeout=15_000)
    page.goto(f"http://localhost:3000/companies/{company_id}/imports", wait_until="networkidle")
    page.locator('input[type="file"]').set_input_files(sales_file)
    page.locator('select[name="source_kind"]').select_option("sales")
    page.locator('input[name="source_label"]').fill("فروش شش‌ماهه سناریوی دمو")
    page.get_by_role("button", name="بارگذاری امن").click()
    row = page.locator(".import-row", has_text="sales_1405.xlsx")
    row.get_by_role("link", name="آماده‌سازی").wait_for(timeout=30_000)
    row.get_by_role("link", name="آماده‌سازی").click()
    page.wait_for_url(lambda url: "/imports/" in url, timeout=10_000)
    page.wait_for_load_state("networkidle")
    page.get_by_role("button", name="تأیید نگاشت").click()
    page.get_by_role("button", name="شروع اعتبارسنجی").wait_for(timeout=10_000)
    page.get_by_role("button", name="شروع اعتبارسنجی").click()
    page.get_by_role("button", name="ثبت نهایی و نرمال‌سازی").wait_for(timeout=20_000)
    page.get_by_role("button", name="ثبت نهایی و نرمال‌سازی").click()
    page.get_by_text("در صف پردازش").wait_for(timeout=10_000)
    page.goto(f"http://localhost:3000/companies/{company_id}/imports", wait_until="networkidle")
    row = page.locator(".import-row", has_text="sales_1405.xlsx")
    row.get_by_text("تکمیل‌شده").wait_for(timeout=30_000)
    print("SALES_IMPORT", "completed")
    browser.close()
