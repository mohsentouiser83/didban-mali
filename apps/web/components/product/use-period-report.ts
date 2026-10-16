"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/product-api";
import type { DateRange, PeriodReport } from "@/lib/financial-periods";
type Result = { key: string; report: PeriodReport | null; error: string; loading: boolean };
export function usePeriodReport(companyId: string, range: DateRange) {
  const key = `${companyId}:${range.start_date}:${range.end_date}`;
  const [result, setResult] = useState<Result | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResult({ key, report: null, error: "", loading: true });
    api<PeriodReport>(`/companies/${companyId}/financial-periods/report?start_date=${range.start_date}&end_date=${range.end_date}`, { signal: controller.signal })
      .then((report) => { if (!controller.signal.aborted) setResult({ key, report, error: "", loading: false }); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setResult({ key, report: null, error: error instanceof Error ? error.message : "گزارش دریافت نشد.", loading: false }); });
    return () => controller.abort();
  }, [companyId, range.start_date, range.end_date, key, retry]);
  const current = result?.key === key ? result : null;
  return { report: current?.report ?? null, error: current?.error ?? "", loading: current?.loading ?? true, refresh: () => setRetry((value) => value + 1) };
}
