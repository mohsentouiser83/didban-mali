"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/product-api";
import type { DateRange, PeriodReport } from "@/lib/financial-periods";

export function usePeriodReport(companyId: string, range: DateRange) {
  const key = `${companyId}:${range.start_date}:${range.end_date}`;
  const [result, setResult] = useState<{ key: string; report: PeriodReport } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setResult(null);
    api<PeriodReport>(`/companies/${companyId}/financial-periods/report?start_date=${range.start_date}&end_date=${range.end_date}`)
      .then((report) => { if (active) setResult({ key, report }); })
      .catch((err: Error) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId, range.start_date, range.end_date, key, retry]);
  return { report: result?.key === key ? result.report : null, error, loading: loading || (!result && !error), refresh: () => setRetry((value) => value + 1) };
}
