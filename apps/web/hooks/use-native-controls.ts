"use client";
import { useState } from "react";
import { useWorkspace } from "./workspace";
import { useResource } from "./use-resource";
import { usePagedResource } from "./use-paged-resource";
import { useCommand } from "./use-command";

export interface NativeAuditJournal {
  journal_id: string;
  sequence: number;
  digest: string;
  date: string;
  approved_draft_version: number;
}
interface Finding {
  id: string;
  title: string;
  detail: string;
  classification: "review" | "data_limitation";
  amount: string;
  amount_label: string;
  journal_refs: NativeAuditJournal[];
}
interface ExpenseRow {
  account_id: string;
  code: string;
  name: string;
  current: string;
  previous: string;
  difference: string;
  journal_refs: NativeAuditJournal[];
}
interface AuditSnapshot {
  basis: "native_book";
  period_id: string;
  period: { name: string; start: string; end: string };
  findings: Finding[];
  finding_count: number;
  journal_refs: NativeAuditJournal[];
  role_assignments: unknown[];
  expense_comparison: {
    status: string;
    reason: string | null;
    current_total: string | null;
    previous_total: string | null;
    difference: string | null;
    rows: ExpenseRow[];
    previous_period: { name: string; start: string; end: string } | null;
  };
}
interface AuditRun {
  id: string;
  created_at: string;
  digest: string;
  trigger: string;
  snapshot: AuditSnapshot;
}
export function useNativeControls() {
  const workspace = useWorkspace();
  const [chosenPeriod, setPeriod] = useState("");
  const periodId =
    chosenPeriod || workspace.periodId || workspace.periods[0]?.id || "";
  const base = workspace.companyPath("accounting/native-controls");
  const scope = `${workspace.user?.id}:${workspace.company?.id}:${periodId}`;
  const live = useResource<AuditSnapshot>(
    base && periodId ? `${base}?period_id=${periodId}` : null,
  );
  const history = usePagedResource<AuditRun>(
    base && periodId ? `${base}/runs?period_id=${periodId}` : null,
  );
  const [selectedRun, setSelectedRun] = useState<{
    scope: string;
    id: string;
  } | null>(null);
  const runId = selectedRun?.scope === scope ? selectedRun.id : null;
  const detail = useResource<AuditRun>(
    base && runId ? `${base}/runs/${runId}` : null,
  );
  const snapshot = runId ? detail.data?.snapshot : live.data;
  const resource = runId ? detail : live;
  const command = useCommand();
  const key = JSON.stringify([
    scope,
    runId,
    snapshot?.journal_refs,
    snapshot?.role_assignments,
  ]);
  const [pageState, setPage] = useState({ key: "", findings: 0, expenses: 0 });
  const pages =
    pageState.key === key ? pageState : { key, findings: 0, expenses: 0 };
  const [evidence, setEvidence] = useState<{
    key: string;
    title: string;
    refs: NativeAuditJournal[];
    page: number;
  } | null>(null);
  const activeEvidence = evidence?.key === key ? evidence : null;
  function save() {
    void command.run<AuditRun>(
      base ? `${base}/runs` : null,
      { body: { period_id: periodId } },
      (run) => {
        setSelectedRun({ scope, id: run.id });
        history.refresh();
        live.refresh();
      },
      "بررسی دفتر اصلی ذخیره شد.",
    );
  }
  return {
    workspace,
    periodId,
    setPeriod,
    live,
    history,
    detail,
    snapshot,
    resource,
    command,
    runId,
    save,
    refresh: () => {
      setSelectedRun(null);
      live.refresh();
      history.refresh();
    },
    selectRun: (id: string) => setSelectedRun({ scope, id }),
    findingPage: pages.findings,
    expensePage: pages.expenses,
    findingRows:
      snapshot?.findings.slice(
        pages.findings * 25,
        (pages.findings + 1) * 25,
      ) || [],
    expenseRows:
      snapshot?.expense_comparison.rows.slice(
        pages.expenses * 25,
        (pages.expenses + 1) * 25,
      ) || [],
    pageFindings: (delta: number) =>
      setPage({ ...pages, findings: Math.max(0, pages.findings + delta) }),
    pageExpenses: (delta: number) =>
      setPage({ ...pages, expenses: Math.max(0, pages.expenses + delta) }),
    evidence: activeEvidence,
    evidenceRows:
      activeEvidence?.refs.slice(
        activeEvidence.page * 25,
        (activeEvidence.page + 1) * 25,
      ) || [],
    openEvidence: (title: string, refs: NativeAuditJournal[]) =>
      setEvidence({ key, title, refs, page: 0 }),
    closeEvidence: () => setEvidence(null),
    pageEvidence: (delta: number) =>
      activeEvidence &&
      setEvidence({
        ...activeEvidence,
        page: Math.max(0, activeEvidence.page + delta),
      }),
    periodOptions: workspace.periods.map((period) => ({
      value: period.id,
      label: period.name,
    })),
  };
}
export type NativeControlsController = ReturnType<typeof useNativeControls>;
