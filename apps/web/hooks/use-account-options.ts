"use client";
import { useEffect, useState } from "react";
import { api, ApiError, type ResourceList } from "@/lib/api";
import type { LedgerAccount } from "@/lib/accounting";

export function useAccountOptions(companyId: string) {
  const [snapshot, setSnapshot] = useState<{
    companyId: string;
    items: LedgerAccount[];
    error?: ApiError;
  }>({ companyId: "", items: [] });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!companyId) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const items: LedgerAccount[] = [];
        const cursors = new Set<string>();
        let cursor: string | null | undefined;
        do {
          const page = await api<ResourceList<LedgerAccount>>(
            `/companies/${companyId}/accounting/accounts?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
            { signal: controller.signal },
          );
          items.push(...page.items);
          cursor = page.next_cursor;
          if (cursor) {
            if (cursors.has(cursor))
              throw new ApiError(
                0,
                "فهرست حساب‌ها کامل دریافت نشد.",
                "invalid_pagination",
              );
            cursors.add(cursor);
          }
        } while (cursor && !controller.signal.aborted);
        if (!controller.signal.aborted) setSnapshot({ companyId, items });
      } catch (error) {
        if (!controller.signal.aborted)
          setSnapshot({
            companyId,
            items: [],
            error:
              error instanceof ApiError
                ? error
                : new ApiError(0, "حساب‌ها دریافت نشد.", "unknown"),
          });
      }
    })();
    return () => controller.abort();
  }, [companyId, revision]);
  return {
    items: snapshot.companyId === companyId ? snapshot.items : [],
    error: snapshot.companyId === companyId ? snapshot.error : undefined,
    loading: !!companyId && snapshot.companyId !== companyId,
    refresh: () => setRevision((value) => value + 1),
  };
}
