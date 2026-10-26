"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/product-api";
import type { MetricTraceResponse } from "@/lib/product-types";

export function useMetricTrace(companyId: string, metricKey: string | undefined, open: boolean, request: typeof api = api) {
  const [data, setData] = useState<MetricTraceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null); setError(""); setLoading(false);
    if (!open || !metricKey) return;
    setLoading(true);
    request<MetricTraceResponse>(`/companies/${companyId}/calculations/metrics/${metricKey}/trace`)
      .then(result => { if (active) setData(result); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "مسیر داده‌های شاخص دریافت نشد."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId, metricKey, open, request, revision]);
  return { data, loading, error, retry: () => setRevision(value => value + 1) };
}
