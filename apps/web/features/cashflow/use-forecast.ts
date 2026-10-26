"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Schema } from "@didban/api-client";
import { api } from "@/lib/api";
import { useCommand } from "@/lib/use-command";
import { companyPath } from "@/features/settlements/use-settlements";
type ForecastRunPage = {
  items: Schema<"ForecastRun">[];
  next_cursor: string | null;
};
export function useForecastRuns(company: string, manifest: string | undefined) {
  return useQuery({
    queryKey: ["forecast", company, "runs", manifest],
    enabled: !!manifest,
    queryFn: async ({ signal }) => {
      let cursor: string | null = null;
      const all: Schema<"ForecastRun">[] = [];
      do {
        const page: ForecastRunPage = await api.get(
          `${companyPath(company)}/results/${manifest}/forecast-runs?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
          signal,
        );
        all.push(...page.items);
        cursor = page.next_cursor;
      } while (cursor);
      return all;
    },
    refetchInterval: (q) =>
      q.state.data?.some((r) => r.status === "waiting_input") ? 2000 : false,
  });
}
export function useForecastRun(company: string, run: string | undefined) {
  return useQuery({
    queryKey: ["forecast", company, "run", run],
    enabled: !!run,
    queryFn: ({ signal }) =>
      api.get<Schema<"ForecastRun">>(
        `${companyPath(company)}/forecast-runs/${run}`,
        signal,
      ),
    refetchInterval: (q) =>
      q.state.data?.status === "waiting_input" ? 2000 : false,
  });
}
export function useStartForecast(
  company: string,
  done: (run: Schema<"ForecastRun">) => void,
) {
  const cache = useQueryClient();
  return useCommand<
    { manifest: string; minimum_events: number; lookback_days: number },
    Schema<"ForecastRun">
  >(
    ({ manifest, ...body }, key) =>
      api.mutate(
        `${companyPath(company)}/results/${manifest}/forecasts`,
        "POST",
        body,
        key,
      ),
    async (run) => {
      await cache.invalidateQueries({ queryKey: ["forecast", company] });
      done(run);
    },
  );
}
