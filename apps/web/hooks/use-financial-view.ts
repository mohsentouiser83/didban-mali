"use client";
import type {
  CashDay,
  Finding,
  Manifest,
  Metric,
  ProcessingSession,
  ResourceList,
} from "@/lib/api";
import { listItems } from "@/lib/api";
import {
  addExactAmounts,
  forecastAssumptionLabel,
  invoiceFinancialState,
} from "@/lib/financial-presentation";
import { useMemo, useState } from "react";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";
export function useFinancialView(
  projection: "summary" | "invoices" | "moadian" | "forecast" = "summary",
) {
  const workspace = useWorkspace();
  const path = workspace.companyPath("results/latest");
  const resource = useResource<Manifest>(
    path
      ? path +
          `?view=${projection}` +
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
export function useInvoiceView(direction: "sales" | "purchases") {
  const view = useFinancialView("invoices");
  const [query, setQueryValue] = useState("");
  const [overdue, setOverdueValue] = useState(false);
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => {
    const source = view.manifest?.details.invoices || [];
    return source.filter(
      (invoice) =>
        invoice.direction === direction &&
        (!overdue || invoice.overdue) &&
        (!query ||
          [invoice.party_id, invoice.reference].some((value) =>
            value.toLowerCase().includes(query.trim().toLowerCase()),
          )),
    );
  }, [view.manifest, direction, overdue, query]);
  const safePage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / 25) - 1),
  );
  const rows = filtered
    .slice(safePage * 25, (safePage + 1) * 25)
    .map((invoice) => ({
      ...invoice,
      financialState: invoiceFinancialState(invoice),
    }));
  return {
    ...view,
    rows,
    query,
    setQuery: (value: string) => {
      setQueryValue(value);
      setPage(0);
    },
    overdue,
    setOverdue: (value: boolean) => {
      setOverdueValue(value);
      setPage(0);
    },
    page: safePage,
    total: filtered.length,
    nextPage: () => setPage((value) => value + 1),
    previousPage: () => setPage((value) => Math.max(0, value - 1)),
  };
}
export function useDashboard() {
  const view = useFinancialView();
  const sessions = useResource<ResourceList<ProcessingSession>>(
    view.workspace.companyPath("processing-sessions"),
  );
  const findings = useResource<ResourceList<Finding>>(
    view.workspace.companyPath("findings"),
  );
  return {
    ...view,
    sessions: listItems(sessions.data).slice(0, 3),
    findings: listItems(findings.data)
      .filter((item) => item.state === "open")
      .slice(0, 3),
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
