"use client";

import { useRef, useState } from "react";
import { randomId } from "@/lib/random-id";
import { tehranToday } from "@/lib/native-invoices";
import { asciiDigits } from "@/lib/utils";
import type { VoucherDirection, WarehouseVoucher, WarehouseVoucherOptions } from "@/lib/warehouse-vouchers";
import { useCommand } from "./use-command";
import { usePagedResource } from "./use-paged-resource";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";

const base = "accounting/inventory";

export function useWarehouseVouchers(direction: VoucherDirection) {
  const workspace = useWorkspace();
  const vouchers = usePagedResource<WarehouseVoucher>(workspace.companyPath(`${base}/vouchers/${direction}`));
  const options = useResource<WarehouseVoucherOptions>(workspace.companyPath(`${base}/voucher-options`));
  const [editor, setEditor] = useState({ open: false, generation: 0 });
  const close = () => setEditor((value) => ({ ...value, open: false }));
  return {
    vouchers,
    options,
    editor,
    open: () => setEditor((value) => ({ open: true, generation: value.generation + 1 })),
    close,
    onCreated: () => {
      close();
      vouchers.firstPage();
      vouchers.refresh();
    },
  };
}

const blankLine = (id: number) => ({ id, itemId: "", quantity: "", unitPrice: "" });

export function useWarehouseVoucherForm(
  direction: VoucherDirection,
  options: WarehouseVoucherOptions,
  onCreated: () => void,
) {
  const workspace = useWorkspace();
  const command = useCommand();
  const nextId = useRef(1);
  const request = useRef<{ body: string; key: string } | undefined>(undefined);
  const [form, setForm] = useState(() => {
    const today = tehranToday();
    const active = workspace.periods.find((period) => period.id === workspace.periodId);
    return {
      date: active && active.start <= today && today <= active.end ? today : "",
      warehouseId: options.warehouses.length === 1 ? options.warehouses[0].value : "",
      accountId: "",
      reference: "",
      description: "",
    };
  });
  const [lines, setLines] = useState([blankLine(0)]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const receipt = direction === "receipts";

  function clearError(field?: string) {
    command.clearError();
    if (field) setErrors((previous) => ({ ...previous, [field]: "" }));
  }

  function change(field: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
    clearError(field);
  }

  function changeLine(id: number, field: "itemId" | "quantity" | "unitPrice", value: string) {
    const normalized = field === "quantity" ? asciiDigits(value).trim() : value;
    setLines((previous) => previous.map((line) => line.id === id ? { ...line, [field]: normalized } : line));
    clearError(`${field}-${id}`);
  }

  function save() {
    const issues: Record<string, string> = {};
    const period = workspace.periods.find((value) => value.id === workspace.periodId);
    if (!period) return;
    if (!form.date) issues.date = "تاریخ را انتخاب کنید.";
    else if (period && (form.date < period.start || form.date > period.end))
      issues.date = "تاریخ خارج از دورهٔ انتخاب‌شده است.";
    if (!form.warehouseId) issues.warehouseId = "انبار را انتخاب کنید.";
    if (!form.accountId) issues.accountId = "حساب مقابل را انتخاب کنید.";
    const seen = new Set<string>();
    for (const line of lines) {
      if (!line.itemId) issues[`itemId-${line.id}`] = "کالا را انتخاب کنید.";
      else if (seen.has(line.itemId)) issues[`itemId-${line.id}`] = "این کالا تکراری است.";
      seen.add(line.itemId);
      if (!/^\d{1,10}$/.test(line.quantity) || Number(line.quantity) < 1 || Number(line.quantity) > 1_000_000_000)
        issues[`quantity-${line.id}`] = "تعداد صحیح مثبت وارد کنید.";
      if (receipt && (!/^\d{1,32}$/.test(line.unitPrice) || !/[1-9]/.test(line.unitPrice)))
        issues[`unitPrice-${line.id}`] = "بهای صحیح مثبت وارد کنید.";
    }
    setErrors(issues);
    if (Object.keys(issues).length) return;
    const body = {
      period_id: period.id,
      date: form.date,
      warehouse_id: form.warehouseId,
      offset_account_id: form.accountId,
      reference: form.reference.trim(),
      description: form.description.trim(),
      items: lines.map((line) => ({
        item_id: line.itemId,
        quantity: Number(line.quantity),
        ...(receipt ? { unit_price_irr: line.unitPrice } : {}),
      })),
    };
    const encoded = JSON.stringify(body);
    if (request.current?.body !== encoded) request.current = { body: encoded, key: randomId() };
    void command.run(
      workspace.companyPath(`${base}/vouchers/${direction}`),
      { body, key: request.current.key },
      onCreated,
      "پیش‌نویس ذخیره شد.",
    );
  }

  return {
    form,
    lines,
    errors,
    command,
    receipt,
    change,
    changeLine,
    addLine: () => {
      const id = nextId.current++;
      setLines((previous) => [...previous, blankLine(id)]);
    },
    removeLine: (id: number) => {
      setLines((previous) => previous.filter((line) => line.id !== id));
      clearError();
    },
    save,
  };
}
