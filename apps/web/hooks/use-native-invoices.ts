"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { useWorkspace } from "./workspace";
import { useResource } from "./use-resource";
import { useCommand } from "./use-command";
import { usePagedResource } from "./use-paged-resource";
import { addExactAmounts } from "@/lib/financial-presentation";
import { amount, displayDate } from "@/lib/utils";
import type { Metric } from "@/lib/api";
import {
  emptyTerms,
  tehranToday,
  compareInvoiceAmounts,
  termsValid,
  termsPayload,
  type InvoiceDirection,
  type InvoiceTermsInput,
  type NativeInvoice,
  type NativeInvoiceCandidate,
  type NativeInvoiceReport,
} from "@/lib/native-invoices";

export function useNativeInvoices(
  direction: InvoiceDirection,
  followups = false,
) {
  const workspace = useWorkspace();
  const scope = `${workspace.user?.id}:${workspace.company?.id}:${direction}`;
  const live = useRef({ scope, canWrite: workspace.canWrite });
  useLayoutEffect(() => {
    live.current = { scope, canWrite: workspace.canWrite };
  }, [scope, workspace.canWrite]);
  const [asOf, setAsOf] = useState(tehranToday);
  const base = workspace.companyPath("accounting/native-invoices");
  const [priority, setPriority] = useState<"amount" | "history">("amount");
  const report = useResource<NativeInvoiceReport>(
    base
      ? `${base}?direction=${direction}&as_of=${asOf}${followups ? `&priority=${priority}` : ""}`
      : null,
  );
  const ledger = useResource<{ metrics: Metric[] }>(
    workspace.periodId
      ? `${workspace.companyPath("accounting/statements/preview")}?period_id=${workspace.periodId}&as_of=${asOf}`
      : null,
  );
  const candidates = useResource<{ items: NativeInvoiceCandidate[] }>(
    base
      ? `${base}/candidates?kind=${direction === "sale" ? "sale_service" : "purchase_service"}`
      : null,
  );
  const payments = useResource<{ items: NativeInvoiceCandidate[] }>(
    base
      ? `${base}/candidates?kind=${direction === "sale" ? "receipt" : "payment"}`
      : null,
  );
  const snapshots = usePagedResource<{
    id: string;
    digest: string;
    created_at: string;
    payload: NativeInvoiceReport;
  }>(base ? `${base}/snapshots` : null);
  const command = useCommand();
  const [snapshotId, setSnapshotId] = useState("");
  const [requestedSnapshotPage, setSnapshotPage] = useState(0);
  const savedSnapshot = useResource<{
    id: string;
    digest: string;
    payload: NativeInvoiceReport;
  }>(snapshotId && base ? `${base}/snapshots/${snapshotId}` : null);
  const snapshotTotal = savedSnapshot.data?.payload.items.length || 0;
  const snapshotPage = Math.min(
    requestedSnapshotPage,
    Math.max(0, Math.ceil(snapshotTotal / 25) - 1),
  );
  const [selectedId, setSelectedId] = useState("");
  const detail = useResource<NativeInvoice>(
    selectedId && base ? `${base}/${selectedId}?as_of=${asOf}` : null,
  );
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const filtered = (report.data?.items || []).filter((row) =>
    `${row.reference} ${row.party_id}`.includes(query),
  );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / 25) - 1),
  );
  const rows = filtered.slice(currentPage * 25, (currentPage + 1) * 25);
  const valid = () => live.current.scope === scope && live.current.canWrite;
  function refresh() {
    report.refresh();
    detail.refresh();
    candidates.refresh();
    payments.refresh();
  }
  const [termsEditor, setTermsEditor] = useState<{
    scope: string;
    id: string | null;
    expectedVersion: number;
    operationId: string;
    terms: InvoiceTermsInput;
  } | null>(null);
  const editor = termsEditor?.scope === scope ? termsEditor : null;
  const changeTerms = (patch: Partial<InvoiceTermsInput>) => {
    if (editor)
      setTermsEditor({ ...editor, terms: { ...editor.terms, ...patch } });
    command.clearError();
  };
  function openTerms(invoice?: NativeInvoice) {
    if (!valid()) return;
    setTermsEditor({
      scope,
      id: invoice?.id || null,
      expectedVersion: invoice?.version || 1,
      operationId: invoice?.source.operation_id || "",
      terms: invoice?.terms
        ? {
            ...invoice.terms,
            due_date: invoice.terms.due_date || "",
            expected_date: invoice.terms.expected_date || "",
            expected_mode: invoice.terms.expected_unknown
              ? "unknown"
              : invoice.terms.expected_date
                ? "date"
                : "history",
            effective_date: asOf,
            reason: "",
          }
        : { ...emptyTerms(), effective_date: asOf },
    });
    command.clearError();
  }
  const selectedCandidate = candidates.data?.items.find(
    (item) => item.operation_id === editor?.operationId,
  );
  const canSaveTerms =
    workspace.canWrite &&
    !command.busy &&
    !!editor &&
    termsValid(editor.terms) &&
    (editor.id
      ? !!editor.terms.reason.trim() &&
        !!editor.terms.effective_date &&
        detail.data?.id === editor.id
      : !!selectedCandidate);
  function saveTerms() {
    if (!valid() || !canSaveTerms || !editor) return;
    const target = editor.id ? `${base}/${editor.id}/terms` : base;
    const body = editor.id
      ? {
          ...termsPayload(editor.terms),
          effective_date: editor.terms.effective_date,
          reason: editor.terms.reason.trim(),
        }
      : {
          ...termsPayload(editor.terms),
          operation_id: selectedCandidate!.operation_id,
          journal_digest: selectedCandidate!.journal_digest,
          reference: selectedCandidate!.reference,
        };
    void command.run<NativeInvoice>(
      target,
      {
        method: editor.id ? "PATCH" : "POST",
        body,
        ...(editor.id ? { version: editor.expectedVersion } : {}),
      },
      (result) => {
        if (!valid()) return;
        if (result.id === selectedId && result.as_of === asOf) detail.replace(result);
        setTermsEditor(null);
        setSelectedId(result.id);
        refresh();
      },
      "شرایط فاکتور ذخیره شد.",
    );
  }
  const reminderGeneration = useRef(0);
  const [reminder, setReminder] = useState<{
    invoiceId: string;
    digest: string;
    text: string;
    copied: boolean;
    error: string;
  } | null>(null);
  function prepareReminder() {
    if (!valid() || !detail.data) return;
    const invoiceId = detail.data.id;
    const generation = ++reminderGeneration.current;
    void command.run<{ digest: string; text: string }>(
      `${base}/${invoiceId}/reminder`,
      { method: "GET" },
      (result) => {
        if (valid() && reminderGeneration.current === generation)
          setReminder({
            invoiceId,
            digest: result.digest,
            text: result.text,
            copied: false,
            error: "",
          });
      },
    );
  }
  async function copyReminder() {
    if (!valid() || !reminder || !reminder.text.trim()) return;
    const current = reminder;
    const generation = reminderGeneration.current;
    const fresh = await command.run<{ digest: string }>(
      `${base}/${current.invoiceId}/reminder`,
      { method: "GET" },
    );
    if (!valid() || !fresh || reminderGeneration.current !== generation) return;
    if (fresh.digest !== current.digest) {
      setReminder({
        ...current,
        error: "مانده یا نسخه تغییر کرده؛ پیش‌نویس تازه بسازید.",
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(current.text);
      if (valid() && reminderGeneration.current === generation)
        setReminder({ ...current, copied: true, error: "" });
    } catch {
      if (valid() && reminderGeneration.current === generation)
        setReminder({
          ...current,
          error: "کپی انجام نشد؛ متن را دستی انتخاب کنید.",
        });
    }
  }
  const [sourceEditor, setSourceEditor] = useState<{
    invoiceId: string;
    expectedVersion: number;
    journalId: string;
    reason: string;
  } | null>(null);
  const sourceRevision =
    sourceEditor?.invoiceId === detail.data?.id ? sourceEditor : null;
  const sourceCandidates = useResource<{ items: NativeInvoiceCandidate[] }>(
    sourceRevision && base
      ? `${base}/${sourceRevision.invoiceId}/source-candidates`
      : null,
  );
  const selectedSource = sourceCandidates.data?.items.find(
    (item) => item.journal_id === sourceRevision?.journalId,
  );
  const hasActiveAllocations = !!detail.data?.allocations.some(
    (item) => !item.reversed,
  );
  const canAdoptSource =
    workspace.canWrite &&
    !command.busy &&
    !!sourceRevision &&
    !!selectedSource &&
    !!sourceRevision.reason.trim() &&
    !hasActiveAllocations;
  function adoptSource() {
    if (!valid() || !canAdoptSource || !sourceRevision || !selectedSource)
      return;
    void command.run<NativeInvoice>(
      `${base}/${sourceRevision.invoiceId}/source-revisions`,
      {
        version: sourceRevision.expectedVersion,
        body: {
          journal_id: selectedSource.journal_id,
          journal_digest: selectedSource.journal_digest,
          approved_draft_version: selectedSource.approved_draft_version,
          reason: sourceRevision.reason.trim(),
        },
      },
      () => {
        if (valid()) {
          setSourceEditor(null);
          refresh();
        }
      },
      "سند جایگزین به فاکتور پیوند خورد.",
    );
  }
  const [allocationEditor, setAllocationEditor] = useState<{
    invoiceId: string;
    expectedVersion: number;
    operationId: string;
    journalId: string;
    amount: string;
    reversalId: string;
    reason: string;
  } | null>(null);
  const allocation =
    allocationEditor?.invoiceId === detail.data?.id ? allocationEditor : null;
  const chosenPayment = payments.data?.items.find(
    (row) => row.journal_id === allocation?.journalId,
  );
  const paymentOptions = (payments.data?.items || [])
    .filter(
      (row) =>
        row.party_id === detail.data?.party_id &&
        compareInvoiceAmounts(row.remaining_capacity, "0") > 0,
    )
    .map((row) => ({
      value: row.journal_id,
      label: `${row.reference} · ${displayDate(row.date)} · ${amount(row.remaining_capacity)} ریال${row.replacement_of ? " · سند جایگزین" : ""}`,
    }));
  const canSettle =
    workspace.canWrite &&
    !command.busy &&
    !!detail.data &&
    !!allocation &&
    (allocation.reversalId
      ? !!allocation.reason.trim()
      : detail.data.status === "available" &&
        !!chosenPayment &&
        /^\d+(?:\.\d+)?$/.test(allocation.amount) &&
        !/^0+(?:\.0+)?$/.test(allocation.amount));
  function settle() {
    if (!valid() || !canSettle || !allocation || !detail.data) return;
    const invoice = detail.data;
    const path = `${base}/${invoice.id}/allocations${allocation.reversalId ? `/${allocation.reversalId}/reversal` : ""}`;
    const body = allocation.reversalId
      ? { reason: allocation.reason.trim() }
      : {
          operation_id: chosenPayment!.operation_id,
          journal_id: chosenPayment!.journal_id,
          journal_digest: chosenPayment!.journal_digest,
          amount: allocation.amount,
        };
    void command.run<NativeInvoice>(
      path,
      { version: allocation.expectedVersion, body },
      () => {
        if (!valid()) return;
        setAllocationEditor(null);
        refresh();
      },
      allocation.reversalId ? "تخصیص برگشت شد." : "تخصیص ثبت شد.",
    );
  }
  const invoiceValue = (report.data?.items || []).reduce<string | null>(
    (total, row) => addExactAmounts(total, row.remaining),
    "0",
  );
  const invoiceMetric: Metric = {
    metric_key: direction === "sale" ? "ar_invoice" : "ap_invoice",
    value: invoiceValue,
    unit: "IRR",
    status: invoiceValue === null ? "unavailable" : "available",
    basis: "native_invoice",
    reason_codes:
      invoiceValue === null ? ["native_invoice_source_changed"] : [],
    reason:
      invoiceValue === null
        ? "سند بعضی فاکتورها برگشت شده؛ مانده کامل قابل محاسبه نیست."
        : null,
  };
  const ledgerKey = direction === "sale" ? "ar_ledger" : "ap_trade_ledger";
  const sourceLedger = ledger.data?.metrics.find(
    (item) =>
      item.metric_key ===
      (direction === "sale"
        ? "trade_receivable_balance"
        : "trade_payable_balance"),
  );
  const ledgerMetric: Metric = sourceLedger
    ? {
        ...sourceLedger,
        metric_key: ledgerKey,
        basis: "native_book",
        reason:
          sourceLedger.value === null
            ? sourceLedger.reason_codes?.includes(
                "unclassified_balance_accounts",
              )
              ? "نقش بعضی حساب‌ها مشخص نیست؛ ماندهٔ کامل دفتر قابل محاسبه نیست."
              : "افتتاحیهٔ معتبر یا کامل موجود نیست؛ ماندهٔ دفتر قابل محاسبه نیست."
            : null,
      }
    : {
        metric_key: ledgerKey,
        value: null,
        basis: "native_book",
        unit: "IRR",
        status: "unavailable",
        reason_codes: [
          workspace.periodId ? "native_ledger_unavailable" : "period_missing",
        ],
        reason: workspace.periodId
          ? ledger.error?.message || "ماندهٔ دفتر در این تاریخ موجود نیست."
          : "برای محاسبهٔ ماندهٔ دفتر، دوره را انتخاب کنید.",
      };
  return {
    workspace,
    scope,
    priority,
    setPriority,
    command,
    report,
    ledger,
    candidates,
    payments,
    snapshots,
    detail,
    rows,
    query,
    asOf,
    currentPage,
    total: filtered.length,
    editor,
    allocation,
    paymentOptions,
    canSaveTerms,
    canSettle,
    sourceRevision,
    sourceCandidates,
    selectedSource,
    hasActiveAllocations,
    canAdoptSource,
    adoptSource,
    openSourceRevision: () => {
      if (valid() && detail.data) {
        setSourceEditor({
          invoiceId: detail.data.id,
          expectedVersion: detail.data.version,
          journalId: "",
          reason: "",
        });
        command.clearError();
      }
    },
    closeSourceRevision: () => {
      if (!command.busy) setSourceEditor(null);
    },
    changeSourceRevision: (patch: { journalId?: string; reason?: string }) => {
      if (sourceRevision) setSourceEditor({ ...sourceRevision, ...patch });
      command.clearError();
    },
    reminder,
    prepareReminder,
    copyReminder,
    closeReminder: () => {
      reminderGeneration.current++;
      setReminder(null);
    },
    changeReminder: (text: string) => {
      if (reminder)
        setReminder({ ...reminder, text, copied: false, error: "" });
    },
    snapshotId,
    savedSnapshot,
    selectSnapshot: (id: string) => {
      setSnapshotId(id);
      setSnapshotPage(0);
    },
    snapshotPage,
    snapshotTotal,
    snapshotRows: (savedSnapshot.data?.payload.items || []).slice(
      snapshotPage * 25,
      (snapshotPage + 1) * 25,
    ),
    previousSnapshotPage: () => setSnapshotPage(Math.max(0, snapshotPage - 1)),
    nextSnapshotPage: () => setSnapshotPage(snapshotPage + 1),
    metrics: [invoiceMetric, ledgerMetric],
    ledgerKey,
    candidateOptions: (candidates.data?.items || []).map((row) => ({
      value: row.operation_id,
      label: `${row.reference} · ${row.party_id} · ${amount(row.amount)} ریال`,
    })),
    selectedCandidate,
    direction,
    openTerms,
    changeTerms,
    saveTerms,
    selectExpectedMode: (mode: string) => {
      if (mode === "date" || mode === "history" || mode === "unknown")
        changeTerms({
          expected_mode: mode,
          expected_unknown: mode === "unknown",
          expected_date:
            mode === "date" ? editor?.terms.expected_date || "" : "",
        });
    },
    settle,
    refresh,
    selectCandidate: (operationId: string) => {
      if (editor) setTermsEditor({ ...editor, operationId });
    },
    closeTerms: () => {
      if (!command.busy) setTermsEditor(null);
    },
    setQuery: (value: string) => {
      setQuery(value);
      setPage(0);
    },
    setAsOf: (value: string) => {
      if (value) {
        setAsOf(value);
        setSelectedId("");
        setTermsEditor(null);
        setAllocationEditor(null);
      }
    },
    previous: () => setPage(currentPage - 1),
    next: () => setPage(currentPage + 1),
    select: (id: string) => {
      setSelectedId(id);
      setAllocationEditor(null);
    },
    closeDetail: () => setSelectedId(""),
    openAllocation: (reversalId = "") => {
      if (valid() && detail.data) {
        setAllocationEditor({
          invoiceId: detail.data.id,
          expectedVersion: detail.data.version,
          operationId: "",
          journalId: "",
          amount: "",
          reversalId,
          reason: "",
        });
        command.clearError();
      }
    },
    changeAllocation: (patch: Partial<NonNullable<typeof allocation>>) => {
      if (allocation) setAllocationEditor({ ...allocation, ...patch });
      command.clearError();
    },
    closeAllocation: () => {
      if (!command.busy) setAllocationEditor(null);
    },
    saveSnapshot: () => {
      if (valid())
        void command.run(
          base ? `${base}/snapshots` : null,
          { body: { as_of: asOf, direction } },
          snapshots.refresh,
          "نسخهٔ ثابت فاکتورها ذخیره شد.",
        );
    },
  };
}
export type NativeInvoicesController = ReturnType<typeof useNativeInvoices>;
