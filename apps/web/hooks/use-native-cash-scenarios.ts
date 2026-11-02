"use client";
import { useRef, useState } from "react";
import { useWorkspace } from "./workspace";
import { useResource } from "./use-resource";
import { usePagedResource } from "./use-paged-resource";
import { useCommand } from "./use-command";
import type { Metric } from "@/lib/api";
import type {
  CashScenario,
  Hypothetical,
  ScenarioEvent,
  ScenarioEvaluation,
} from "@/lib/cash-scenarios";
export interface NativeScenarioBaseline {
  native_statement_id: string;
  source_digest: string;
  forecast_run_id?: string;
  source_status?: "estimated" | "limited";
  reason_codes?: string[];
  as_of_date: string;
  start: string;
  end: string;
  horizon_days: number;
  opening: string;
  events: ScenarioEvent[];
  receipt_dates_inferred: false;
  financial_effect: false;
}
export interface NativeScenario {
  id: string;
  series_id: string;
  version: number;
  name: string;
  native_statement_id: string;
  baseline: NativeScenarioBaseline;
  changes: {
    hypothetical: Hypothetical[];
    shifts?: { event_id: string; date: string }[];
  };
  comparison: CashScenario["comparison"];
  comparison_projection?: {
    baseline: Partial<CashScenario["comparison"]["baseline"]>;
    scenario: Partial<CashScenario["comparison"]["scenario"]>;
    closing_difference: null;
    known_dated_closing_difference?: string;
    projection_scope: string;
  };
}
interface StatementSummary {
  id: string;
  digest: string;
  snapshot: { as_of: string; period_name?: string };
}
export function useNativeCashScenarios() {
  const workspace = useWorkspace();
  const base = workspace.companyPath("cashflow-scenarios/native");
  const statements = usePagedResource<StatementSummary>(
    workspace.companyPath("accounting/statements"),
  );
  const forecasts = usePagedResource<{
    id: string;
    as_of: string;
    status: string;
  }>(workspace.companyPath("native-forecasts/runs"));
  const [sourceMode, setSourceModeState] = useState("manual");
  const list =
    usePagedResource<Pick<NativeScenario, "id" | "name" | "version">>(base);
  const command = useCommand();
  const generation = useRef(0);
  const [local, setLocal] = useState<{
    item: NativeScenario | null;
    name: string;
    statementId: string;
    forecastId: string;
    horizonDays: number;
    shifts: Record<string, string>;
    hypothetical: Hypothetical[];
  }>({
    item: null,
    name: "",
    statementId: "",
    forecastId: "",
    horizonDays: 30,
    shifts: {},
    hypothetical: [],
  });
  const [actualId, setActualId] = useState("");
  const frozen = useResource<NativeScenarioBaseline>(
    base && !local.item
      ? local.forecastId
        ? `${base}/forecast-baseline/${local.forecastId}`
        : local.statementId
          ? `${base}/baseline/${local.statementId}?horizon_days=${local.horizonDays}`
          : null
      : null,
  );
  const baseline = local.item?.baseline || frozen.data;
  const evaluation = useResource<ScenarioEvaluation>(
    base && local.item && actualId
      ? `${base}/${local.item.id}/evaluation?actual_statement_id=${encodeURIComponent(actualId)}`
      : null,
  );
  const set = (patch: Partial<typeof local>) => {
    if (
      patch.statementId !== undefined ||
      patch.horizonDays !== undefined ||
      patch.forecastId !== undefined
    )
      generation.current++;
    setLocal({ ...local, ...patch });
  };
  const startNew = () => {
    generation.current++;
    command.clearError();
    setActualId("");
    setLocal({
      item: null,
      name: "",
      statementId: "",
      forecastId: "",
      horizonDays: 30,
      shifts: {},
      hypothetical: [],
    });
  };
  const loadItem = (item: NativeScenario) => {
    const displayed = item.comparison_projection
      ? {
          ...item,
          comparison: {
            ...item.comparison,
            ...item.comparison_projection,
            baseline: {
              ...item.comparison.baseline,
              ...item.comparison_projection.baseline,
            },
            scenario: {
              ...item.comparison.scenario,
              ...item.comparison_projection.scenario,
            },
          },
        }
      : item;
    setLocal({
      item: displayed,
      name: item.name,
      statementId: item.native_statement_id,
      forecastId: item.baseline.forecast_run_id || "",
      horizonDays: item.baseline.horizon_days,
      shifts: Object.fromEntries(
        (item.changes.shifts || []).map((row) => [row.event_id, row.date]),
      ),
      hypothetical: item.changes.hypothetical,
    });
    setActualId("");
  };
  const select = (id: string) => {
    const stamp = ++generation.current;
    void command.run<NativeScenario>(
      base ? `${base}/${id}` : null,
      { method: "GET" },
      (item) => {
        if (stamp === generation.current) loadItem(item);
      },
    );
  };
  const save = async () => {
    if (!baseline || !workspace.canWrite) return;
    const stamp = ++generation.current;
    await command.run<NativeScenario>(
      base + (local.item ? `/${local.item.id}` : ""),
      {
        method: local.item ? "PATCH" : "POST",
        version: local.item?.version,
        body: {
          name: local.name.trim(),
          native_statement_id: baseline.native_statement_id,
          horizon_days: baseline.horizon_days,
          hypothetical: local.hypothetical,
          ...(baseline.forecast_run_id
            ? {
                forecast_run_id: baseline.forecast_run_id,
                shifts: Object.entries(local.shifts).map(
                  ([event_id, date]) => ({ event_id, date }),
                ),
              }
            : {}),
        },
      },
      (item) => {
        if (stamp === generation.current) {
          loadItem(item);
          list.refresh();
        }
      },
      "سناریو ذخیره شد.",
    );
  };
  const comparisonMetrics: Metric[] = local.item
    ? [
        {
          metric_key: "scenario_closing",
          value:
            local.item.comparison.status === "limited"
              ? (local.item.comparison.scenario.known_dated_closing ??
                local.item.comparison.scenario.closing)
              : local.item.comparison.scenario.closing,
        },
        {
          metric_key: "scenario_minimum",
          value:
            local.item.comparison.status === "limited"
              ? (local.item.comparison.scenario.known_dated_minimum ??
                local.item.comparison.scenario.minimum)
              : local.item.comparison.scenario.minimum,
        },
        {
          metric_key: "scenario_difference",
          value:
            local.item.comparison.status === "limited"
              ? (local.item.comparison.known_dated_closing_difference ??
                local.item.comparison.closing_difference)
              : local.item.comparison.closing_difference,
        },
      ].map((row) => ({
        ...row,
        status:
          local.item!.comparison.status === "limited" ? "limited" : "estimated",
        basis: "scenario",
        scope:
          local.item!.comparison.status === "limited"
            ? "known_dated_flows"
            : "scenario",
        unit: "IRR",
        reason_codes: [],
      }))
    : [];
  return {
    view: { workspace },
    statements,
    forecasts,
    sourceMode,
    setSourceMode: (mode: string) => {
      startNew();
      setSourceModeState(mode);
    },
    list,
    command,
    local,
    baseline,
    frozen,
    set,
    select,
    startNew,
    save,
    comparisonMetrics,
    evaluation,
    actualId,
    setActualId,
    canWrite: workspace.canWrite,
    sourceHref: baseline?.native_statement_id
      ? `/api/v1${workspace.companyPath(`accounting/statements/${baseline.native_statement_id}/export?format=pdf`)}`
      : null,
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
            unit: workspace.unit,
          },
        ],
      }),
    removeHypothetical: (index: number) =>
      set({ hypothetical: local.hypothetical.filter((_, i) => i !== index) }),
  };
}
