import type { Company, ImportBatch } from "./product-types";

export const sourceLabels = { accounting: "دفتر حسابداری", bank: "گردش بانک", sales: "فاکتور فروش حسابداری", purchases: "فاکتور خرید حسابداری", moadian_sales: "فروش کارپوشه مؤدیان", moadian_purchases: "خرید کارپوشه مؤدیان" };

const snapshotFields = ["invoice_no", "tax_id", "issue_date", "party_name", "party_id", "gross_amount", "tax_amount", "subject", "reference_tax_id", "status"];

export const fieldLabels: Record<string, string> = {
  general_code: "کد کل", general_name: "نام کل", subsidiary_code: "کد معین", subsidiary_name: "نام معین", detail_code: "کد تفصیلی", detail_name: "نام تفصیلی", entry_type: "نوع سند",
  entry_id: "شماره سند", entry_date: "تاریخ سند", account_code: "کد حساب", account_name: "نام حساب", description: "شرح سند", debit: "بدهکار", credit: "بستانکار", line_id: "ردیف", reference: "مرجع", counterparty_name: "طرف حساب", invoice_ref: "مرجع فاکتور",
  booking_date: "تاریخ تراکنش", amount_signed: "مبلغ خالص", deposit_amount: "واریز (ریال)", withdrawal_amount: "برداشت (ریال)", transaction_id: "شماره سند / شناسه تراکنش", transaction_type: "نوع تراکنش", value_date: "تاریخ مؤثر", running_balance: "مانده (ریال)", iban: "شماره شبا",
  tax_id: "شماره مالیاتی صورتحساب", party_name: "طرف معامله", party_id: "شناسه اقتصادی / ملی طرف معامله", subject: "موضوع صورتحساب", reference_tax_id: "شماره مالیاتی مرجع",
  invoice_no: "شماره فاکتور", issue_date: "تاریخ فاکتور", customer_name: "نام مشتری", gross_amount: "مبلغ ناخالص", due_date: "تاریخ سررسید", tax_amount: "مالیات", paid_amount: "مبلغ وصول‌شده", payment_date: "تاریخ پرداخت", customer_national_id: "شناسه ملی مشتری", status: "وضعیت",
};

export const targetFields: Record<ImportBatch["source_kind"], string[]> = {
  accounting: ["entry_id", "entry_date", "account_code", "account_name", "description", "debit", "credit", "line_id", "reference", "counterparty_name", "invoice_ref", "general_code", "general_name", "subsidiary_code", "subsidiary_name", "detail_code", "detail_name", "entry_type"],
  bank: ["booking_date", "description", "deposit_amount", "withdrawal_amount", "running_balance", "transaction_type", "transaction_id", "line_id", "amount_signed", "counterparty_name", "reference", "value_date", "iban"],
  sales: ["invoice_no", "issue_date", "customer_name", "gross_amount", "due_date", "tax_amount", "paid_amount", "payment_date", "customer_national_id", "status", "description", "tax_id", "subject", "reference_tax_id"],
  purchases: snapshotFields, moadian_sales: snapshotFields, moadian_purchases: snapshotFields,
};

const dateFields = new Set(["entry_date", "booking_date", "value_date", "issue_date", "due_date", "payment_date"]);
const moneyFields = new Set(["debit", "credit", "amount_signed", "deposit_amount", "withdrawal_amount", "gross_amount", "tax_amount", "paid_amount", "running_balance"]);

export function buildTransforms(mapping: Record<string, string>, currencyUnit: "rial" | "toman") {
  return Object.fromEntries(Object.keys(mapping).map((field) => {
    const operations = ["trim"];
    if (dateFields.has(field)) operations.push("normalize_digits", "parse_date");
    if (moneyFields.has(field)) operations.push("normalize_digits", "strip_thousands");
    if (moneyFields.has(field) && currencyUnit === "toman") operations.push("toman_to_rial");
    return [field, operations];
  }));
}

export function isRequiredField(field: string, required: string[], alternatives: string[][], mapping: Record<string, string> = {}) {
  if (required.includes(field)) return true;
  const isMapped = (target: string) => Boolean(mapping[target]?.trim());
  // A complete alternative takes precedence over a partially mapped one.
  const activeGroup = alternatives.find((group) => group.every(isMapped))
    ?? alternatives.find((group) => group.some(isMapped));
  return activeGroup?.includes(field) ?? false;
}

export function companyRoute(company: Company, suffix: string) { return `/companies/${company.id}${suffix}`; }
