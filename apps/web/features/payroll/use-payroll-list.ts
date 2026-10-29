"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
export function usePayrollList<T>(
  companyId: string,
  base: string,
  kind: string,
  enabled: boolean,
) {
  const query = useInfiniteQuery({
    queryKey: ["payroll", companyId, kind],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api.get<{ items: T[]; next_cursor: string | null }>(
        base +
          "/" +
          kind +
          "?limit=100" +
          (pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""),
        signal,
      ),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    enabled,
  });
  return {
    ...query,
    data: query.data
      ? { items: query.data.pages.flatMap((p) => p.items) }
      : undefined,
  };
}
