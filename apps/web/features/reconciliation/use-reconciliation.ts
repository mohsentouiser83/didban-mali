"use client";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { Schema } from "@didban/api-client";
import { api } from "@/lib/api";
import { useCommand } from "@/lib/use-command";
import type { Kind } from "./presentation";
const base = (company: string) => `/api/v1/companies/${company}`;
export function useReconciliationRuns(company: string, manifest: string) {
  return useQuery({
    queryKey: ["reconciliations", company, manifest],
    enabled: !!manifest,
    queryFn: ({ signal }) =>
      api.get<Schema<"ReconciliationRunPage">>(
        `${base(company)}/results/${manifest}/reconciliations?limit=100`,
        signal,
      ),
  });
}
export function useCandidates(company: string, run: string | undefined) {
  return useInfiniteQuery({
    queryKey: ["reconciliation-candidates", company, run],
    enabled: !!run,
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api.get<Schema<"ReconciliationCandidatePage">>(
        `${base(company)}/reconciliations/${run}/candidates?limit=50${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        signal,
      ),
    getNextPageParam: (p) => p.next_cursor ?? undefined,
  });
}
export function useReconciliationCommands(company: string, manifest: string) {
  const cache = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({
        queryKey: ["reconciliations", company, manifest],
      }),
      cache.invalidateQueries({
        queryKey: ["reconciliation-candidates", company],
      }),
    ]);
  };
  const start = useCommand<Kind, Schema<"ReconciliationRun">>(
    (kind, key) =>
      api.mutate(
        `${base(company)}/results/${manifest}/reconciliations`,
        "POST",
        { kind },
        key,
      ),
    refresh,
  );
  const decide = useCommand<
    {
      id: string;
      version: number;
      action: "accept" | "reject" | "needs_review";
      reason: string;
    },
    Schema<"Decision">
  >(
    ({ id, version, action, reason }, key) =>
      api.mutate(
        `${base(company)}/reconciliation-proposals/${id}/decisions`,
        "POST",
        { action, reason },
        key,
        version,
      ),
    refresh,
  );
  return { start, decide };
}
