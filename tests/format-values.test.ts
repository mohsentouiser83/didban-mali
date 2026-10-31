import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCanonical } from "../apps/web/features/interpretation/format-values";
test("canonical financial display preserves all large integer and fractional digits", () => {
  assert.equal(
    formatCanonical("amount", "99999999999999999999999999999991.234560"),
    "۹۹,۹۹۹,۹۹۹,۹۹۹,۹۹۹,۹۹۹,۹۹۹,۹۹۹,۹۹۹,۹۹۹,۹۹۱٫۲۳۴۵۶۰",
  );
});
test("canonical display distinguishes missing money from exact zero", () => {
  assert.equal(formatCanonical("amount", null), "نامعلوم");
  assert.equal(formatCanonical("amount", "0"), "۰");
  assert.equal(
    formatCanonical("amount", "-0.000001"),
    "−۰٫۰۰۰۰۰۱".replace("−", "-"),
  );
});
test("source identifiers keep leading zeroes and dates display in Persian", () => {
  assert.equal(formatCanonical("reference", "000001"), "000001");
  assert.equal(formatCanonical("date", "2026-03-21"), "۱۴۰۵/۰۱/۰۱");
});
test("automatic roles are distinct from explicit source declarations", () => {
  assert.equal(
    formatCanonical("role_provenance", "validated_policy"),
    "تشخیص خودکار کنترل‌شده",
  );
  assert.equal(
    formatCanonical("role_provenance", "explicit_source_field"),
    "فیلد صریح منبع",
  );
  assert.equal(formatCanonical("role_provenance", "unknown"), "نامشخص");
  assert.equal(
    formatCanonical("role_controls_passed", "false"),
    "نیازمند بررسی",
  );
});

test("all trial-balance amount columns are grouped without changing identifiers", () => {
  for (const field of [
    "opening_debit",
    "opening_credit",
    "period_debit",
    "period_credit",
    "closing_debit",
    "closing_credit",
  ]) {
    assert.equal(formatCanonical(field, "1234567.000001"), "۱,۲۳۴,۵۶۷٫۰۰۰۰۰۱");
  }
  assert.equal(formatCanonical("account", "1234567"), "1234567");
});
