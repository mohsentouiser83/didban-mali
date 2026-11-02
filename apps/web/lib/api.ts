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
    headers["Idempotency-Key"] = options.key || crypto.randomUUID();
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
}
export interface Company {
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
  invoice_id?: string;
  tax_id?: string;
  status?: string;
  state?: string;
  internal?: string | null;
  portal?: string | null;
  difference?: string | null;
  amount?: string;
  reason?: string;
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
export interface Finding {
  id: string;
  title: string;
  code: string;
  state: string;
  version: number;
  evidence: unknown[];
  decision?: unknown;
}
export interface Report {
  id: string;
  manifest_id: string;
  title: string;
  version: number;
  created_at: string;
  approvals?: {
    actor_id: string;
    created_at: string;
    permission_provenance: string;
  }[];
}
export interface Member {
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
