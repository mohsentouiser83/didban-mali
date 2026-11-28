"use client";
import type {
  CashDay,
  Manifest,
  Metric,
} from "@/lib/api";
import {
  addExactAmounts,
  forecastAssumptionLabel,
} from "@/lib/financial-presentation";
import { useMemo, useState } from "react";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";
export function useFinancialView(
  projection: "summary" | "invoices" | "moadian" | "forecast" = "summary",
  enabled = true,
) {
  const workspace = useWorkspace();
  const path = enabled ? workspace.companyPath("results/latest") : null;
  const resource = useResource<Manifest>(
    path
      ? path +
          `?view=${projection}&allow_missing=true` +
          (workspace.periodId ? `&period_id=${workspace.periodId}` : "")
      : null,
    { allowMissing: true },
  );
  const reportMetrics = useMemo(() => {
    const original = resource.data?.metrics || [];
    if (!resource.data) return original;
    const cash = resource.data.details.cash_movements;
    const status =
      typeof resource.data.details.cash_movement_status === "string"
        ? resource.data.details.cash_movement_status
        : "unavailable";
    const derived: Metric[] = [
      ["cash_inflow", "total_in", "واریز بانک در دوره"],
      ["cash_outflow", "total_out", "برداشت بانک در دوره"],
    ].map(([key, field, label]) => {
      const incoming = field === "total_in";
      const value =
        cash?.[field] ??
        addExactAmounts(
          cash?.[incoming ? "external_in" : "external_out"],
          cash?.[incoming ? "internal_in" : "internal_out"],
        );
      return {
        metric_key: key,
        label,
        basis: "bank",
        scope: "bank_movements",
        value,
        unit: "IRR",
        status: value != null ? status : "unavailable",
        reason_codes: value != null ? [] : ["bank_source_missing"],
        reason: value != null ? null : "گردش معتبر بانک موجود نیست.",
      };
    });
    return [...original, ...derived];
  }, [resource.data]);
  const metrics = useMemo(
    () =>
      Object.fromEntries(
        reportMetrics.map((metric) => [metric.metric_key, metric]),
      ),
    [reportMetrics],
  );
  const dayChoices = useMemo(() => {
    const days = resource.data?.details.daily_cash || [];
    return days.filter(
      (_, index) => index % Math.max(1, Math.floor(days.length / 6)) === 0,
    );
  }, [resource.data]);
  const forecastAssumptions = useMemo(
    () =>
      (resource.data?.details.forecast?.assumptions || []).map(
        forecastAssumptionLabel,
      ),
    [resource.data],
  );
  return {
    ...resource,
    forecastAssumptions,
    workspace,
    manifest: resource.data,
    metrics,
    reportMetrics,
    dayChoices,
  };
}
/** Local inspection moves through real report days without constructing financial data. */
export function useCashDayNavigation(days: CashDay[]) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const index = days.findIndex((day) => day.date === selectedDate);
  return {
    selected: index >= 0 ? days[index] : null,
    setSelected: (day: CashDay | null) => setSelectedDate(day?.date ?? null),
    hasPreviousDay: index > 0,
    hasNextDay: index >= 0 && index < days.length - 1,
    previousDay: () => {
      if (index > 0) setSelectedDate(days[index - 1].date);
    },
    nextDay: () => {
      if (index >= 0 && index < days.length - 1)
        setSelectedDate(days[index + 1].date);
    },
  };
}
