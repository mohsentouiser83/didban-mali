import type { SelectOption } from "@/components/ui/select";

export interface ControlSource {
  kind: "finding" | "invoice";
  id: string;
  title: string;
  code?: string;
  classification?: { kind: string; label: string };
  evidence_refs: string[];
  amount: string | null;
  remaining?: string | null;
  reference?: string;
  party_id?: string;
  due_date?: string | null;
  manifest_id?: string;
  as_of_date?: string | null;
  reason_codes?: string[];
}
export interface ControlCase {
  id: string;
  version: number;
  finding_id: string | null;
  invoice_id: string | null;
  assignee_membership_id: string | null;
  assignee_name: string | null;
  assignee_active: boolean;
  due_date: string | null;
  state: string;
  next_action: string;
  resolution_reason: string | null;
  source_snapshot: ControlSource;
}
export interface ControlActivity {
  id: string;
  kind: string;
  message: string;
  actor_name: string;
  created_at: string;
  data: {
    promise_date?: string;
    amount?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
}
export interface ControlFinding {
  id: string;
  title: string;
  source: ControlSource;
  case: ControlCase | null;
}
export interface CollectionInvoice {
  id: string;
  reference: string;
  party_id: string;
  amount: string;
  remaining: string | null;
  due_date: string | null;
  overdue_days: number | null;
  evidence_refs: string[];
  case: ControlCase | null;
  ranked: boolean;
  history_lag_days?: number | null;
  history_event_count?: number;
  history_reason?: string | null;
}
export interface CollectionPage {
  items: CollectionInvoice[];
  page: number;
  page_size: number;
  total: number;
  manifest_id: string | null;
  as_of_date: string | null;
  priority_formula: string;
}
export interface ControlSelection {
  kind: "finding" | "invoice";
  subject_id: string;
  source: ControlSource;
  case: ControlCase | null;
}
export const caseStates: SelectOption[] = [
  { value: "open", label: "باز" },
  { value: "in_progress", label: "در حال رسیدگی" },
  { value: "resolved", label: "رسیدگی شد" },
  { value: "accepted", label: "پذیرفته‌شده با دلیل" },
];
export const activityKinds: SelectOption[] = [
  { value: "comment", label: "یادداشت" },
  { value: "document_request", label: "درخواست مدرک" },
  { value: "contact", label: "نتیجه تماس" },
  { value: "promise", label: "وعده پرداخت" },
];
export function controlStateLabel(state: string) {
  return caseStates.find((item) => item.value === state)?.label || "نامشخص";
}
export function activityKindLabel(kind: string) {
  return (
    activityKinds.find((item) => item.value === kind)?.label ||
    (kind === "created"
      ? "ایجاد پرونده"
      : kind === "updated"
        ? "تغییر پیگیری"
        : "فعالیت")
  );
}
export function invoiceSelection(
  invoice: CollectionInvoice,
  page: CollectionPage,
): ControlSelection {
  return {
    kind: "invoice",
    subject_id: invoice.id,
    case: invoice.case,
    source: {
      kind: "invoice",
      id: invoice.id,
      title: `فاکتور ${invoice.reference}`,
      reference: invoice.reference,
      party_id: invoice.party_id,
      amount: invoice.amount,
      remaining: invoice.remaining,
      due_date: invoice.due_date,
      evidence_refs: invoice.evidence_refs,
      manifest_id: page.manifest_id || undefined,
      as_of_date: page.as_of_date,
    },
  };
}
