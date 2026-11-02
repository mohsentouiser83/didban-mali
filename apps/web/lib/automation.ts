export type RuleScope = "metric" | "invoice" | "native_journal";
export interface RuleCondition {
  field:
    | "value"
    | "remaining"
    | "amount"
    | "party_id"
    | "reference"
    | "direction"
    | "overdue"
    | "date"
    | "due_date"
    | "status"
    | "account_id";
  op: "gt" | "gte" | "lt" | "lte" | "eq" | "contains";
  value: string;
}
export interface RuleDefinition {
  scope: RuleScope;
  metric_key: string;
  period_id?: string;
  conditions: RuleCondition[];
  action: "notify" | "followup" | "draft_request" | "prepare_draft";
  draft_template?: {
    kind: "sale_service" | "purchase_service";
    accounts: Record<string, string>;
  } | null;
}
export interface AutomationRule {
  id: string;
  version: number;
  name: string;
  enabled: boolean;
  definition: RuleDefinition;
}
export interface RulePreview {
  manifest_id?: string;
  period_id?: string;
  basis?: "native_book";
  definition: RuleDefinition;
  matches: {
    subject_id: string;
    reference: string;
    value: string | null;
    evidence_refs: string[];
    draft_eligible?: boolean;
    blocked_reason?: string;
    blocked_message?: string;
  }[];
  match_count: number;
  unavailable_count: number;
  status: string;
  financial_effect: false;
  preview_id?: string;
}
export interface AutomationRun {
  id: string;
  rule_id: string;
  rule_version: number;
  manifest_id?: string;
  created_at: string;
  result: Partial<RulePreview> & {
    action_count: number;
    action_state: string;
    source?: { sequence?: number; missing_fields?: string[] };
  };
}
export interface LearningCandidate {
  id: string;
  sheet: string;
  family: string;
  mapping: Record<string, string>;
  headers: string[];
}
export interface LearningPattern {
  id: string;
  version: number;
  name: string;
  enabled: boolean;
  interpretation_id: string;
  payload: {
    family: string;
    mapping: Record<string, string>;
    sheet: string;
    headers: string[];
    unit: string;
    calendar: string;
    role_overrides: Record<string, string>;
  };
}
export const ruleFieldLabels = {
  value: "مقدار شاخص",
  remaining: "مانده فاکتور",
  amount: "مبلغ فاکتور",
  party_id: "طرف حساب",
  reference: "شماره فاکتور",
  direction: "جهت فاکتور",
  overdue: "سررسیدگذشته",
  date: "تاریخ فاکتور",
  due_date: "تاریخ سررسید",
  status: "وضعیت داده فاکتور",
  account_id: "حساب ردیف سند",
};
export const operatorLabels = {
  gt: "بیشتر از",
  gte: "بیشتر یا مساوی",
  lt: "کمتر از",
  lte: "کمتر یا مساوی",
  eq: "برابر",
  contains: "شامل",
};
export const actionLabels = {
  notify: "اعلان داخلی",
  followup: "ساخت پیگیری وصول",
  draft_request: "درخواست تهیه پیش‌نویس",
  prepare_draft: "ساخت پیش‌نویس خدمات",
};
export const familyLabels: Record<string, string> = {
  bank: "گردش بانک",
  ledger: "دفتر",
  sales: "فروش",
  purchases: "خرید",
  settlements: "دریافت و پرداخت",
  moadian: "مؤدیان",
  history: "سابقه وصول",
  plans: "برنامه پرداخت",
  employees: "کارکنان",
  payroll: "حقوق",
};
export const mappingLabel: Record<string, string> = {
  date: "تاریخ",
  account: "حساب",
  role: "نقش حساب",
  debit: "بدهکار",
  credit: "بستانکار",
  amount: "مبلغ",
  reference: "مرجع",
  party_id: "طرف حساب",
  entry_id: "شماره سند",
  entry_type: "نوع سند",
  invoice_id: "شناسه فاکتور",
  due_date: "سررسید",
  balance: "مانده",
  row_type: "نوع ردیف",
  currency: "واحد",
  tax: "مالیات",
  tax_id: "شناسه مالیاتی",
  direction: "جهت",
  paid_on: "تاریخ وصول",
  employee_id: "کد کارمند",
  employee_name: "نام کارمند",
};
