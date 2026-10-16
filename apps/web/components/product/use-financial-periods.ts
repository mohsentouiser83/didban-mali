"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/product-api";
import { currentRange, validRange, type DateRange, type FinancialPeriod } from "@/lib/financial-periods";

export function useFinancialPeriods(companyId: string) {
  const [result, setResult] = useState<{ companyId: string; items: FinancialPeriod[] } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    api<FinancialPeriod[]>(`/companies/${companyId}/financial-periods`, { signal: controller.signal })
      .then((items) => { if (!controller.signal.aborted) setResult({ companyId, items }); })
      .catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [companyId, version]);
  return { periods: result?.companyId === companyId ? result.items : [], error, loading, refresh };
}

export function usePeriodSelection(companyId: string, range: DateRange, onChange: (range: DateRange) => void, includeUpcomingMonth = false) {
  const data = useFinancialPeriods(companyId);
  const [draft, setDraft] = useState(range);
  const sameRange = (a: DateRange, b: DateRange) => a.start_date === b.start_date && a.end_date === b.end_date;
  const presets = (["month", "quarter", "year", ...(includeUpcomingMonth ? ["upcomingMonth" as const] : [])] as const).map((id) => ({ id, range: currentRange(id) }));
  const identify = (value: DateRange) => data.periods.find((period) => sameRange(period, value))?.id ?? presets.find((preset) => sameRange(preset.range, value))?.id ?? "custom";
  const [choice, setChoice] = useState(identify(range));
  useEffect(() => { setDraft({ start_date: range.start_date, end_date: range.end_date }); }, [range.start_date, range.end_date]);
  const selected = data.periods.find((period) => sameRange(period, range));
  const selectedLabel = selected?.name ?? (new Map([["month", "ماه جاری"], ["quarter", "فصل جاری"], ["year", "سال جاری"], ["upcomingMonth", "یک ماه آینده"]]).get(identify(range)) ?? "بازه دلخواه");
  function choose(id: string) {
    setChoice(id);
    const next = presets.find((preset) => preset.id === id)?.range ?? data.periods.find((period) => period.id === id);
    if (next) setDraft({ start_date: next.start_date, end_date: next.end_date });
  }
  return { ...data, draft, choice, choose, selectedLabel, valid: validRange(draft),
    setDraft: (value: DateRange) => { setChoice("custom"); setDraft(value); },
    resetDraft: () => { setDraft(range); setChoice(identify(range)); },
    reset: () => onChange(currentRange()),
    apply: () => { if (validRange(draft)) onChange(draft); },
  };
}
