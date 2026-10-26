import type { Schema } from "@didban/api-client";
import { formatDate, persianDigits } from "@/lib/dates";
import { formatMoney, type DisplayUnit } from "@/features/results/presentation";
export type Candidate = Schema<"ReconciliationCandidate">;
export type Kind = "bank_ledger" | "moadian_sales" | "moadian_purchases";
export const kindLabels: Record<Kind, string> = {
  bank_ledger: "بانک و دفتر",
  moadian_sales: "فروش مؤدیان",
  moadian_purchases: "خرید مؤدیان",
};
const classifications: Record<string, string> = {
  exact_unique: "تطبیق یکتا",
  suggested: "پیشنهاد بررسی",
  ambiguous: "چند نامزد",
  unmatched: "بدون تطبیق",
  amount_mismatch: "اختلاف مبلغ",
  needs_review: "نیازمند بررسی",
};
const reasons: Record<string, string> = {
  prior_decision_requires_review:
    "شواهد نسبت به تصمیم قبلی تغییر کرده؛ بررسی دوباره لازم است.",
  bank_source_changed:
    "تفسیر یا ارتباط حساب این تراکنش تغییر کرده؛ نیازمند بررسی است.",
  bank_ledger_binding_unknown: "ارتباط حساب بانک و دفتر مشخص نیست.",
  reference_missing: "مرجع تراکنش موجود نیست.",
  competing_candidates: "بیش از یک نامزد وجود دارد.",
  candidate_group_too_large: "مرجع مشترک بیش از حد تکرار شده؛ ورودی بررسی شود.",
  amount_mismatch: "مبلغ دو منبع برابر نیست.",
  group_sum_equal:
    "جمع ردیف‌های هم‌مرجع برابر است؛ پذیرش نیازمند بررسی کاربر است.",
  date_mismatch: "تاریخ دو منبع متفاوت است.",
  bank_only: "فقط در گردش بانک انتخاب‌شده دیده شد.",
  ledger_only: "فقط در دفتر انتخاب‌شده دیده شد.",
  internal_only: "فقط در فاکتورهای انتخاب‌شده دیده شد.",
  portal_only: "فقط در فایل مؤدیان انتخاب‌شده دیده شد.",
  duplicate_tax_identity: "شناسه مالیاتی تکراری است.",
  reference_chain_requires_review:
    "اثر زنجیره اصلاح، ابطال یا برگشت نیازمند بررسی است.",
  tax_missing: "مبلغ مالیات یکی از منابع مشخص نیست.",
  party_identity_missing: "هویت طرف معامله در هر دو منبع مشخص نیست.",
  party_mismatch: "طرف معامله دو منبع متفاوت است.",
  vat_mismatch: "مالیات دو منبع برابر نیست.",
  tax_identity_missing: "شناسه مالیاتی موجود نیست.",
};
export const sourceSide: Record<string, string> = {
  bank: "بانک",
  ledger: "دفتر",
  internal: "فاکتور داخلی",
  portal: "مؤدیان",
};
export const reasonText = (code: string) =>
  reasons[code] ?? "کنترل این مورد کامل نیست.";
export function canAccept(candidate: Candidate) {
  return (
    candidate.source_refs.length >= 2 &&
    !["unmatched", "amount_mismatch", "needs_review"].includes(
      candidate.classification,
    ) &&
    candidate.reason_codes.every((c) =>
      ["competing_candidates", "date_mismatch", "group_sum_equal"].includes(c),
    )
  );
}
export function candidateModel(candidate: Candidate, unit: DisplayUnit) {
  return {
    id: candidate.id,
    status: classifications[candidate.classification] ?? "نامشخص",
    reference: candidate.source_refs[0]?.reference ?? "بدون مرجع",
    decision:
      candidate.decision?.action === "accept"
        ? candidate.provenance === "preserved_human"
          ? "تصمیم حفظ‌شده کاربر"
          : candidate.provenance === "validated_automatic"
            ? "پذیرفته خودکار"
            : "پذیرفته کاربر"
        : candidate.decision?.action === "reject"
          ? "ردشده"
          : candidate.decision?.action === "needs_review"
            ? "برای بررسی"
            : "بدون تصمیم",
    difference:
      candidate.difference !== null
        ? formatMoney(candidate.difference, unit)
        : "—",
    reasons: candidate.reason_codes.map(reasonText),
    sources: candidate.source_refs.map((r) => ({
      key: r.normalized_row_id,
      side: sourceSide[r.side],
      sheet: r.sheet_name,
      row: persianDigits(String(r.row_number)),
      date: r.date ? formatDate(r.date) : "—",
      amount: formatMoney(r.amount, unit),
      reference: r.reference ?? "—",
    })),
    chain: candidate.reference_chain.map((r) => ({
      value:
        r === "cycle"
          ? "چرخه مرجع"
          : r === "missing_reference"
            ? "مرجع موجود نیست"
            : r === "future_reference"
              ? "تاریخ مرجع بعد از صورتحساب است"
              : r === "ambiguous_reference"
                ? "مرجع تکراری"
                : r,
      technical: ![
        "cycle",
        "missing_reference",
        "ambiguous_reference",
        "future_reference",
      ].includes(r),
    })),
  };
}
export type CandidateModel = ReturnType<typeof candidateModel>;
