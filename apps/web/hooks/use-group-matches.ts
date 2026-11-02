"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { useWorkspace } from "./workspace";
import { useResource } from "./use-resource";
import { useCommand } from "./use-command";

export interface GroupMatch {
  id: string;
  bank_ids: string[];
  ledger_ids: string[];
  reference: string;
  bank_total: string;
  ledger_total: string;
  difference: string;
  dates: string[];
  can_accept: boolean;
  version: number;
  status: string;
  reason_codes: string[];
  evidence_refs: string[];
}
interface Selection {
  scope: string;
  item: GroupMatch;
  reason: string;
  decision: "accepted" | "rejected";
}

export function useGroupMatches(runId?: string, onDecided?: () => void) {
  const workspace = useWorkspace();
  const scope = `${workspace.company?.id || ""}:${runId || ""}`;
  const live = useRef({ scope, canWrite: workspace.canWrite });
  useLayoutEffect(() => {
    live.current = { scope, canWrite: workspace.canWrite };
  }, [scope, workspace.canWrite]);
  const resource = useResource<{ items: GroupMatch[] }>(
    runId
      ? workspace.companyPath(`reconciliation-groups?run_id=${encodeURIComponent(runId)}`)
      : null,
  );
  const command = useCommand();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pagination, setPagination] = useState({ scope: "", page: 0 });
  const current = selection?.scope === scope ? selection : null;
  const items = resource.data?.items || [];
  const maximumPage = Math.max(0, Math.ceil(items.length / 25) - 1);
  const page = Math.min(pagination.scope === scope ? pagination.page : 0, maximumPage);
  const selected = current?.item || null;
  const latestSelected = items.find(item => item.id === selected?.id);
  const newerVersionAvailable = !!(selected && latestSelected && selected.version !== latestSelected.version);
  const reason = current?.reason || "";
  const decision = current?.decision || "rejected";
  const options = [
    ...(selected?.can_accept ? [{ value: "accepted", label: "پذیرش گروه" }] : []),
    { value: "rejected", label: "رد / برگشت پذیرش گروه" },
  ];
  const canSubmit = !!(
    runId && selected && workspace.canWrite && !command.busy &&
    !resource.loading && !resource.error && !newerVersionAvailable && reason.trim() &&
    (decision === "rejected" || selected.can_accept)
  );

  function open(item: GroupMatch) {
    setSelection({ scope, item, reason: "", decision: item.can_accept ? "accepted" : "rejected" });
    command.clearError();
  }
  function submit() {
    if (!canSubmit || !selected || live.current.scope !== scope || !live.current.canWrite) return;
    return command.run(
      workspace.companyPath(`reconciliation-groups/${selected.id}/decisions`),
      {
        body: { run_id: runId, expected_version: selected.version, decision, reason: reason.trim() },
        version: selected.version,
      },
      () => {
        if (live.current.scope !== scope) return;
        setSelection(null);
        resource.refresh();
        onDecided?.();
      },
      "تصمیم گروه ثبت شد.",
    );
  }
  function patch(patch: Partial<Pick<Selection, "decision" | "reason">>) {
    setSelection(previous => previous?.scope === scope ? { ...previous, ...patch } : previous);
    command.clearError();
  }
  return {
    workspace, resource, command, selected, reason, decision, options, canSubmit, open, submit, newerVersionAvailable,
    adoptLatest: () => {
      if (!latestSelected) return;
      setSelection(previous => previous?.scope === scope ? {
        ...previous, item: latestSelected,
        decision: previous.decision === "accepted" && !latestSelected.can_accept ? "rejected" : previous.decision,
      } : previous);
      command.clearError();
    },
    setReason: (value: string) => patch({ reason: value }),
    setDecision: (value: string) => {
      if (value === "rejected" || (value === "accepted" && selected?.can_accept)) patch({ decision: value });
    },
    close: () => setSelection(null),
    rows: items.slice(page * 25, (page + 1) * 25),
    page, total: items.length,
    previous: () => setPagination({ scope, page: Math.max(0, page - 1) }),
    next: () => setPagination({ scope, page: Math.min(maximumPage, page + 1) }),
  };
}
