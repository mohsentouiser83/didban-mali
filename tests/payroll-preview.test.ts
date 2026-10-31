import test from "node:test";
import assert from "node:assert/strict";
import {
  importPage,
  sampleContractOptions,
} from "../apps/web/features/payroll/payroll-import-values";
import { workTemplate } from "../apps/web/features/payroll/payroll-template-values";
import type { ImportPreview } from "../apps/web/features/payroll/types";
import { createBody } from "../apps/web/features/payroll/payroll-form-values";
import taxTable1405 from "../contracts/payroll/iran-1405-tax.json";

test("official tax table submits post-exemption bands and preserves other source references", () => {
  const form = new FormData();
  form.set("tax_exemption_monthly", taxTable1405.monthly_exemption);
  form.set(
    "source_urls",
    "https://tamin.ir/News/Item/197732\n" + taxTable1405.source.url,
  );
  form.set("tax_table_source_url", taxTable1405.source.url);
  form.set("tax_mode", "cumulative");
  form.set("employee_insurance_rate", "0.123");
  taxTable1405.monthly_bands_after_exemption.forEach((band, i) => {
    form.set(`band_upper_${i}`, band.up_to ?? "");
    form.set(`band_rate_${i}`, band.rate);
  });
  const result = createBody("rules", form) as {
    content: Record<string, unknown>;
  };
  assert.deepEqual(
    result.content.tax_bands,
    taxTable1405.monthly_bands_after_exemption,
  );
  assert.equal(result.content.tax_exemption_monthly, "400000000");
  assert.equal(result.content.tax_mode, "cumulative");
  assert.equal(result.content.employee_insurance_rate, "0.123");
  assert.deepEqual(result.content.source_urls, [
    "https://tamin.ir/News/Item/197732",
    taxTable1405.source.url,
  ]);
});
const preview: ImportPreview = {
  id: "private",
  content: {
    kind: "employees",
    row_count: 2,
    rows: [],
    errors: [{ row: 3, column: "name", code: "employee_name_required" }],
    preview_rows: [
      {
        row: 2,
        original: {
          personnel_code: "0001",
          opening_loan: "9007199254740993.123456",
          unit: "IRT",
        },
        normalized: {
          personnel_code: "0001",
          profile: { opening_loan: "90071992547409931.23456" },
        },
      },
      { row: 3, original: { personnel_code: "0002" }, normalized: null },
    ],
  },
};
test("payroll preview preserves original toman amount and exact canonical rial without a second conversion", () => {
  const cells = importPage(preview, 0);
  assert.equal(cells[0].original, "0001");
  assert.equal(cells[1].original, "۹,۰۰۷,۱۹۹,۲۵۴,۷۴۰,۹۹۳٫۱۲۳۴۵۶");
  assert.equal(cells[1].normalized, "۹۰,۰۷۱,۹۹۲,۵۴۷,۴۰۹,۹۳۱٫۲۳۴۵۶ ریال");
  assert.equal(cells[1].unit, "تومان");
  const missing = cells.find((c) => c.row === "۳" && c.field === "نام");
  assert.equal(missing?.error, "نام لازم است.");
  assert.equal(missing?.normalized, "—");
});
test("payroll preview pagination includes the final uploaded row and never duplicates pages", () => {
  const rows = Array.from({ length: 41 }, (_, i) => ({
    row: i + 2,
    original: { personnel_code: String(i) },
    normalized: { personnel_code: String(i) },
  }));
  const p = {
    ...preview,
    content: {
      ...preview.content,
      row_count: 41,
      errors: [],
      preview_rows: rows,
    },
  };
  assert.equal(importPage(p, 0).length, 20);
  assert.equal(importPage(p, 1).length, 20);
  assert.equal(importPage(p, 2).length, 1);
  assert.equal(importPage(p, 2)[0].original, "40");
});
test("sample contract labels expose employee, validity and exact base salary", () => {
  const labels = sampleContractOptions(
    [
      {
        id: "opaque",
        employee_id: "e",
        effective_from: "2026-09-01",
        effective_to: null,
        content: { base_amount: "9007199254740993.123456" },
      },
    ],
    { e: "کارمند نمونه" },
  );
  assert.equal(labels[0].value, "opaque");
  assert.match(labels[0].label, /کارمند نمونه/);
  assert.match(labels[0].label, /بدون پایان/);
  assert.match(labels[0].label, /۹,۰۰۷,۱۹۹,۲۵۴,۷۴۰,۹۹۳٫۱۲۳۴۵۶ ریال/);
  assert.doesNotMatch(labels[0].label, /opaque/);
});

test("invalid uploaded dates stay reviewable without crashing or silently rolling forward", () => {
  const invalid = {
    ...preview,
    content: {
      ...preview.content,
      preview_rows: [
        {
          row: 2,
          original: { hired_on: "2026-99-99", ended_on: "2026-02-30" },
          normalized: null,
        },
      ],
    },
  };
  const cells = importPage(invalid, 0);
  assert.equal(cells[0].original, "2026-99-99");
  assert.equal(cells[1].original, "2026-02-30");
});

test("selected work template uses readable exact personnel codes and names with explicit unit", () => {
  const employee = {
    id: "internal-opaque-id",
    personnel_code: "0001",
    profile: { name: 'نام، "نمونه"' },
    version: 1,
  };
  const csv = workTemplate([employee]);
  assert.match(csv, /personnel_code,employee_name,period_start/);
  assert.match(csv, /"0001","نام، ""نمونه"""/);
  assert.match(csv, /"IRR"$/);
  assert.doesNotMatch(csv, /internal-opaque-id/);
  assert.throws(() => workTemplate([]));
  assert.throws(() => workTemplate(Array(1001).fill(employee)));
  assert.equal(
    workTemplate(Array(1000).fill(employee)).split("\r\n").length,
    1001,
  );
});

test("legacy UUID work imports reveal server-resolved employee name and code in review", () => {
  const p: ImportPreview = {
    id: "work",
    content: {
      kind: "work",
      row_count: 1,
      rows: [],
      errors: [],
      preview_rows: [
        {
          row: 2,
          original: { employee_id: "opaque" },
          normalized: {
            employee_id: "opaque",
            personnel_code: "0001",
            employee_name: "نام ثبت‌شده",
          },
        },
      ],
    },
  };
  const cells = importPage(p, 0);
  assert.equal(cells.find((c) => c.field === "کد پرسنلی")?.normalized, "0001");
  assert.equal(
    cells.find((c) => c.field === "نام کارمند")?.normalized,
    "نام ثبت‌شده",
  );
});
