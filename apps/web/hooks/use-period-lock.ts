"use client";
import { useState } from "react";
import { useResource } from "./use-resource";
import { usePagedResource } from "./use-paged-resource";
import { useCommand } from "./use-command";
import { useWorkspace } from "./workspace";
import type { PeriodTask } from "./use-period-tasks";
export interface PeriodChecklist {
  custom_items?: PeriodTask[];
  closed: boolean;
  version: number;
  can_close: boolean;
  can_reopen: boolean;
  draft_count: number;
  active_session_count: number;
  errors: { id: string; title: string; code: string }[];
  warnings: { id: string; title: string; code: string }[];
  ready_to_close: boolean;
  manifest_id: string | null;
  native_statement_id?: string | null;
  reporting_basis?: "native_book" | "imported_manifest";
  closing_journal_present?: boolean;
  checklist_digest?: string;
}
interface LockEvent {
  id: string;
  action: "closed" | "reopened";
  reason: string;
  created_at: string;
  actor_id: string;
}
export function usePeriodLock(periodId: string) {
  const w = useWorkspace();
  const base = w.companyPath(`financial-periods/${periodId}`);
  const resource = useResource<PeriodChecklist>(
    base ? base + "/checklist" : null,
  );
  const history = usePagedResource<LockEvent>(
    base ? base + "/lock-history" : null,
  );
  const command = useCommand();
  const [reason, setReason] = useState("");
  const [acceptance, setAcceptance] = useState<{
    digest?: string;
    checked: boolean;
  }>({ checked: false });
  const ack =
    acceptance.checked && acceptance.digest === resource.data?.checklist_digest;
  const setAck = (checked: boolean) =>
    setAcceptance({ checked, digest: resource.data?.checklist_digest });
  const canAct = resource.data?.closed
    ? resource.data.can_reopen
    : resource.data?.can_close;
  const disabled =
    command.busy ||
    !canAct ||
    !reason.trim() ||
    (!resource.data?.closed &&
      (!resource.data?.ready_to_close ||
        (!!resource.data?.warnings.length && !ack)));
  function transition() {
    if (disabled) return;
    void command.run(
      base + (resource.data?.closed ? "/reopen" : "/close"),
      {
        version: resource.data?.version,
        body: {
          reason: reason.trim(),
          acknowledge_warnings: ack,
          ...(resource.data?.checklist_digest
            ? { expected_checklist_digest: resource.data.checklist_digest }
            : {}),
        },
      },
      () => {
        setReason("");
        setAck(false);
        resource.refresh();
        history.refresh();
      },
      resource.data?.closed ? "دوره بازگشایی شد." : "دوره بسته شد.",
    );
  }
  return {
    resource,
    history,
    command,
    reason,
    setReason,
    ack,
    setAck,
    canAct,
    disabled,
    transition,
    nativeReportHref: resource.data?.native_statement_id
      ? `/api/v1${w.companyPath(`accounting/statements/${resource.data.native_statement_id}/export?format=pdf`)}`
      : null,
  };
}
