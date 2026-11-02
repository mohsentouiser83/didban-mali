"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { useWorkspace } from "./workspace";
import { usePagedResource } from "./use-paged-resource";
import { useCommand } from "./use-command";
import { listItems, type Metric } from "@/lib/api";

export interface ComparisonGroup {
  id: string;
  name: string;
  company_ids: string[];
  version: number;
}
export interface ComparisonRun {
  id: string;
  group_version: number;
  snapshot: {
    title: string;
    limitation: string;
    period: { start: string; end: string };
    companies: { company_id: string; name: string; manifest_id: string | null; metrics: Metric[] }[];
  };
}

export function useCompanyComparison() {
  const workspace = useWorkspace();
  const scope = `${workspace.user?.id || ""}:${workspace.company?.id || ""}`;
  const liveScope = useRef(scope);
  useLayoutEffect(() => { liveScope.current = scope; }, [scope]);
  const base = workspace.companyPath("company-groups");
  const groups = usePagedResource<ComparisonGroup>(base);
  const history = usePagedResource<ComparisonRun>(base ? base + "/runs/history" : null);
  const command = useCommand();
  const [editing, setEditing] = useState<ComparisonGroup | null>();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [snapshot, setSnapshot] = useState<{ scope: string; run: ComparisonRun }>();
  const [period, setPeriod] = useState(workspace.periodId || workspace.periods[0]?.id || "");
  const [pagination, setPagination] = useState({ runId: "", page: 0 });
  const run = snapshot?.scope === scope ? snapshot.run : undefined;
  const comparisonRows = run?.snapshot.companies.flatMap(company => (
    company.metrics.map(metric => ({ company: company.name, company_id: company.company_id, ...metric }))
  )) || [];
  const maximumPage = Math.max(0, Math.ceil(comparisonRows.length / 25) - 1);
  const comparisonPage = Math.min(pagination.runId === run?.id ? pagination.page : 0, maximumPage);

  function open(item: ComparisonGroup | null) {
    setEditing(item);
    setName(item?.name || "");
    setSelected(item?.company_ids || [workspace.company!.id]);
    command.clearError();
  }
  function toggle(id: string) {
    setSelected(old => old.includes(id) ? old.filter(value => value !== id) : [...old, id]);
  }
  function save() {
    if (!base || !name.trim() || selected.length < 2) return;
    void command.run(base + (editing ? `/${editing.id}` : ""), {
      method: editing ? "PATCH" : "POST", version: editing?.version,
      body: { name: name.trim(), company_ids: selected },
    }, () => {
      if (liveScope.current !== scope) return;
      setEditing(undefined);
      groups.refresh();
    }, "گروه ذخیره شد.");
  }
  function receive(value: ComparisonRun) {
    if (liveScope.current !== scope) return;
    setSnapshot({ scope, run: value });
    setPagination({ runId: value.id, page: 0 });
  }
  function compare(group: ComparisonGroup) {
    if (!base || !period || command.busy || !workspace.canWrite) return;
    setSnapshot(undefined);
    void command.run<ComparisonRun>(base + `/${group.id}/runs`, {
      body: { period_id: period, expected_version: group.version },
    }, value => { receive(value); if (liveScope.current === scope) history.refresh(); }, "مقایسه آماده شد.");
  }
  function view(item: ComparisonRun) {
    if (!base || command.busy) return;
    // Never adopt an embedded history snapshot without rechecking all current
    // company memberships through the run-detail endpoint.
    setSnapshot(undefined);
    void command.run<ComparisonRun>(base + `/runs/${item.id}`, { method: "GET" }, receive);
  }
  return {
    workspace, groups, history, command, editing, name, setName, selected, toggle, open, save,
    close: () => setEditing(undefined), period, setPeriod, compare, view, run,
    rows: listItems(groups.data), historyRows: listItems(history.data),
    canManage: workspace.company?.role === "owner", canCompare: workspace.canWrite,
    periodOptions: workspace.periods.map(item => ({ value: item.id, label: item.name })),
    comparisonRows: comparisonRows.slice(comparisonPage * 25, (comparisonPage + 1) * 25),
    comparisonPage, comparisonTotal: comparisonRows.length,
    previousComparison: () => setPagination({ runId: run?.id || "", page: Math.max(0, comparisonPage - 1) }),
    nextComparison: () => setPagination({ runId: run?.id || "", page: Math.min(maximumPage, comparisonPage + 1) }),
    downloadPath: run ? `/api/v1${base}/runs/${run.id}/export` : undefined,
  };
}
export type CompanyComparisonController = ReturnType<typeof useCompanyComparison>;
