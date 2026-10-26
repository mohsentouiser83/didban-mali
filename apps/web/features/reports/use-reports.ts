"use client";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { Schema } from "@didban/api-client";
import { api } from "@/lib/api";
import { useCommand } from "@/lib/use-command";
const base = (company: string) => `/api/v1/companies/${company}`;
export function useReports(company: string) {
  return useInfiniteQuery({
    queryKey: ["reports", company],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api.get<Schema<"ReportPage">>(
        `${base(company)}/reports?limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        signal,
      ),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    refetchInterval: (q) =>
      q.state.data?.pages.some((p) =>
        p.items.some((r) =>
          r.exports?.some(
            (e) => e.status === "pending" || e.status === "running",
          ),
        ),
      )
        ? 2000
        : false,
  });
}
export function useReport(company: string, id: string | undefined) {
  return useQuery({
    queryKey: ["report", company, id],
    enabled: !!id,
    queryFn: ({ signal }) =>
      api.get<Schema<"Report">>(`${base(company)}/reports/${id}`, signal),
    refetchInterval: (q) =>
      q.state.data?.exports?.some(
        (e) => e.status === "pending" || e.status === "running",
      )
        ? 2000
        : false,
  });
}
export function useReportCommands(
  company: string,
  onGenerated: (id: string) => void,
) {
  const cache = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["reports", company] }),
      cache.invalidateQueries({ queryKey: ["report", company] }),
      cache.invalidateQueries({ queryKey: ["sessions", company] }),
    ]);
  };
  const generate = useCommand<string, Schema<"Report">>(
    (manifest, key) =>
      api.mutate(
        `${base(company)}/results/${manifest}/reports`,
        "POST",
        undefined,
        key,
      ),
    async (report) => {
      onGenerated(report.id);
      await refresh();
    },
  );
  const approve = useCommand<
    { id: string; version: number },
    Schema<"Approval">
  >(
    (report, key) =>
      api.mutate(
        `${base(company)}/reports/${report.id}/approvals`,
        "POST",
        { confirmed: true },
        key,
        report.version,
      ),
    refresh,
  );
  const retry = useCommand<string, Schema<"ExportJob">>(
    (id, key) =>
      api.mutate(
        `${base(company)}/exports/${id}/retry`,
        "POST",
        undefined,
        key,
      ),
    refresh,
  );
  return { generate, approve, retry };
}
