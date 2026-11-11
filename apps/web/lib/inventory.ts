import type { JournalDraft } from "./accounting";

export type InventoryOperation = "purchase_goods" | "sale_goods";
export type InventoryCatalogue = "items" | "warehouses";

export interface InventoryWarehouse {
  id: string;
  code: string;
  name: string;
}

export interface InventoryItem extends InventoryWarehouse {
  inventory_account_id: string;
}

export interface InventoryBalance {
  item_id: string;
  warehouse_id: string;
  quantity: number;
  value_irr: string;
}

export interface InventoryMovement extends InventoryBalance {
  id: string;
  date: string;
  kind: InventoryOperation | "reversal";
  journal_id: string;
  operation_id: string;
}

export interface InventoryState {
  items: InventoryItem[];
  warehouses: InventoryWarehouse[];
  balances: InventoryBalance[];
  movements: InventoryMovement[];
  can_prepare: boolean;
  can_manage_catalog: boolean;
  purchase_enabled: boolean;
  sale_enabled: boolean;
  movements_truncated: boolean;
}

export interface InventoryPostingEvidence {
  item_id: string;
  warehouse_id: string;
  item_code?: string;
  item_name?: string;
  warehouse_code?: string;
  warehouse_name?: string;
  quantity: number;
  value_irr: string;
}

export interface InventoryDraftResult {
  operation_id: string;
  draft: JournalDraft;
}

export const inventoryTitle = {
  purchase_goods: "خرید کالا",
  sale_goods: "فروش کالا",
  reversal: "برگشت سند",
} as const;

export function inventoryInvoicePath(kind: InventoryOperation, operationId: string) {
  const destination = kind === "sale_goods" ? "/receivables" : "/payables";
  return `${destination}?operation=${encodeURIComponent(operationId)}`;
}
