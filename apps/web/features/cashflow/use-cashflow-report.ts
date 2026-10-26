"use client";
import { useQuery } from "@tanstack/react-query";
import type { Schema } from "@didban/api-client";
import { api } from "@/lib/api";
type Page<T> = {
  items: T[];
  next_cursor: string | null;
  reason_codes?: string[];
  snapshot_created_at?: string;
};
async function all<T>(path: string, signal: AbortSignal) {
  let cursor: string | null = null;
  const items: T[] = [];
  let meta: Page<T> | null = null;
  const seen = new Set<string>();
  do {
    const page: Page<T> = await api.get<Page<T>>(
      `${path}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      signal,
    );
    items.push(...page.items);
    meta ??= page;
    cursor = page.next_cursor;
    if (cursor && seen.has(cursor)) throw new Error("duplicate_cursor");
    if (cursor) seen.add(cursor);
  } while (cursor && seen.size < 500);
  if (cursor) throw new Error("pagination_limit");
  return {
    items,
    reason_codes: meta?.reason_codes ?? [],
    snapshot_created_at: meta?.snapshot_created_at ?? null,
  };
}
export function useCashflowReport(company: string, manifest: string) {
  return useQuery({
    queryKey: ["cashflow-period", company, manifest],
    enabled: !!manifest,
    queryFn: async ({ signal }) => {
      const base = `/api/v1/companies/${company}/results/${manifest}`;
      const [accounts, days] = await Promise.all([
        all<Schema<"CashAccountBalance">>(base + "/cash-accounts", signal),
        all<Schema<"CashDay">>(base + "/cash-days", signal),
      ]);
      return {
        accounts: accounts.items,
        days: days.items,
        reasons: days.reason_codes,
        created: days.snapshot_created_at,
      };
    },
    refetchInterval: (q) =>
      (q.state.error as { code?: string } | null)?.code === "cashflow_pending"
        ? 3000
        : false,
  });
}
