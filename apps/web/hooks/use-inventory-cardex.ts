"use client";

import { useState } from "react";
import type { InventoryCardex } from "@/lib/inventory";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";

export interface InventoryCardexScope {
  itemId?: string;
  warehouseId?: string;
  asOf: string;
}

export function useInventoryCardex(scope: InventoryCardexScope) {
  const workspace = useWorkspace();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState(scope.asOf);
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const invalidRange = !!fromDate && !!toDate && fromDate > toDate;
  const params = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) });
  if (scope.itemId) params.set("item_id", scope.itemId);
  if (scope.warehouseId) params.set("warehouse_id", scope.warehouseId);
  if (fromDate) params.set("from_date", fromDate);
  if (toDate) params.set("to_date", toDate);
  const resource = useResource<InventoryCardex>(
    invalidRange ? null : workspace.companyPath(`accounting/inventory/cardex?${params}`),
  );

  return {
    resource,
    fromDate,
    toDate,
    invalidRange,
    changeFrom: (value: string) => { setFromDate(value); setPage(0); },
    changeTo: (value: string) => { setToDate(value); setPage(0); },
    pagination: {
      page,
      pageSize,
      total: resource.data?.total_records ?? 0,
      onPrevious: () => setPage((value) => Math.max(0, value - 1)),
      onNext: () => setPage((value) => value + 1),
    },
  };
}
