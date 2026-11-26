import type { JournalDraft } from "./accounting";

export type InventoryOperation = "purchase_goods" | "sale_goods";
export type InventoryItemKind = "goods" | "service";
export type InventoryCatalogue = "items" | "warehouses";

export interface InventoryWarehouse {
  id: string;
  code: string;
  name: string;
  active: boolean;
  version: number;
}

export interface InventoryItem extends InventoryWarehouse {
  inventory_account_id: string;
  base_unit?: string;
  item_kind?: InventoryItemKind;
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
  kind: InventoryMovementKind;
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
  as_of?: string | null;
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
  source_reference?: string;
  operation_id: string;
  draft: JournalDraft;
}

export const inventoryTitle = {
  purchase_goods: "خرید کالا",
  sale_goods: "فروش کالا",
  opening_stock: "موجودی اول دوره",
  transfer_in: "ورود از انتقال",
  transfer_out: "خروج برای انتقال",
  adjustment: "تعدیل موجودی",
  sale_return: "مرجوعی فروش",
  purchase_return: "مرجوعی خرید",
  restock: "بازگشت به موجودی سالم",
  reversal: "برگشت سند",
} as const;

export type InventoryMovementKind = keyof typeof inventoryTitle;

export function hasInventoryInvoice(kind: InventoryMovementKind): kind is InventoryOperation {
  return kind === "purchase_goods" || kind === "sale_goods";
}

export interface InventoryCardexRow {
  id: string;
  date: string;
  kind: InventoryMovementKind;
  item_id: string;
  warehouse_id: string;
  item_name: string;
  warehouse_name: string;
  source_reference: string;
  journal_id: string;
  operation_id: string;
  in_quantity: number;
  in_value_irr: string;
  out_quantity: number;
  out_value_irr: string;
  balance_quantity: number;
  balance_value_irr: string;
}

export interface InventoryCardex {
  total_records: number;
  rows: InventoryCardexRow[];
}

export function inventoryInvoicePath(kind: InventoryOperation, operationId: string) {
  const destination = kind === "sale_goods" ? "/receivables" : "/payables";
  return `${destination}?operation=${encodeURIComponent(operationId)}`;
}
