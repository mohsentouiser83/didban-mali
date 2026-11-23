import { expect, test } from "vitest";
import { prepareChequeImport } from "./cheque-import";

const headers = ["شماره چک", "نوع چک", "نام بانک", "شماره حساب", "طرف‌حساب", "مبلغ", "واحد", "تاریخ صدور", "سررسید"];
const valid = ["۰۰۱۲", "دریافتی", "بانک تست", "۱۲۳", "مشتری تست", "۱٬۲۵۰", "تومان", "۲۰۲۶-۱۱-۲۰", "۲۰۲۶-۱۲-۰۱"];

function prepare(rows: string[][], columns = headers) {
  return prepareChequeImport({ headers: columns, rows, totalRows: rows.length }, { id: "test-period", start: "2026-01-01", end: "2026-12-31" });
}

test("preserves explicit cheque direction, source unit and actual dates", () => {
  expect(prepare([valid])).toEqual({
    rows: [{
      period_id: "test-period", direction: "received", number: "0012",
      bank_name: "بانک تست", bank_account: "123", party_id: "مشتری تست",
      amount: "1250", unit: "TOMAN", issue_date: "2026-11-20", due_date: "2026-12-01",
    }],
  });
});

test.each([
  [1, "", "جهت دریافتنی یا صادره"],
  [6, "", "واحد ریال یا تومان"],
  [7, "", "تاریخ صدور و سررسید"],
  [8, "", "تاریخ صدور و سررسید"],
  [8, "2026-02-31", "تاریخ صدور و سررسید"],
  [5, "12,34", "مبلغ مثبت معتبر"],
])("preflights the entire input before accepting records when field %i is invalid", (field, value, message) => {
  const invalid = [...valid];
  invalid[field] = value;
  expect(prepare([valid, invalid])).toEqual({ error: expect.stringContaining(message) });
});

test("rejects a row unit that conflicts with the explicit amount column unit", () => {
  const explicit = [...headers];
  explicit[5] = "مبلغ ریال";
  expect(prepare([valid], explicit)).toEqual({ error: expect.stringContaining("عنوان ستون") });
});


test("preflights the issue date against the selected period", () => {
  const wrongPeriod = [...valid];
  wrongPeriod[7] = "2025-11-20";
  expect(prepare([valid, wrongPeriod])).toEqual({ error: expect.stringContaining("دورهٔ مالی انتخاب‌شده نیست") });
});

test("uses the explicitly labeled amount unit when there is no separate unit column", () => {
  const explicit = [...headers];
  explicit[5] = "مبلغ تومان";
  explicit.splice(6, 1);
  const row = [...valid];
  row.splice(6, 1);
  expect(prepare([row], explicit)).toEqual({ rows: [expect.objectContaining({ unit: "TOMAN" })] });
});


test("rejects duplicated cheque identities before any registration", () => {
  expect(prepare([valid, valid])).toEqual({ error: expect.stringContaining("تکراری") });
});
