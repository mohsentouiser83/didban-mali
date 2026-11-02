"use client";
import { useMemo, useState } from "react";
import { useFinancialView } from "./use-financial-view";
import { useResource } from "./use-resource";
import { useCommand } from "./use-command";
import type { Metric, ResourceList } from "@/lib/api";
import type {
  CashScenario,
  FrozenForecast,
  Hypothetical,
  ScenarioEvaluation,
} from "@/lib/cash-scenarios";
import { forecastAssumptionLabel } from "@/lib/financial-presentation";
export function useCashScenarios() {
  const view = useFinancialView("forecast");
  const base = view.workspace.companyPath("cashflow-scenarios");
  const scope = view.workspace.company?.id || "";
  const [page, setPage] = useState<{ scope: string; cursor: string | null }>({
    scope: "",
    cursor: null,
  });
  const cursor = page.scope === scope ? page.cursor : null;
  const list = useResource<ResourceList<CashScenario>>(
    base
      ? base + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : "")
      : null,
  );
  const [editing, setEditing] = useState<{
    scope: string;
    item: CashScenario | null;
    name: string;
    shifts: Record<string, string>;
    hypothetical: Hypothetical[];
  }>({ scope: "", item: null, name: "", shifts: {}, hypothetical: [] });
  const local =
    editing.scope === scope
      ? editing
      : { scope, item: null, name: "", shifts: {}, hypothetical: [] };
  const manifestId = local.item?.manifest_id || view.manifest?.id;
  const frozen = useResource<FrozenForecast>(
    base && manifestId ? `${base}/baseline/${manifestId}` : null,
    { allowMissing: true },
  );
  const baseline = local.item?.baseline || frozen.data;
  const command = useCommand();
  const evaluation = useResource<ScenarioEvaluation>(
    base && local.item && view.manifest
      ? `${base}/${local.item.id}/evaluation?actual_manifest_id=${view.manifest.id}`
      : null,
  );
  const set = (patch: Partial<typeof local>) =>
    setEditing({ ...local, ...patch, scope });
  const load = (item: CashScenario | null) => {
    command.clearError();
    setEditing({
      scope,
      item,
      name: item?.name || "",
      shifts: Object.fromEntries(
        (item?.changes.shifts || []).map((row) => [row.event_id, row.date]),
      ),
      hypothetical: item?.changes.hypothetical || [],
    });
  };
  const save = async () => {
    if (!baseline) return;
    await command.run<CashScenario>(
      base + (local.item ? `/${local.item.id}` : ""),
      {
        method: local.item ? "PATCH" : "POST",
        version: local.item?.version,
        body: {
          name: local.name.trim(),
          manifest_id: baseline.manifest_id,
          shifts: Object.entries(local.shifts).map(([event_id, date]) => ({
            event_id,
            date,
          })),
          hypothetical: local.hypothetical,
        },
      },
      (result) => {
        if (view.workspace.company?.id !== scope) return;
        load(result);
        list.refresh();
      },
      "سناریو ذخیره شد.",
    );
  };
  const assumptions = useMemo(
    () => (baseline?.assumptions || []).map(forecastAssumptionLabel),
    [baseline],
  );
  const comparisonMetrics: Metric[] = local.item
    ? [
        {
          metric_key: "scenario_closing",
          value: local.item.comparison.scenario.closing,
        },
        {
          metric_key: "scenario_minimum",
          value: local.item.comparison.scenario.minimum,
        },
        {
          metric_key: "scenario_difference",
          value: local.item.comparison.closing_difference,
        },
      ].map((item) => ({
        ...item,
        status: "estimated",
        basis: "scenario",
        unit: "IRR",
        reason_codes: [],
      }))
    : [];
  return {
    comparisonMetrics,
    view,
    list,
    baseline,
    baselineLoading: frozen.loading,
    baselineError: frozen.error,
    refreshBaseline: frozen.refresh,
    local,
    command,
    evaluation,
    assumptions,
    save,
    load,
    set,
    next: () => setPage({ scope, cursor: list.data?.next_cursor || null }),
    first: () => setPage({ scope, cursor: null }),
    canWrite: view.workspace.company?.role !== "viewer",
    updateHypothetical: (index: number, patch: Partial<Hypothetical>) =>
      set({
        hypothetical: local.hypothetical.map((row, i) =>
          i === index ? { ...row, ...patch } : row,
        ),
      }),
    addHypothetical: () =>
      set({
        hypothetical: [
          ...local.hypothetical,
          {
            label: "",
            date: baseline?.start || "",
            direction: "payment",
            amount: "",
            unit: view.workspace.unit,
          },
        ],
      }),
    removeHypothetical: (index: number) =>
      set({ hypothetical: local.hypothetical.filter((_, i) => i !== index) }),
  };
}
export type CashScenariosController = ReturnType<typeof useCashScenarios>;
