import { formatMoney } from "@/features/results/presentation";
import { formatDate, persianDigits } from "@/lib/dates";
import { workFields, specialTaxKinds } from "./payroll-fields-data";
import type { ImportPreview, Contract } from "./types";
const labels: Record<string, string> = {
  ...workFields,
  personnel_code: "کد پرسنلی",
  employee_name: "نام کارمند",
  name: "نام",
  national_id: "کد ملی",
  insurance_number: "شماره بیمه",
  iban: "شبا",
  department: "واحد",
  position: "سمت",
  hired_on: "استخدام",
  ended_on: "پایان همکاری",
  opening_as_of: "تاریخ مانده شروع",
  opening_source: "مرجع مانده شروع",
  opening_leave_days: "مرخصی شروع — روز",
  opening_loan: "وام شروع",
  opening_advance: "مساعده شروع",
  opening_unpaid_wages: "حقوق پرداخت‌نشده شروع",
  unit: "واحد پول",
  employee_id: "شناسه کارمند",
  period_start: "از تاریخ",
  period_end: "تا تاریخ",
  tax_history_complete: "کامل بودن سابقه مالیات",
  unpaid_wages_already_processed: "حقوق پرداخت‌نشده قبلاً محاسبه شده",
  unpaid_wages_reference: "مرجع حقوق پرداخت‌نشده",
  prior_paid_reference: "مرجع پرداخت قبلی",
  correction_reference: "مرجع اصلاح",
  shift_code: "نوبت‌کاری",
  leave_opening_days: "مرخصی شروع — روز",
};
const money = new Set([
  "opening_loan",
  "opening_advance",
  "opening_unpaid_wages",
  "deductions",
  "loan_installment",
  "advance_offset",
  "prior_paid_special",
  "unpaid_wages",
  "arrears_amount",
  "prior_taxable",
  "prior_tax_paid",
]);
for (const [kind, label] of Object.entries(specialTaxKinds)) {
  money.add(kind + "_prior_taxable");
  money.add(kind + "_prior_tax_paid");
  labels[kind + "_tax_history_complete"] = `کامل بودن سابقه مالیاتی ${label}`;
}
const codes: Record<string, string> = {
  invalid_amount: "مقدار عددی نامعتبر است.",
  employee_name_required: "نام لازم است.",
  employment_date_required: "تاریخ استخدام لازم است.",
  invalid_date: "تاریخ نامعتبر است.",
  invalid_national_id: "کد ملی ده‌رقمی لازم است.",
  unsupported_payroll_unit: "فقط ریال یا تومان پذیرفته می‌شود.",
  opening_money_unit_required: "واحد مانده شروع را وارد کنید.",
  work_money_unit_required: "واحد مبلغ کارکرد را وارد کنید.",
  duplicate_or_missing_personnel_code: "کد پرسنلی خالی یا تکراری است.",
  duplicate_or_missing_work_identity: "کارمند و بازه خالی یا تکراری است.",
  invalid_employee_id: "شناسه کارمند نامعتبر است.",
  identifier_must_be_text: "شناسه باید سلول متنی باشد.",
  boolean_true_false_required: "مقدار true یا false لازم است.",
  invalid_work_days: "روز مزد نباید از روزهای بازه بیشتر باشد.",
  opening_balance_source_required: "تاریخ و مرجع مانده شروع لازم است.",
  invalid_employment_dates: "پایان همکاری پیش از استخدام است.",
  invalid_tax_months: "ماه مالیاتی باید عدد صحیح صفر تا دوازده باشد.",
  invalid_work_period: "پایان بازه پیش از شروع است.",
  employee_id_not_found: "شناسه کارمند در این شرکت پیدا نشد.",
  personnel_code_not_found: "کد پرسنلی در این شرکت پیدا نشد.",
  employee_identity_required: "کد پرسنلی یا شناسه کارمند لازم است.",
  employee_identity_mismatch: "کد پرسنلی با شناسه کارمند یکسان نیست.",
};
function display(key: string, raw: unknown): string {
  if (raw === undefined || raw === null || raw === "") return "—";
  if (typeof raw === "boolean") return raw ? "بله" : "خیر";
  const text = String(raw);
  if (money.has(key))
    return /^-?\d+(\.\d+)?$/.test(text) ? formatMoney(text, "IRR") : text;
  if (
    [
      "hired_on",
      "ended_on",
      "opening_as_of",
      "period_start",
      "period_end",
    ].includes(key)
  ) {
    const parsed = new Date(`${text}T12:00:00Z`);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) &&
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === text
      ? formatDate(text)
      : text;
  }
  if (key === "unit")
    return text === "IRR" ? "ریال" : text === "IRT" ? "تومان" : text;
  if (key in workFields || key === "opening_leave_days")
    return persianDigits(text);
  return text;
}
export type ImportCell = {
  id: string;
  row: string;
  field: string;
  original: string;
  unit: string;
  normalized: string;
  error?: string;
};
export const IMPORT_PAGE_SIZE = 20;
export function importPage(preview: ImportPreview, page: number): ImportCell[] {
  return preview.content.preview_rows
    .slice(page * IMPORT_PAGE_SIZE, (page + 1) * IMPORT_PAGE_SIZE)
    .flatMap((row) => {
      const normalized = row.normalized
        ? {
            ...row.normalized,
            ...((row.normalized.profile as Record<string, unknown>) ?? {}),
            ...((row.normalized.content as Record<string, unknown>) ?? {}),
          }
        : {};
      const error = preview.content.errors.find((e) => e.row === row.row);
      const columns = { ...row.original };
      if (preview.content.kind === "work")
        for (const key of ["personnel_code", "employee_name"])
          if (!(key in columns) && normalized[key] !== undefined)
            columns[key] = "";
      if (error && error.column !== "*")
        for (const column of error.column.split(" / "))
          if (!(column in columns)) columns[column] = "";
      return Object.entries(columns).map(([key, value]) => ({
        id: `${row.row}-${key}`,
        row: persianDigits(String(row.row)),
        field: labels[key] ?? key,
        original: display(key, value),
        unit: money.has(key) ? display("unit", row.original.unit) : "—",
        normalized:
          display(key, normalized[key]) +
          (money.has(key) && normalized[key] !== undefined ? " ریال" : ""),
        error:
          error &&
          (error.column === "*" || error.column.split(" / ").includes(key))
            ? (codes[error.code] ?? "اطلاعات این ستون معتبر یا کامل نیست.")
            : undefined,
      }));
    });
}
export function sampleContractOptions(
  contracts: Contract[],
  names: Record<string, string>,
) {
  return contracts.map((c) => ({
    value: c.id,
    label: `${names[c.employee_id] ?? "کارمند"} · ${formatDate(c.effective_from)} تا ${c.effective_to ? formatDate(c.effective_to) : "بدون پایان"} · ${formatMoney(String(c.content.base_amount), "IRR")} ریال`,
  }));
}
