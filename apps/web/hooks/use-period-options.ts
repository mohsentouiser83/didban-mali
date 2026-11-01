"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type Period, type ResourceList } from "@/lib/api";
/** Period selectors need the full authorized catalog, independently of table pagination. */
export function usePeriodOptions(companyId: string) {
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    companyId: string;
    data: Period[];
    error?: ApiError;
  }>({ companyId: "", data: [] });
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!companyId) return;
    const abort = new AbortController();
    void (async () => {
      try {
        const periods: Period[] = [];
        const cursors = new Set<string>();
        let cursor: string | null | undefined;
        do {
          const page = await api<ResourceList<Period>>(
            `/companies/${companyId}/financial-periods?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
            { signal: abort.signal },
          );
          periods.push(...page.items);
          cursor = page.next_cursor;
          if (cursor) {
            if (cursors.has(cursor))
              throw new ApiError(
                0,
                "فهرست دوره‌ها کامل دریافت نشد.",
                "invalid_pagination",
              );
            cursors.add(cursor);
          }
        } while (cursor && !abort.signal.aborted);
        if (!abort.signal.aborted) setSnapshot({ companyId, data: periods });
      } catch (error) {
        if (!abort.signal.aborted)
          setSnapshot({
            companyId,
            data: [],
            error:
              error instanceof ApiError
                ? error
                : new ApiError(0, "دوره‌ها دریافت نشد.", "periods_unavailable"),
          });
      }
    })();
    return () => abort.abort();
  }, [companyId, revision]);
  return {
    data: snapshot.companyId === companyId ? snapshot.data : [],
    error: snapshot.companyId === companyId ? snapshot.error : undefined,
    loading: !!companyId && snapshot.companyId !== companyId,
    refresh,
  };
}
