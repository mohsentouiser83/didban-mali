"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { useWorkspace } from "./workspace";
import { usePagedResource } from "./use-paged-resource";
import { useCommand } from "./use-command";
import { amount, displayDate, persian } from "@/lib/utils";

export interface ManualGroupRow {
  id: string;
  source_row_id: string;
  account: string;
  date: string;
  reference: string;
  party_id: string;
  amount: string;
}
export interface ManualGroupPreview {
  id: string;
  digest: string;
  version: number;
  status: string;
  current: boolean;
  reason: string | null;
  snapshot: {
    banks: ManualGroupRow[];
    ledgers: ManualGroupRow[];
    bank_ids: string[];
    ledger_ids: string[];
    bank_total: string;
    ledger_total: string;
    difference: string;
    can_accept: boolean;
    dates: string[];
    reason_codes: string[];
    evidence_refs: string[];
  };
}
type Side = "bank" | "ledger";
interface Editor {
  scope: string;
  banks: ManualGroupRow[];
  ledgers: ManualGroupRow[];
  reason: string;
  preview: ManualGroupPreview | null;
}
const blank = (scope: string): Editor => ({ scope, banks: [], ledgers: [], reason: "", preview: null });

export function useManualGroups(runId: string, onDecided?: () => void) {
  const workspace = useWorkspace();
  const scope = `${workspace.user?.id}:${workspace.company?.id}:${runId}`;
  const live = useRef({ scope, canWrite: workspace.canWrite });
  useLayoutEffect(() => { live.current = { scope, canWrite: workspace.canWrite }; }, [scope, workspace.canWrite]);
  const [opened, setOpened] = useState("");
  const open = opened === scope;
  const [editor, setEditor] = useState<Editor>(() => blank(scope));
  const current = editor.scope === scope ? editor : blank(scope);
  const command = useCommand();
  const [queries, setQueries] = useState({ scope, bank: "", ledger: "" });
  const query = queries.scope === scope ? queries : { scope, bank: "", ledger: "" };
  const base = workspace.companyPath("reconciliation-manual-groups");
  const bankOptions = usePagedResource<ManualGroupRow>(open && base ? `${base}/options?run_id=${encodeURIComponent(runId)}&side=bank&q=${encodeURIComponent(query.bank)}` : null);
  const ledgerOptions = usePagedResource<ManualGroupRow>(open && base ? `${base}/options?run_id=${encodeURIComponent(runId)}&side=ledger&q=${encodeURIComponent(query.ledger)}` : null);
  const history = usePagedResource<ManualGroupPreview>(open && base ? `${base}/previews` : null);
  const available = (side: Side) => side === "bank" ? bankOptions : ledgerOptions;
  function change(patch: Partial<Editor>) {
    setEditor(previous => ({ ...(previous.scope === scope ? previous : blank(scope)), ...patch }));
  }
  const valid = () => live.current.scope === scope && live.current.canWrite;
  function add(side: Side, id: string) {
    if (!valid() || command.busy) return;
    const row = available(side).data?.items.find(item => item.id === id);
    if (!row) return;
    const key = side === "bank" ? "banks" : "ledgers";
    setEditor(previous => {
      const value = previous.scope === scope ? previous : blank(scope);
      if (value[key].some(item => item.id === id) || value[key].length >= 100) return value;
      return { ...value, [key]: [...value[key], row], preview: null, reason: "" };
    });
    command.clearError();
  }
  function remove(side: Side, id: string) {
    if (!valid() || command.busy) return;
    const key = side === "bank" ? "banks" : "ledgers";
    setEditor(previous => {
      const value = previous.scope === scope ? previous : blank(scope);
      return { ...value, [key]: value[key].filter(item => item.id !== id), preview: null, reason: "" };
    });
    command.clearError();
  }
  const canPreview = workspace.canWrite && !command.busy && current.banks.length > 0 && current.ledgers.length > 0
    && (current.banks.length > 1 || current.ledgers.length > 1);
  function preview() {
    if (!canPreview || !valid()) return;
    change({ preview: null, reason: "" });
    void command.run<ManualGroupPreview>(base ? `${base}/previews` : null,
      { body: { run_id: runId, bank_ids: current.banks.map(item => item.id), ledger_ids: current.ledgers.map(item => item.id) } },
      result => {
        if (live.current.scope !== scope) return;
        change({ preview: result });
        history.refresh();
      });
  }
  function view(item: ManualGroupPreview) {
    if (command.busy) return;
    change({ preview: null, reason: "" });
    void command.run<ManualGroupPreview>(base ? `${base}/previews/${item.id}` : null, { method: "GET" }, result => {
      if (live.current.scope !== scope) return;
      change({ preview: result, banks: result.snapshot.banks, ledgers: result.snapshot.ledgers, reason: "" });
    });
  }
  const canDecide = !!current.preview && workspace.canWrite && !command.busy && !!current.reason.trim()
    && command.error?.code !== "version_conflict";
  const canAccept = canDecide && !!current.preview?.current && !!current.preview?.snapshot.can_accept;
  function decide(decision: "accepted" | "rejected") {
    if (!valid() || !canDecide || !current.preview || (decision === "accepted" && !canAccept)) return;
    const selected = current.preview;
    void command.run<ManualGroupPreview>(base ? `${base}/previews/${selected.id}/decisions` : null,
      { version: selected.version, body: { expected_digest: selected.digest, expected_version: selected.version, decision, reason: current.reason.trim() } },
      result => {
        if (live.current.scope !== scope) return;
        change({ preview: result, reason: "" });
        history.refresh();
        onDecided?.();
      }, "تصمیم گروه دستی ثبت شد.");
  }
  const optionLabels = (side: Side) => {
    const selected = new Set((side === "bank" ? current.banks : current.ledgers).map(item => item.id));
    return (available(side).data?.items || []).filter(item => !selected.has(item.id)).map(item => ({
      value: item.id,
      label: `${item.account} · ${item.reference || "بدون مرجع"} · ${displayDate(item.date)} · ${amount(item.amount)} ریال · ${item.party_id || "طرف نامشخص"}`,
    }));
  };
  return {
    workspace, command, open, current, bankOptions, ledgerOptions, history, canPreview, canDecide, canAccept,
    bankChoices: optionLabels("bank"), ledgerChoices: optionLabels("ledger"), query,
    openPanel: () => { setOpened(scope); setEditor(blank(scope)); command.clearError(); },
    close: () => { if (!command.busy) setOpened(""); },
    queryChange: (side: Side, value: string) => setQueries({ ...query, [side]: value }),
    add, remove, preview, view, decide,
    refreshSelected: () => { if (current.preview) view(current.preview); },
    setReason: (reason: string) => { change({ reason }); command.clearError(); },
    reset: () => { setEditor(blank(scope)); command.clearError(); },
    selectedDateLabels: current.preview?.snapshot.dates.map(displayDate).join("، ") || "",
    historyRows: (history.data?.items || []).map(item => ({ ...item,
      label: `${persian(item.snapshot.bank_ids.length)} بانک / ${persian(item.snapshot.ledger_ids.length)} دفتر · ${amount(item.snapshot.bank_total)} ریال`,
    })),
  };
}
export type ManualGroupController = ReturnType<typeof useManualGroups>;
