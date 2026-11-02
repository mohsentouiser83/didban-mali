"use client";
import { useState } from "react";
import { persian } from "@/lib/utils";
import { listItems, type ResourceList } from "@/lib/api";
import {
  activityKinds,
  invoiceSelection,
  type CollectionInvoice,
  type CollectionPage,
  type ControlActivity,
  type ControlCase,
  type ControlFinding,
  type ControlSelection,
} from "@/lib/control";
import { useCommand } from "./use-command";
import { usePagedResource } from "./use-paged-resource";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";
import { useCollectionReminder } from "./use-collection-reminder";

const historyReasonLabels: Record<string, string> = {
  receipt_history_insufficient: "کمتر از ۳ وصول معتبر در ۱۸۰ روز",
  receipt_history_ambiguous: "سابقه وصول متعارض",
  report_date_missing: "تاریخ مبنا مشخص نیست",
  report_date_future: "تاریخ گزارش در آینده است",
  receipt_history_mapping_ambiguous: "نگاشت سابقه وصول مبهم است",
};

export function useControlCasePanel(onSaved: () => void) {
  const workspace = useWorkspace();
  const command = useCommand();
  const [selection, setSelection] = useState<ControlSelection | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const detail = useResource<ControlCase>(
    caseId ? workspace.companyPath(`control/cases/${caseId}`) : null,
  );
  const activities = usePagedResource<ControlActivity>(
    caseId ? workspace.companyPath(`control/cases/${caseId}/activities`) : null,
  );
  const assignees = useResource<
    ResourceList<{ membership_id: string; name: string }>
  >(selection ? workspace.companyPath("control/assignees") : null);
  const currentCase = selection?.case || null;
  const newerVersionAvailable = !!(
    detail.data &&
    currentCase &&
    detail.data.version !== currentCase.version
  );
  const [value, setValue] = useState({
    assignee: "none",
    due_date: "",
    next_action: "",
    state: "open",
    reason: "",
  });
  const [activity, setActivity] = useState({
    kind: "comment",
    message: "",
    promise_date: "",
    promise_amount: "",
    unit: "IRR",
  });
  const [localError, setLocalError] = useState<string>();
  const [operationScope, setOperationScope] = useState<"case" | "activity">(
    "case",
  );
  function open(next: ControlSelection) {
    setSelection(next);
    setCaseId(next.case?.id || null);
    setValue({
      assignee: next.case?.assignee_membership_id || "none",
      due_date: next.case?.due_date || "",
      next_action: next.case?.next_action || "",
      state: next.case?.state || "open",
      reason: "",
    });
    setActivity({
      kind: "comment",
      message: "",
      promise_date: "",
      promise_amount: "",
      unit: "IRR",
    });
    setLocalError(undefined);
    command.clearError();
  }
  function saved(result: ControlCase, resetMetadata = true) {
    setSelection((previous) =>
      previous ? { ...previous, case: result } : previous,
    );
    setCaseId(result.id);
    detail.refresh();
    activities.refresh();
    onSaved();
    if (resetMetadata)
      setValue({
        assignee: result.assignee_membership_id || "none",
        due_date: result.due_date || "",
        next_action: result.next_action,
        state: result.state,
        reason: "",
      });
  }
  function save() {
    if (!selection || newerVersionAvailable) return;
    setOperationScope("case");
    setLocalError(undefined);
    if (currentCase && !value.reason.trim()) {
      setLocalError("دلیل تغییر را وارد کنید.");
      requestAnimationFrame(() =>
        document.getElementById("control-reason")?.focus(),
      );
      return;
    }
    const metadata = {
      assignee_membership_id: value.assignee === "none" ? null : value.assignee,
      due_date: value.due_date || null,
      next_action: value.next_action.trim(),
    };
    void command.run<ControlCase>(
      workspace.companyPath(
        `control/cases${currentCase ? `/${currentCase.id}` : ""}`,
      ),
      {
        method: currentCase ? "PATCH" : "POST",
        version: currentCase?.version,
        body: currentCase
          ? { ...metadata, state: value.state, reason: value.reason.trim() }
          : {
              ...metadata,
              kind: selection.kind,
              subject_id: selection.subject_id,
            },
      },
      saved,
      currentCase ? "پیگیری به‌روز شد." : "پروندهٔ پیگیری ایجاد شد.",
    );
  }
  function addActivity() {
    if (!currentCase || !activity.message.trim() || newerVersionAvailable)
      return;
    setOperationScope("activity");
    setLocalError(undefined);
    if (activity.kind === "promise" && !activity.promise_date) {
      setLocalError("تاریخ وعده را وارد کنید.");
      requestAnimationFrame(() =>
        document.getElementById("control-promise-date")?.focus(),
      );
      return;
    }
    void command.run<ControlCase>(
      workspace.companyPath(`control/cases/${currentCase.id}/activities`),
      {
        version: currentCase.version,
        body: {
          kind: activity.kind,
          message: activity.message.trim(),
          unit: activity.unit,
          promise_date:
            activity.kind === "promise" ? activity.promise_date : null,
          promise_amount:
            activity.kind === "promise" && activity.promise_amount
              ? activity.promise_amount
              : null,
        },
      },
      (result) => {
        saved(result, false);
        setActivity({
          ...activity,
          message: "",
          promise_date: "",
          promise_amount: "",
        });
      },
      "فعالیت ثبت شد.",
    );
  }
  const options = [
    { value: "none", label: "بدون مسئول" },
    ...listItems(assignees.data).map((member) => ({
      value: member.membership_id,
      label: member.name,
    })),
  ];
  if (
    currentCase?.assignee_membership_id &&
    !options.some(
      (option) => option.value === currentCase.assignee_membership_id,
    )
  )
    options.push({
      value: currentCase.assignee_membership_id,
      label: `${currentCase.assignee_name || "مسئول قبلی"} (غیرفعال)`,
    });
  const activityFieldErrors: Record<string, string> = {};
  if (operationScope === "activity") {
    if (localError && activity.kind === "promise" && !activity.promise_date)
      activityFieldErrors["control-promise-date"] = localError;
    if (
      command.error &&
      ["invalid_amount", "promise_amount_invalid"].includes(command.error.code)
    )
      activityFieldErrors["control-promise-amount"] = command.error.message;
  }
  return {
    workspace,
    selection,
    currentCase,
    source: currentCase?.source_snapshot || selection?.source,
    detail,
    activities,
    assignees,
    command,
    value,
    activity,
    caseError:
      operationScope === "case"
        ? localError || command.error?.message
        : undefined,
    activityFieldErrors,
    activityError:
      operationScope === "activity" && !Object.keys(activityFieldErrors).length
        ? localError || command.error?.message
        : undefined,
    newerVersionAvailable,
    assigneeOptions: options,
    reloadLatest: () => {
      if (detail.data) {
        saved(detail.data);
        command.clearError();
        setLocalError(undefined);
      }
    },
    activityOptions: activityKinds.filter(
      (kind) => selection?.kind === "invoice" || kind.value !== "promise",
    ),
    open,
    close: () => {
      setSelection(null);
      setCaseId(null);
    },
    save,
    addActivity,
    change: (patch: Partial<typeof value>) => {
      setValue((previous) => ({ ...previous, ...patch }));
      setLocalError(undefined);
      command.clearError();
    },
    changeActivity: (patch: Partial<typeof activity>) => {
      setActivity((previous) => ({ ...previous, ...patch }));
      setLocalError(undefined);
      command.clearError();
    },
    refresh: () => {
      detail.refresh();
      activities.refresh();
      assignees.refresh();
    },
  };
}
export function useControlReview() {
  const workspace = useWorkspace();
  const [scope, setScope] = useState("latest");
  const findings = usePagedResource<ControlFinding>(
    scope === "latest" ? workspace.companyPath("control/findings") : null,
  );
  const cases = usePagedResource<ControlCase>(
    scope === "cases"
      ? workspace.companyPath("control/cases?kind=finding")
      : null,
  );
  const resource = scope === "latest" ? findings : cases;
  const panel = useControlCasePanel(resource.refresh);
  const rows: ControlSelection[] =
    scope === "latest"
      ? listItems(findings.data).map((finding) => ({
          kind: "finding",
          subject_id: finding.id,
          source: finding.source,
          case: finding.case,
        }))
      : listItems(cases.data).map((item) => ({
          kind: "finding",
          subject_id: item.finding_id!,
          source: item.source_snapshot,
          case: item,
        }));
  return { workspace, scope, setScope, resource, panel, rows };
}
export function useCollectionFollowups() {
  const workspace = useWorkspace();
  const [scope, setScope] = useState("invoices");
  const [filter, setFilter] = useState({ query: "", page: 0, priority: "amount" });
  const resource = useResource<CollectionPage>(
    scope === "invoices"
      ? workspace.companyPath(
          `collection-assistant/queue?page=${filter.page}&q=${encodeURIComponent(filter.query)}&priority=${filter.priority}`,
        )
      : null,
  );
  const cases = usePagedResource<ControlCase>(
    scope === "cases"
      ? workspace.companyPath("control/cases?kind=invoice")
      : null,
  );
  const refresh = () => {
    resource.refresh();
    cases.refresh();
  };
  const panel = useControlCasePanel(refresh);
  const reminder = useCollectionReminder();
  return {
    workspace,
    scope,
    setScope,
    resource,
    cases,
    panel,
    reminder,
    priority: filter.priority,
    setPriority: (priority: string) =>
      setFilter((previous) => ({ ...previous, priority, page: 0 })),
    query: filter.query,
    page: filter.page,
    rows: (resource.data?.items || []).map((item) => ({
      ...item,
      historyLabel:
        item.history_lag_days !== undefined && item.history_lag_days !== null
          ? `${persian(item.history_lag_days)} روز`
          : historyReasonLabels[item.history_reason || ""] ||
            "سابقه معتبر موجود نیست",
      delayLabel:
        item.overdue_days !== null
          ? `${persian(item.overdue_days)} روز`
          : !item.due_date
            ? "سررسید نامشخص"
            : "تاریخ مبنای گزارش نامشخص",
    })),
    historicalCases: listItems(cases.data),
    setQuery: (query: string) =>
      setFilter((previous) => ({ ...previous, query, page: 0 })),
    previousPage: () =>
      setFilter((previous) => ({
        ...previous,
        page: Math.max(0, previous.page - 1),
      })),
    nextPage: () =>
      setFilter((previous) => ({ ...previous, page: previous.page + 1 })),
    openInvoice: (invoice: CollectionInvoice) => {
      if (resource.data) panel.open(invoiceSelection(invoice, resource.data));
    },
    openCase: (item: ControlCase) =>
      panel.open({
        kind: "invoice",
        subject_id: item.invoice_id!,
        source: item.source_snapshot,
        case: item,
      }),
  };
}
