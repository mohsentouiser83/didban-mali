"use client";

import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { AmountInput, Input, Textarea } from "@/components/ui/input";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Select } from "@/components/ui/select";
import { useWarehouseVoucherForm } from "@/hooks/use-warehouse-vouchers";
import { persian } from "@/lib/utils";
import { voucherLabels, type VoucherDirection, type WarehouseVoucherOptions } from "@/lib/warehouse-vouchers";

export function WarehouseVoucherForm({ direction, options, open, onClose, onCreated }: {
  direction: VoucherDirection;
  options: WarehouseVoucherOptions;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const view = useWarehouseVoucherForm(direction, options, onCreated);
  const { form, errors, command, change, changeLine } = view;
  const labels = voucherLabels[direction];

  return (
    <Drawer open={open} title={labels.add} className="sm:max-w-2xl"
      onOpenChange={(open) => { if (!open && !command.busy) onClose(); }}>
      <Form onSubmit={(event) => { event.preventDefault(); view.save(); }} fieldErrors={command.error?.fields}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="voucher-date" name="date" label="تاریخ سند" required error={errors.date}>
            <PersianDatePicker label="تاریخ سند" value={form.date} onChange={(value) => change("date", value)} />
          </Field>
          <Field id="voucher-warehouse" name="warehouse_id" label={labels.warehouse} required error={errors.warehouseId}>
            <Select value={form.warehouseId} options={options.warehouses} searchable
              onValueChange={(value) => change("warehouseId", value)} />
          </Field>
          <Field id="voucher-account" name="offset_account_id" label="حساب مقابل" required error={errors.accountId}>
            <Select value={form.accountId} options={options.accounts} searchable
              onValueChange={(value) => change("accountId", value)} />
          </Field>
          <Field id="voucher-reference" name="reference" label="شماره مرجع">
            <Input value={form.reference} maxLength={120} onChange={(event) => change("reference", event.target.value)} />
          </Field>
        </div>
        <fieldset className="min-w-0 space-y-3">
          <legend className="mb-3 font-medium">اقلام کالا</legend>
          {view.lines.map((line, index) => {
            const selected = options.items.find((item) => item.value === line.itemId);
            return (
              <div key={line.id} className="space-y-3 rounded-control border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">ردیف {persian(index + 1)}</span>
                  {view.lines.length > 1 && (
                    <Button variant="ghost" className="min-w-11 px-2" aria-label={`حذف ردیف ${persian(index + 1)}`}
                      onClick={() => view.removeLine(line.id)}>
                      <XIcon size={18} aria-hidden />
                    </Button>
                  )}
                </div>
                <Field id={`voucher-item-${line.id}`} label="کالا" required error={errors[`itemId-${line.id}`]}>
                  <Select value={line.itemId} options={options.items} searchable
                    onValueChange={(value) => changeLine(line.id, "itemId", value)} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id={`voucher-quantity-${line.id}`} label={selected ? `مقدار (${selected.unit})` : "مقدار"}
                    required error={errors[`quantity-${line.id}`]}>
                    <Input inputMode="numeric" value={persian(line.quantity)}
                      onChange={(event) => changeLine(line.id, "quantity", event.target.value)} />
                  </Field>
                  {view.receipt && (
                    <Field id={`voucher-price-${line.id}`} label="بهای واحد (ریال)" required error={errors[`unitPrice-${line.id}`]}>
                      <AmountInput value={line.unitPrice} onValueChange={(value) => changeLine(line.id, "unitPrice", value)} />
                    </Field>
                  )}
                </div>
              </div>
            );
          })}
          <Button variant="secondary" onClick={view.addLine} disabled={view.lines.length >= Math.min(100, options.items.length)}>
            <PlusIcon size={18} aria-hidden />
            افزودن کالا
          </Button>
        </fieldset>
        <Field id="voucher-description" name="description" label="شرح">
          <Textarea value={form.description} rows={2} maxLength={500}
            onChange={(event) => change("description", event.target.value)} />
        </Field>
        <FormMessage error>{command.error?.message}</FormMessage>
        <Button type="submit" busy={command.busy}>ذخیره پیش‌نویس</Button>
      </Form>
    </Drawer>
  );
}
