export type InvoiceDirection = "sale" | "purchase";
export interface NativeInvoiceTerms {
  id: string; version: number; due_date: string | null; due_unknown: boolean;
  expected_date: string | null; expected_unknown: boolean; effective_date: string;
  reason?: string; created_at?: string; actor_name?: string;
}
export interface NativeInvoiceAllocation {
  id: string; operation_id: string; journal_id: string; journal_digest: string;
  amount: string; date: string; status: string; reversed: boolean;
}
export interface NativeInvoice {
  as_of?: string;
  id: string; version: number; direction: InvoiceDirection; reference: string;
  party_id: string; date: string; amount: string; remaining: string | null;
  status: string; reason: string | null; unit: string;
  original_source?: NativeInvoiceCandidate; source_history?: {id:string;source:NativeInvoiceCandidate;reason:string;effective_date:string;created_at:string;actor_id:string}[];
  source: { operation_id: string; journal_id: string; journal_digest: string; approved_draft_version: number };
  terms: NativeInvoiceTerms | null; allocations: NativeInvoiceAllocation[];
  history_lag_days?: number | null; history_event_count?: number; history_reason?: string | null; overdue_days?: number | null;
  terms_history: NativeInvoiceTerms[];
}
export interface NativeInvoiceCandidate {
  operation_id: string; journal_id: string; journal_digest: string; approved_draft_version: number;
  reference: string; party_id: string; date: string; amount: string; unit: string; remaining_capacity: string; replacement_of?: string | null;
}
export interface NativeInvoiceReport { basis: "native_invoice"; as_of: string; direction?: InvoiceDirection | null; items: NativeInvoice[]; priority_formula?: string; history_policy?: {window_start:string;window_end:string;minimum_events:number;lookback_days:number} }
export interface InvoiceTermsInput {
  due_date: string; due_unknown: boolean; expected_date: string; expected_unknown: boolean;
  effective_date: string; reason: string; expected_mode: "" | "date" | "history" | "unknown";
}
export const emptyTerms = (): InvoiceTermsInput => ({ due_date: "", due_unknown: false, expected_date: "", expected_unknown: false, effective_date: "", reason: "", expected_mode: "" });
export const termsValid = (terms: InvoiceTermsInput) => !!terms.due_date !== terms.due_unknown && (terms.expected_mode === "history" || terms.expected_mode === "unknown" || terms.expected_mode === "date" && !!terms.expected_date);
export const termsPayload = (terms: InvoiceTermsInput) => ({ due_date: terms.due_unknown ? null : terms.due_date, due_unknown: terms.due_unknown, expected_date: terms.expected_mode === "date" ? terms.expected_date : null, expected_unknown: terms.expected_mode === "unknown" });
export function tehranToday() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const invoiceReasons: Record<string,string> = {
  native_invoice_terms_missing: "برای این تاریخ شرایط فاکتور ثبت نشده است.",
  native_invoice_source_changed: "سند مرجع تغییر کرده؛ مانده قابل محاسبه نیست.",
  native_invoice_source_reversed: "سند مرجع برگشت شده؛ مانده قابل محاسبه نیست.",
  native_invoice_allocation_source_invalid: "سند یکی از تخصیص‌ها معتبر نیست؛ مانده قابل محاسبه نیست.",
};
export const nativeInvoiceReason = (code: string | null) => code ? invoiceReasons[code] || "شواهد سند مرجع معتبر نیست؛ مانده قابل محاسبه نیست." : null;
export function compareInvoiceAmounts(left: string | null, right: string | null) {
  if (left === null) return right === null ? 0 : -1;
  if (right === null) return 1;
  const scale = Math.max(left.split(".")[1]?.length || 0, right.split(".")[1]?.length || 0);
  const integer = (value: string) => { const [whole, fraction = ""] = value.split("."); return BigInt(whole + fraction.padEnd(scale, "0")); };
  const a = integer(left), b = integer(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function expectedDateLabel(terms: NativeInvoiceTerms | null, direction: InvoiceDirection) {
  if (!terms || terms.expected_unknown) return "نامشخص";
  if (terms.expected_date) return terms.expected_date;
  return direction === "sale" ? "برآورد از سابقهٔ وصول" : "برنامه‌ریزی بر اساس سررسید";
}
