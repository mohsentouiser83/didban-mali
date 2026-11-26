"use client";

import { useState } from "react";
import type { InventoryDraftResult, InventoryState } from "@/lib/inventory";
import { tehranToday } from "@/lib/native-invoices";
import { asciiDigits } from "@/lib/utils";
import { useCommand } from "./use-command";
import { useWorkspace } from "./workspace";

export const stockOperations = {
  opening: { label: "موجودی اول دوره", path: "opening-drafts" },
  transfer: { label: "انتقال بین انبارها", path: "transfer-drafts" },
  adjustment: { label: "تعدیل شمارش موجودی", path: "adjustment-drafts" },
} as const;

export type InventoryStockOperation = keyof typeof stockOperations;

export function useInventoryStockDraft(inventory: InventoryState) {
  const workspace = useWorkspace();
  const command = useCommand();
  const items = inventory.items.filter((item) => item.active && item.item_kind !== "service");
  const warehouses = inventory.warehouses.filter((warehouse) => warehouse.active);
  const [form, setForm] = useState({
    kind: "opening" as InventoryStockOperation,
    itemId: items.length === 1 ? items[0].id : "",
    warehouseId: warehouses.length === 1 ? warehouses[0].id : "",
    destinationId: "",
    date: tehranToday(),
    quantity: "",
    unitPrice: "",
    accountId: "",
    description: "",
  });
  const [created, setCreated] = useState<InventoryDraftResult>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const option = stockOperations[form.kind];
  const adjustment = form.kind === "adjustment";
  const opening = form.kind === "opening";
  const transfer = form.kind === "transfer";

  function change(patch: Partial<typeof form>) {
    setForm((value) => ({ ...value, ...patch }));
    setErrors({});
    command.clearError();
  }

  function save() {
    if (!workspace.periodId || !inventory.can_prepare || created) return;
    const quantity = Number(form.quantity);
    const issues: Record<string, string> = {};
    if (!form.itemId) issues.itemId = "کالای انباری را انتخاب کنید.";
    if (!form.warehouseId) issues.warehouseId = "انبار را انتخاب کنید.";
    if (transfer && (!form.destinationId || form.destinationId === form.warehouseId))
      issues.destinationId = "انبار مقصد باید با مبدأ متفاوت باشد.";
    if (!/^\d+$/.test(form.quantity) || quantity < (adjustment ? 0 : 1) || quantity > 1_000_000_000)
      issues.quantity = "تعداد معتبر وارد کنید.";
    if ((opening || form.unitPrice) && (!/^\d{1,80}$/.test(form.unitPrice) || !/[1-9]/.test(form.unitPrice)))
      issues.unitPrice = "بهای واحد را به ریال و به‌صورت عدد صحیح مثبت وارد کنید.";
    if (!transfer && !form.accountId) issues.accountId = "حساب را انتخاب کنید.";
    if (!form.date) issues.date = "تاریخ را انتخاب کنید.";
    setErrors(issues);
    if (Object.keys(issues).length) return;

    const common = {
      item_id: form.itemId,
      period_id: workspace.periodId,
      date: form.date,
      description: form.description.trim() || option.label,
    };
    const body = opening ? {
      ...common, warehouse_id: form.warehouseId, quantity,
      unit_price: form.unitPrice, unit: "IRR", equity_account_id: form.accountId,
    } : transfer ? {
      ...common, source_warehouse_id: form.warehouseId,
      destination_warehouse_id: form.destinationId, quantity,
    } : {
      ...common, warehouse_id: form.warehouseId, counted_quantity: quantity,
      unit: "IRR", unit_price: form.unitPrice || null, adjustment_account_id: form.accountId,
    };
    void command.run<InventoryDraftResult>(
      workspace.companyPath(`accounting/inventory/${option.path}`),
      { body },
      setCreated,
      "پیش‌نویس گردش انبار ساخته شد.",
    );
  }

  return {
    form,
    change,
    created,
    command,
    errors,
    save,
    opening,
    transfer,
    adjustment,
    itemOptions: items.map((item) => ({ value: item.id, label: `${item.name} · ${item.code}` })),
    warehouseOptions: warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name })),
    changeQuantity: (value: string) => change({ quantity: asciiDigits(value).trim() }),
  };
}
