"use client";
import type { Metric } from "@/lib/api";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";
interface Summary {
  id: string;
  source: "native_statement";
  period: { name: string; start: string; end: string };
  as_of: string;
  metrics: Metric[];
}
export function useNativeDashboard() {
  const workspace = useWorkspace();
  const path = workspace.companyPath("accounting/statements/summary/latest");
  const resource = useResource<Summary>(
    path
      ? `${path}${workspace.periodId ? `?period_id=${encodeURIComponent(workspace.periodId)}` : ""}`
      : null,
    { allowMissing: true },
  );
  return {
    workspace,
    ...resource,
    cash: resource.data?.metrics.find((metric) => metric.metric_key === "cash"),
  };
}
