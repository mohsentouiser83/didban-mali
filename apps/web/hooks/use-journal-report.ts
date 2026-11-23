"use client";

import type { NativeJournal } from "./use-native-journals";
import { usePagedResource } from "./use-paged-resource";
import { useWorkspace } from "./workspace";

export function useJournalReport() {
  const { companyPath, periodId } = useWorkspace();
  const query = new URLSearchParams({ order_by_date: "true" });
  if (periodId) query.set("period_id", periodId);
  return usePagedResource<NativeJournal>(companyPath(`accounting/journals?${query}`));
}
