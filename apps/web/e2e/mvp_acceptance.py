"""Repeatable browser gate for the Persian MVP demo journey."""

from __future__ import annotations

import os
import re

from playwright.sync_api import Page, expect, sync_playwright

BASE_URL = os.getenv("E2E_BASE_URL", "http://localhost:3000")
COMPANY_ID = os.getenv("E2E_COMPANY_ID", "01a09a02-b689-7179-9c05-fd4ce398ccef")


def open_workspace(page: Page, path: str, heading: str) -> None:
    page.goto(f"{BASE_URL}/companies/{COMPANY_ID}/{path}", wait_until="networkidle")
    expect(page.get_by_role("heading", name=heading, exact=True)).to_be_visible()
    assert page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")


def main() -> None:
    console_errors: list[str] = []
    page_errors: list[str] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(locale="fa-IR", viewport={"width": 1440, "height": 1000})
        page = context.new_page()
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        page.on("pageerror", lambda error: page_errors.append(str(error)))

        page.goto(f"{BASE_URL}/login", wait_until="networkidle")
        page.get_by_label("ایمیل یا نام کاربری").fill("admin")
        page.get_by_label("رمز عبور").fill("admin")
        page.get_by_role("button", name="ورود به دیدبان").click()
        expect(page).to_have_url(re.compile(r"/companies/.+/overview$"), timeout=15_000)

        routes = [
            ("overview", "داشبورد مالی"),
            ("imports", "ورود داده‌های مالی"),
            ("financial-model", "مدل مالی"),
            ("analysis", "تحلیل مالی"),
            ("reconciliation", "تطبیق حساب‌ها"),
            ("findings", "یافته‌ها"),
            ("reports", "گزارش‌های مالی"),
            ("assistant", "دستیار کنترل‌شده"),
            ("readiness", "آمادگی و پذیرش"),
        ]
        for path, heading in routes:
            open_workspace(page, path, heading)

        expect(page.get_by_text("مسیر دمو از ابتدا تا گزارش آماده است")).to_be_visible()
        expect(page.get_by_text("۱۵/۱۵")).to_be_visible()
        expect(page.get_by_text("زیرساخت پاسخ‌گو است")).to_be_visible()
        for label in ("حسابداری", "بانک", "فروش"):
            expect(page.get_by_text(label, exact=True).first).to_be_visible()
        expect(page.get_by_text("admin / admin", exact=True)).to_be_visible()

        page.get_by_role("button", name="فعال‌کردن تم تاریک").click()
        expect(page.locator("html")).to_have_class(re.compile(r"\bdark\b"))
        page.reload(wait_until="networkidle")
        expect(page.get_by_text("۱۵/۱۵")).to_be_visible()

        page.set_viewport_size({"width": 390, "height": 844})
        page.reload(wait_until="networkidle")
        expect(page.get_by_text("مسیر دمو از ابتدا تا گزارش آماده است")).to_be_visible()
        assert page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")

        browser.close()

    ignored = ("favicon",)
    critical_console_errors = [item for item in console_errors if not any(token in item.lower() for token in ignored)]
    assert not page_errors, f"Page errors: {page_errors}"
    assert not critical_console_errors, f"Console errors: {critical_console_errors}"
    print("MVP browser acceptance passed: 9 routes, light/dark persistence, mobile layout, 0 critical errors")


if __name__ == "__main__":
    main()
