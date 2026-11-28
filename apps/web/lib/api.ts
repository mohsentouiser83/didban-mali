import type { ModuleAccess } from "@/lib/module-access";
import { randomId } from "@/lib/random-id";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}
let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export async function api<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    version?: number;
    signal?: AbortSignal;
    key?: string;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const method = options.method || "GET";
  if (!["GET", "HEAD"].includes(method)) {
    headers["X-CSRF-Token"] = csrf;
    headers["Idempotency-Key"] = options.key || randomId();
  }
  if (options.version !== undefined)
    headers["If-Match"] = String(options.version);
  if (options.body !== undefined && !(options.body instanceof FormData))
    headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetch("/api/v1" + path, {
      method,
      headers,
      body:
        options.body instanceof FormData
          ? options.body
          : options.body === undefined
            ? undefined
            : JSON.stringify(options.body),
      credentials: "same-origin",
      signal: options.signal,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiError(
      0,
      "ارتباط برقرار نشد. دوباره تلاش کنید.",
      "network_error",
    );
  }
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      response.status,
      payload.message_fa ||
        payload.detail?.message_fa ||
        payload.detail ||
        "درخواست انجام نشد.",
      payload.code || "request_failed",
      payload.field_errors || {},
    );
  return payload as T;
}
export function listItems<T>(data: { items: T[] } | T[] | undefined): T[] {
  return Array.isArray(data) ? data : data?.items || [];
}
export type ResourceList<T> = { items: T[]; next_cursor?: string | null };
export interface User {
  id: string;
  email: string;
  name: string;
  installation_admin: boolean;
  avatar?: string | null;
}
export interface Company {
  module_access?: ModuleAccess;
  id: string;
  name: string;
  version: number;
  role: "owner" | "finance_manager" | "advisor" | "viewer";
  approve_financial_report: boolean;
}
export interface Period {
  previous_period_id?: string | null;
  id: string;
  name: string;
  start: string;
  end: string;
  version: number;
  in_use?: boolean;
  closed?: boolean;
  lock_version?: number;
}
export interface Metric {
  metric_key: string;
  label?: string;
  basis: string;
  value: string | null;
  status: string;
  unit: string;
  reason?: string | null;
  reason_codes: string[];
  action?: string | null;
  as_of_date?: string;
  period_id?: string;
  comparison?: {
    previous: string | null;
    delta: string | null;
    percent: string | null;
    reason?: string | null;
  };
  evidence_refs?: string[];
}
export interface Manifest {
  id: string;
  period_id: string;
  created_at: string;
  metrics: Metric[];
  details: FinancialDetails;
  selection: Record<string, unknown>;
}
export interface InvoiceDetail {
  id: string;
  reference: string;
  party_id: string;
  date: string;
  due_date?: string | null;
  amount: string;
  remaining: string | null;
  direction: string;
  overdue?: boolean;
  status?: string;
  tax_id?: string | null;
  reason?: string;
}
export interface BankDetail {
  account: string;
  balance?: string | null;
  value?: string | null;
  status?: string;
  reason?: string;
}
export interface CashDay {
  date: string;
  balance: string | null;
  inflow?: string;
  outflow?: string;
  net?: string;
  amount?: string;
}
export interface ForecastAssumption {
  basis: string;
  invoice_ref?: string;
  obligation_id?: string;
  expected_date?: string;
  delay_days?: number;
  history_event_count?: number;
  evidence_refs?: string[];
}
export interface Forecast {
  status: string;
  reason?: string;
  opening?: string | null;
  closing?: string | null;
  days?: CashDay[];
  events?: {
    date: string;
    amount: string;
    direction: string;
    obligation_id?: string;
    balance?: string;
  }[];
  assumptions?: (string | ForecastAssumption)[];
  excluded?: string[];
}
export interface FinancialDetails {
  bank_balances?: BankDetail[];
  cash_movements?: Record<string, string | null>;
  daily_cash?: CashDay[];
  invoices?: InvoiceDetail[];
  debt_components?: Record<string, string>;
  moadian?: { sales?: ComparisonRow[]; purchases?: ComparisonRow[] };
  forecast?: Forecast;
  [key: string]: unknown;
}
export interface ComparisonRow {
  reference?: string;
  internal_reference?: string | null;
  date?: string | null;
  invoice_id?: string;
  tax_id?: string;
  status?: string;
  state?: string;
  internal?: string | null;
  portal?: string | null;
  difference?: string | null;
  amount?: string;
  reason?: string;
  portal_amount?: string | null;
  tax?: string | null;
}
export interface SourceFile {
  id: string;
  name: string;
  state: string;
  scan_status: string;
  row_count: number;
  size: number;
  archived: boolean;
  version: number;
  session_id: string;
  created_at?: string;
  period_id?: string | null;
  period_name?: string | null;
}
export interface Issue {
  id: string;
  code: string;
  question: string;
  choices: { value: string; label: string }[];
  evidence: {
    headers?: string[];
    sample?: Record<string, string>[];
    sheet?: string;
    required?: string[];
    fields?: { key: string; label: string }[];
    [key: string]: unknown;
  };
  version: number;
  answer?: unknown;
  file_id?: string | null;
}
export interface ProcessingSession {
  id: string;
  state: string;
  version: number;
  period_id: string | null;
  completed_steps: number;
  result_id?: string | null;
  error_message?: string | null;
  created_at: string;
  files?: SourceFile[];
  issues?: Issue[];
}
export interface Report {
  id: string;
  manifest_id: string;
  title: string;
  version: number;
  created_at: string;
  period_name?: string | null;
  approvals?: {
    actor_id: string;
    created_at: string;
    permission_provenance: string;
  }[];
}
export interface Member {
  module_access?: ModuleAccess;
  id: string;
  user_id: string;
  name?: string;
  email?: string;
  role: string;
  approve_financial_report: boolean;
  active: boolean;
  version: number;
}
export interface Plan {
  id: string;
  label: string;
  amount: string;
  due_date: string;
  obligation_id: string;
  invoice_reference?: string | null;
  state: string;
  version: number;
}
export interface Allocation {
  created_at?: string;
  bank_reference?: string;
  invoice_reference?: string;
  id: string;
  bank_id: string;
  invoice_id: string;
  amount: string;
  version: number;
  reversed_at?: string | null;
}
export interface BankMovement {
  id: string;
  account: string;
  date: string;
  amount: string;
  reference: string;
  kind: string;
}
export interface AppNotification {
  id: string;
  title: string;
  href: string;
  read: boolean;
  version: number;
  created_at: string;
}
export interface Usage {
  budget_mode?: "capped" | "unlimited";
  unknown_reserved?: string;
  model_status: string;
  used: string;
  reserved: string;
  currency: string;
  policies: { id: string; cap: string; period: string; version: number }[];
}
export interface ReconciliationCandidate {
  group_state?: "accepted";
  group_decision_id?: string;
  group_candidate_key?: string;
  group_version?: number;
  group_basis?: "native_book" | "imported_ledger";
  group_ledger_account?: string;
  group_native_statement_id?: string;
  single_status?: string;
  id: string;
  bank_id: string;
  ledger_ids: string[];
  bank_account: string;
  ledger_account: string;
  reference: string;
  date: string;
  amount: string;
  status: "accepted" | "accepted_in_group" | "rejected" | "needs_review" | "exact_proposal";
  reason_codes: string[];
  evidence_refs: string[];
  version: number;
}
export interface ReconciliationRun {
  id: string;
  manifest_id: string;
  version: number;
  bank_to_ledger: Record<string, string>;
  candidates: ReconciliationCandidate[];
  created_at: string;
}
export interface ReconciliationOptions {
  manifest_id: string;
  bank_accounts: string[];
  ledger_accounts: { account: string; role: string }[];
}
export interface SourceEvidence {
  id: string;
  file_id: string;
  filename: string;
  sheet: string;
  row_number: number;
  values: Record<string, string>;
}
export interface InstallationBudget {
  id: string;
  period: string;
  cap: string;
  per_session_cap: string | null;
  used: string;
  reserved: string;
  currency: string;
  version: number;
}
export interface InstallationModelConfiguration {
  budget_mode?: "capped" | "unlimited";
  model: string;
  provider: string;
  enabled: boolean;
  key_configured: boolean;
  configuration_source: "server_environment";
  availability_verified: false;
}
export interface ModelStatus {
  budget_mode?: "capped" | "unlimited";
  model: string;
  enabled: boolean;
  configured: boolean;
  key_configured: boolean;
  tariff_configured: boolean;
  budget_configured: boolean;
  status: "disabled" | "unconfigured" | "configured_unverified";
  availability_verified: false;
}
export interface ModelTariff {
  id: string;
  model: string;
  price_version: string;
  input_per_million: string;
  cached_input_per_million: string;
  cache_write_per_million: string;
  output_per_million: string;
  max_input_tokens: number;
  max_output_tokens: number;
  effective_from: string;
  currency: string;
}
export interface ModelRequest {
  id: string;
  created_at: string;
  purpose: string;
  model: string;
  prompt_version: string;
  state: string;
  attempts: number;
  error_code: string | null;
  usage: Record<string, number | string> | null;
  next_attempt_at: string | null;
}
export interface NumberingRule {
  id: string;
  company_id: string;
  entity_type: string;
  entity_title: string;
  prefix: string;
  start_number: number;
  current_number: number;
  padding: number;
  suffix: string;
  sample: string;
  next_number?: string | null;
  used_in_workflow?: boolean;
  connected_process?: string | null;
  deactivation_impact?: string | null;
  description: string | null;
  is_system: boolean;
  active: boolean;
  version: number;
}
export interface NumberingRuleInput {
  entity_title?: string;
  prefix?: string;
  start_number?: number;
  current_number?: number;
  padding?: number;
  suffix?: string;
  description?: string | null;
  active?: boolean;
}
export interface NumberingRuleCreateInput {
  entity_type: string;
  entity_title: string;
  prefix?: string;
  start_number?: number;
  current_number?: number;
  padding?: number;
  suffix?: string;
  description?: string | null;
  active?: boolean;
}

export interface Employee {
  id: string;
  company_id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  full_name: string;
  identity_type: "national_id" | "foreign_national_id";
  national_id: string | null;
  father_name: string | null;
  birth_date: string | null;
  hire_date: string | null;
  insurance_number: string | null;
  phone: string | null;
  iban: string | null;
  bank_name: string | null;
  account_number: string | null;
  job_title: string | null;
  department: string | null;
  marital_status: "single" | "married";
  children_count: number;
  active: boolean;
  is_veteran_or_child: boolean;
  is_foreign_national: boolean;
  is_science_park_staff: boolean;
  has_disability_charge: boolean;
  is_underdeveloped_region: boolean;
  is_retired: boolean;
  version: number;
  contracts?: EmployeeContract[];
}

export interface EmployeeInput {
  employee_code?: string;
  first_name: string;
  last_name: string;
  identity_type?: "national_id" | "foreign_national_id";
  national_id?: string | null;
  father_name?: string | null;
  birth_date?: string | null;
  hire_date?: string | null;
  insurance_number?: string | null;
  phone?: string | null;
  iban?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  job_title?: string | null;
  department?: string | null;
  marital_status?: "single" | "married";
  children_count?: number;
  active?: boolean;
  is_veteran_or_child?: boolean;
  is_foreign_national?: boolean;
  is_science_park_staff?: boolean;
  has_disability_charge?: boolean;
  is_underdeveloped_region?: boolean;
  is_retired?: boolean;
}

export interface EmployeeContract {
  id: string;
  company_id: string;
  employee_id: string;
  employee_code?: string;
  employee_name?: string;
  contract_number: string;
  contract_type: "full_time" | "part_time" | "hourly" | "project" | "honorarium";
  start_date: string;
  end_date: string | null;
  status: "draft" | "active" | "terminated";
  base_salary: string;
  daily_rate: string;
  housing_allowance: string;
  grocery_allowance: string;
  marital_allowance: string;
  child_allowance: string;
  tenure_allowance: string;
  custom_fixed_allowances: string;
  is_insured: boolean;
  is_taxable: boolean;
  workshop_id?: string | null;
  work_location?: string | null;
  work_description?: string | null;
  conclusion_date?: string | null;
  amendment_of_contract_id?: string | null;
  weekly_hours?: string;
  notes: string | null;
  version: number;
}

export interface EmployeeContractInput {
  employee_id: string;
  contract_number?: string;
  contract_type?: "full_time" | "part_time" | "hourly" | "project" | "honorarium";
  start_date: string;
  end_date?: string | null;
  status?: "draft" | "active" | "terminated";
  base_salary?: string | number;
  daily_rate?: string | number;
  housing_allowance?: string | number;
  grocery_allowance?: string | number;
  marital_allowance?: string | number;
  child_allowance?: string | number;
  tenure_allowance?: string | number;
  custom_fixed_allowances?: string | number;
  is_insured?: boolean;
  is_taxable?: boolean;
  workshop_id?: string | null;
  work_location?: string | null;
  work_description?: string | null;
  conclusion_date?: string | null;
  amendment_of_contract_id?: string | null;
  weekly_hours?: string | number;
  notes?: string | null;
}

export interface PayrollRun {
  id: string;
  company_id: string;
  period_id: string;
  title: string;
  year: number;
  month: number;
  calculation_date: string;
  status: "draft" | "calculated" | "approved" | "posted";
  total_gross: string;
  total_employee_insurance: string;
  total_employer_insurance: string;
  total_tax: string;
  total_other_deductions: string;
  total_net: string;
  journal_id: string | null;
  rate_table_year?: number;
  rate_status?: "verified_1403" | "unverified_period_rates";
  created_by_user_id: string | null;
  version: number;
  slips_count?: number;
  slips?: PayrollSlip[];
}

export interface PayrollSlip {
  id: string;
  company_id: string;
  payroll_run_id: string;
  employee_id: string;
  employee_code?: string;
  employee_name?: string;
  job_title?: string;
  department?: string;
  contract_id: string | null;
  work_days: string;
  work_hours: string;
  overtime_hours: string;
  absence_days: string;
  paid_leave_days: string;
  unpaid_leave_days: string;
  advance_payment: string;
  loan_installment: string;
  other_deductions: string;
  bonus_amount: string;
  base_pay: string;
  housing_pay: string;
  grocery_pay: string;
  marital_pay: string;
  child_pay: string;
  tenure_pay: string;
  overtime_pay: string;
  gross_pay: string;
  insured_earnings: string;
  taxable_earnings: string;
  employee_insurance: string;
  employer_insurance: string;
  payroll_tax: string;
  total_deductions: string;
  net_pay: string;
  status: "unpaid" | "paid";
  applied_exemptions: Record<string, boolean | string | number | null>;
  version: number;
}

export interface SettlementCalculation {
  days_worked: number;
  years_worked: string;
  days_worked_in_year: number;
  base_salary: string;
  daily_wage: string;
  eydi_amount: string;
  eydi_ceiling: string;
  eydi_floor: string;
  sanavat_amount: string;
  accrued_leave_days: string;
  used_leave_days: string;
  remaining_leave_days: string;
  leave_settlement_amount: string;
  total_settlement: string;
}

export interface EmployeeSettlementResponse {
  employee: Employee;
  contract: EmployeeContract | null;
  calculation_date: string;
  settlement: SettlementCalculation;
}

export interface InsuranceDiskResponse {
  run_id: string;
  title: string;
  year: number;
  month: number;
  workshop_code?: string;
  employer_name?: string;
  rate_table_year?: number;
  rate_status?: "verified_1403" | "unverified_period_rates";
  output_scope?: "internal_draft_only";
  official_format_verified?: boolean;
  summary: {
    total_insured_employees: number;
    total_days_worked: number;
    total_insured_wage: string;
    total_employee_share_7pct: string;
    total_employer_share_23pct: string;
    total_insurance_payable: string;
  };
  dskkar00: string;
  dskwor00: string;
  rows: Array<{
    row_number: number;
    employee_code: string;
    employee_name: string;
    national_id: string;
    insurance_number: string;
    job_title: string;
    days_worked: number;
    insured_earnings: string;
    employee_insurance: string;
    employer_insurance: string;
    total_insurance: string;
  }>;
}

export interface TaxDiskResponse {
  run_id: string;
  title: string;
  year: number;
  month: number;
  rate_table_year?: number;
  rate_status?: "verified_1403" | "unverified_period_rates";
  output_scope?: "internal_draft_only";
  official_format_verified?: boolean;
  summary: {
    total_employees: number;
    total_gross_pay: string;
    total_taxable_earnings: string;
    total_payroll_tax: string;
  };
  tax_file: string;
  rows: Array<{
    row_number: number;
    employee_code: string;
    employee_name: string;
    national_id: string;
    contract_type: string;
    work_days: string;
    gross_pay: string;
    taxable_earnings: string;
    payroll_tax: string;
  }>;
}


