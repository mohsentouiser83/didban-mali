"use client";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ApiError } from "@didban/api-client";
import { api } from "@/lib/api";
import { useCommand } from "@/lib/use-command";
export type Usage = {
  period_start: string;
  period_end: string;
  currency: "USD";
  ceiling: string;
  reserved: string;
  spent: string;
  usage_unknown: boolean;
  budget_configured: boolean;
};
export type BudgetPolicy = {
  id: string;
  ceiling_usd: string;
  period_kind: "calendar_month" | "custom";
  version: number;
};
export type UncertainCharge = {
  id: string;
  created_at: string;
  reserved_usd: string;
};
export function useCompanyUsage(company: string) {
  return useQuery({
    queryKey: ["model-usage", company],
    queryFn: ({ signal }) =>
      api.get<Usage>(`/api/v1/companies/${company}/usage`, signal),
    refetchInterval: 15000,
  });
}
export function useInstallationBudget(enabled: boolean) {
  return useQuery({
    queryKey: ["installation-budget"],
    enabled,
    queryFn: async ({ signal }) => {
      try {
        return await api.get<BudgetPolicy>(
          "/api/v1/admin/budget-policy",
          signal,
        );
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });
}
export function useInstallationUsage(enabled: boolean) {
  return useQuery({
    queryKey: ["installation-usage"],
    enabled,
    queryFn: ({ signal }) => api.get<Usage>("/api/v1/admin/usage", signal),
    refetchInterval: 15000,
  });
}
export function useUncertainCharges(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ["uncertain-model-charges"],
    enabled,
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api.get<{ items: UncertainCharge[]; next_cursor: string | null }>(
        `/api/v1/admin/model-requests?limit=25${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        signal,
      ),
    getNextPageParam: (p) => p.next_cursor ?? undefined,
  });
}
export function useBudgetCommands() {
  const cache = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["installation-budget"] }),
      cache.invalidateQueries({ queryKey: ["installation-usage"] }),
      cache.invalidateQueries({ queryKey: ["uncertain-model-charges"] }),
      cache.invalidateQueries({ queryKey: ["model-usage"] }),
    ]);
  };
  const save = useCommand<
    { ceiling: string; version: number | null },
    BudgetPolicy
  >(
    ({ ceiling, version }, key) =>
      api.mutate(
        "/api/v1/admin/budget-policy",
        version === null ? "POST" : "PATCH",
        { ceiling_usd: ceiling },
        key,
        version ?? undefined,
      ),
    refresh,
  );
  const reconcile = useCommand<{ id: string; actual: string }, { ok: true }>(
    ({ id, actual }, key) =>
      api.mutate(
        `/api/v1/admin/model-requests/${id}/reconcile`,
        "POST",
        { actual_cost_usd: actual },
        key,
      ),
    refresh,
  );
  return { save, reconcile };
}
