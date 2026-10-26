"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/product-api";
import type { RecordLineageResponse } from "@/lib/product-types";

function fields(values: Record<string, unknown>) {
  return Object.entries(values).map(([label, value]) => ({ label, value: value == null ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value) }));
}

export function useRecordLineage(open: boolean, companyId: string, entityType: string, recordId: string | null, request: typeof api = api) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ loading: boolean; error: string; data: RecordLineageResponse | null }>({ loading: false, error: "", data: null });
  useEffect(() => {
    if (!open || !recordId) { setState({ loading: false, error: "", data: null }); return; }
    const controller = new AbortController();
    setState({ loading: true, error: "", data: null });
    request<RecordLineageResponse>(`/companies/${companyId}/data/lineage/${entityType}/${recordId}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setState({ loading: false, error: "", data }); })
      .catch(error => { if (!controller.signal.aborted) setState({ loading: false, error: error instanceof Error ? error.message : "منشأ داده دریافت نشد.", data: null }); });
    return () => controller.abort();
  }, [open, companyId, entityType, recordId, request, attempt]);
  return { ...state, rawFields: fields(state.data?.raw_values ?? {}), normalizedFields: fields(state.data?.normalized_fields ?? {}), retry: () => setAttempt(value => value + 1) };
}
