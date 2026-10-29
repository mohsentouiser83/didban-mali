import type { Schema } from "@didban/api-client";
import { formatDate } from "@/lib/dates";

/** Localize embedded civil dates for display without changing API values. */
export function financialQuestionText(text: string): string {
  return text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (date) => {
    const parsed = new Date(`${date}T12:00:00Z`);
    if (
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date
    )
      return date;
    return formatDate(date);
  });
}
export const count = (value: number) =>
  new Intl.NumberFormat("fa-IR").format(value);
export function size(bytes: number) {
  return bytes >= 1048576
    ? `${count(Math.round((bytes / 1048576) * 10) / 10)} مگابایت`
    : `${count(Math.ceil(bytes / 1024))} کیلوبایت`;
}
export function sessionLabel(session: Schema<"ProcessingSession">) {
  if (session.status === "completed") return "گزارش آماده";
  if (session.status === "completed_limited")
    return "گزارش با دامنه محدود آماده";
  if (["cancelled", "failed", "waiting_input"].includes(session.status))
    return {
      cancelled: "لغوشده",
      failed: "نیازمند اصلاح فایل",
      waiting_input: "نیازمند پاسخ",
    }[session.status as "cancelled" | "failed" | "waiting_input"];
  if (
    session.input_review_required &&
    !session.input_review_confirmed &&
    session.interpretation_finished_at &&
    !session.financial_finished_at
  )
    return "در انتظار بازبینی شما";
  if (session.report_id) return "در حال آماده‌سازی خروجی‌ها";
  if (session.analysis_finished_at) return "تحلیل حوزه‌های مالی آماده";
  if (session.steps.some((step) => step.kind.startsWith("analysis:")))
    return session.status === "waiting_dependency"
      ? "تحلیل مالی منتظر سرویس"
      : "در حال تحلیل حوزه‌های مالی";
  if (session.financial_finished_at) return "نتایج مالی پایه آماده";
  if (session.steps.some((step) => step.kind.startsWith("financial:")))
    return session.status === "waiting_dependency"
      ? "محاسبات مالی منتظر سرویس"
      : "در حال محاسبات مالی";
  if (session.interpretation_finished_at) return "آماده محاسبات مالی";
  if (
    session.preparation_finished_at &&
    session.steps.some((s) => s.kind.startsWith("interpret:"))
  )
    return session.status === "waiting_dependency"
      ? "منتظر سرویس تفسیر"
      : "در حال تفسیر";
  if (session.preparation_finished_at) return "در انتظار تفسیر";
  return {
    receiving: "در حال دریافت",
    sealed: "در صف آماده‌سازی",
    processing: "در حال آماده‌سازی",
    waiting_input: "نیازمند پاسخ",
    waiting_dependency: "منتظر سرویس",
    completed: "تکمیل‌شده",
    completed_limited: "نتیجه محدود",
    failed: "نیازمند اصلاح فایل",
    cancelled: "لغوشده",
  }[session.status];
}
export const errors: Record<string, string> = {
  untrusted_formula_cache:
    "فایل XLS شامل مقدار فرمولی نامطمئن است؛ خروجی مقادیر ثابت را بارگذاری کنید.",
  source_integrity_mismatch: "محتوای ذخیره‌شده با اصل فایل سازگار نیست.",
  malware_detected: "فایل در بررسی امنیتی رد شد.",
  invalid_workbook: "ساختار Excel معتبر نیست.",
  invalid_csv: "ساختار CSV معتبر نیست.",
  empty_table: "فایل جدول قابل خواندن ندارد.",
  row_limit: "ردیف‌های بسته بیش از سقف مجاز است.",
  expanded_limit: "حجم بازشده فایل بیش از حد مجاز است.",
  column_limit: "تعداد ستون‌ها بیش از حد مجاز است.",
  unsafe_workbook: "محتوای فعال یا پیوند بیرونی مجاز نیست.",
  cell_limit: "اندازه یکی از سلول‌ها بیش از حد مجاز است.",
  invalid_encoding: "کدگذاری انتخاب‌شده با فایل سازگار نیست.",
};
export const dependencies: Record<string, string> = {
  scanner_unavailable: "اسکنر موقتاً در دسترس نیست.",
  storage_unavailable: "فضای فایل موقتاً در دسترس نیست.",
  permission_revoked: "دسترسی ایجادکننده بسته لغو شده است.",
  model_unavailable: "مدل موقتاً در دسترس نیست.",
  budget_exhausted: "سقف هزینه پر شده است.",
  budget_not_configured: "سقف هزینه مدل تنظیم نشده است.",
  queue_unavailable: "صف موقتاً در دسترس نیست.",
};
export function fileLabel(file: Schema<"File">) {
  if (file.status === "excluded_overlap") return "خارج از مجموعه مالی";
  if (file.interpretation_summary)
    return file.interpretation_summary.rejected_rows
      ? "دارای ردیف ردشده"
      : "داده استاندارد آماده";
  if (file.status === "rejected") return "ردشده";
  if (file.preparation_summary) return "ساختار بررسی شد";
  return file.status === "scanning"
    ? "در حال بررسی"
    : file.status === "pending_interpretation"
      ? "منتظر پاسخ"
      : "دریافت شد";
}
export const choiceLabel = (value: string) =>
  ({
    "windows-1256": "فارسی ویندوز (Windows-1256)",
    "windows-1252": "لاتین ویندوز (Windows-1252)",
  })[value] ?? value;

export const financialChoiceLabels: Record<string, string> = {
  declared_complete: "داده تمام دوره را پوشش می‌دهد",
  partial: "داده بخشی از دوره را پوشش می‌دهد",
  unknown: "مشخص نیست",
  recognized: "در دفتر ثبت شده است",
  zero_confirmed: "صفر است؛ تأیید می‌کنم",
  not_required: "برای این فعالیت کاربرد ندارد",
  affirmed: "تأیید می‌کنم",
  start_of_day: "ابتدای روز",
  end_of_day: "پایان روز",
};
export function financialQuestionLabel(key: string) {
  const field = key.split("|")[0];
  return (
    (
      {
        coverage: "پوشش دوره",
        income_tax: "مالیات بر درآمد",
        cogs: "بهای تمام‌شده",
        ledger_opening_complete: "مانده ابتدای دفتر",
        invoice_openings_included: "مانده ابتدای فاکتورها",
        settlements_complete: "پوشش سوابق تسویه",
        comparable_parties: "دامنه طرف‌حساب‌ها",
        binding: "حساب مرتبط در دفتر",
        anchor: "زمان مانده مبنا",
        bank_accounts_complete: "پوشش حساب‌های بانکی",
      } as Record<string, string>
    )[field] ?? "تأیید اطلاعات مالی"
  );
}
