import type { Company, ImportBatch } from "./product-types";

export const fieldLabels: Record<string, string> = {
  entry_id: "شماره سند", entry_date: "تاریخ سند", account_code: "کد حساب", account_name: "نام حساب", description: "شرح", debit: "بدهکار", credit: "بستانکار", line_id: "شماره ردیف سند", reference: "مرجع", counterparty_name: "طرف حساب", invoice_ref: "مرجع فاکتور",
  booking_date: "تاریخ تراکنش", amount_signed: "مبلغ خالص", deposit_amount: "واریز", withdrawal_amount: "برداشت", transaction_id: "شناسه تراکنش", value_date: "تاریخ مؤثر", running_balance: "مانده جاری", iban: "شماره شبا",
  invoice_no: "شماره فاکتور", issue_date: "تاریخ فاکتور", customer_name: "نام مشتری", gross_amount: "مبلغ ناخالص", due_date: "تاریخ سررسید", tax_amount: "مالیات", paid_amount: "مبلغ وصول‌شده", payment_date: "تاریخ پرداخت", customer_national_id: "شناسه ملی مشتری", status: "وضعیت",
};

export const targetFields: Record<ImportBatch["source_kind"], string[]> = {
  accounting: ["entry_id", "entry_date", "account_code", "account_name", "description", "debit", "credit", "line_id", "reference", "counterparty_name", "invoice_ref"],
  bank: ["booking_date", "description", "amount_signed", "deposit_amount", "withdrawal_amount", "transaction_id", "reference", "value_date", "running_balance", "counterparty_name", "iban"],
  sales: ["invoice_no", "issue_date", "customer_name", "gross_amount", "due_date", "tax_amount", "paid_amount", "payment_date", "customer_national_id", "status", "description"],
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

export function isRequiredField(field: string, required: string[], alternatives: string[][]) {
  return required.includes(field) || alternatives.some((group) => group.includes(field));
}

export function companyRoute(company: Company, suffix: string) { return `/companies/${company.id}${suffix}`; }
