export type Employee = {
  id: string;
  personnel_code: string;
  version: number;
  profile: Record<string, string>;
};
export type Contract = {
  id: string;
  employee_id: string;
  effective_from: string;
  effective_to: string | null;
  content: Record<string, unknown>;
};
export type Work = {
  id: string;
  employee_id: string;
  period_start: string;
  period_end: string;
  revision: number;
  content: Record<string, unknown>;
};
export type Rule = {
  id: string;
  name: string;
  effective_from: string;
  effective_to: string;
  reviewed: boolean;
  legal_verified: boolean;
  content: Record<string, unknown>;
};
export type PayrollResult = {
  gross: string;
  net: string;
  employer_cost: string;
  employee_insurance: string;
  employer_insurance: string;
  tax: string;
  deductions: string;
  leave_balance_days: string;
  lines: { key: string; amount: string }[];
};
export type Run = {
  id: string;
  period_start: string;
  period_end: string;
  kind: string;
  rule_id: string;
  approved: boolean;
  input_hash: string;
  created_at: string;
  supersedes_id: string | null;
  content: {
    legal_verified: boolean;
    items: {
      employee_id: string;
      personnel_code: string;
      profile: Record<string, string>;
      result: PayrollResult;
    }[];
    totals: Record<string, string>;
    delta_totals?: Record<string, string>;
  };
};
export type Access = {
  company_id: string;
  view: boolean;
  manage: boolean;
  approve: boolean;
};
export type Summary = {
  period_start: string;
  period_end: string;
  hires: number;
  departures: number;
  active_employees: number;
  employees_paid: number;
  approved_runs: number;
  gross: string;
  net: string;
  employer_cost: string;
  paid: string;
  unpaid: string;
};
export type Area = "employees" | "contracts" | "work" | "rules" | "runs";
export type ImportPreview = {
  id: string;
  content: {
    kind: string;
    row_count: number;
    rows: unknown[];
    preview_rows: {
      row: number;
      original: Record<string, string>;
      normalized: Record<string, unknown> | null;
    }[];
    errors: { row: number; column: string; code: string }[];
  };
};
