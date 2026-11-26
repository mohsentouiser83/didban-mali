"use client";

import { Button, ButtonLink } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { AmountInput, Input } from "@/components/ui/input";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Select, type SelectOption } from "@/components/ui/select";
import { stockOperations, useInventoryStockDraft, type InventoryStockOperation } from "@/hooks/use-inventory-stock-draft";
import type { InventoryState } from "@/lib/inventory";

export function InventoryStockDraftDrawer({ inventory, accounts, onClose }: {
  inventory: InventoryState;
  accounts: SelectOption[];
  onClose: () => void;
}) {
  const view = useInventoryStockDraft(inventory);
  const { form, change } = view;

  return (
    <Drawer open title="پیش‌نویس گردش انبار" onOpenChange={(open) => {
      if (!open && !view.command.busy) onClose();
    }}>
      {view.created ? (
        <ButtonLink href={`/accounting?review_draft=${encodeURIComponent(view.created.draft.id)}`}>
          مشاهده پیش‌نویس در اسناد
        </ButtonLink>
      ) : (
        <Form onSubmit={(event) => { event.preventDefault(); view.save(); }} fieldErrors={view.command.error?.fields}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="stock-kind" label="نوع گردش" required>
              <Select id="stock-kind" value={form.kind}
                options={Object.entries(stockOperations).map(([value, operation]) => ({ value, label: operation.label }))}
                onValueChange={(kind) => change({ kind: kind as InventoryStockOperation, accountId: "", unitPrice: "" })} />
            </Field>
            <Field id="stock-date" name="date" label="تاریخ گردش" required error={view.errors.date}>
              <PersianDatePicker id="stock-date" value={form.date} onChange={(date) => change({ date })} />
            </Field>
            <Field id="stock-item" name="item_id" label="کالا" required error={view.errors.itemId}>
              <Select id="stock-item" value={form.itemId} options={view.itemOptions} searchable
                onValueChange={(itemId) => change({ itemId })} />
            </Field>
            <Field id="stock-warehouse" name={view.transfer ? "source_warehouse_id" : "warehouse_id"}
              label={view.transfer ? "انبار مبدأ" : "انبار"} required error={view.errors.warehouseId}>
              <Select id="stock-warehouse" value={form.warehouseId} options={view.warehouseOptions} searchable
                onValueChange={(warehouseId) => change({ warehouseId, destinationId: "" })} />
            </Field>
            {view.transfer && (
              <Field id="stock-destination" name="destination_warehouse_id" label="انبار مقصد" required
                error={view.errors.destinationId}>
                <Select id="stock-destination" value={form.destinationId} searchable
                  options={view.warehouseOptions.filter((option) => option.value !== form.warehouseId)}
                  onValueChange={(destinationId) => change({ destinationId })} />
              </Field>
            )}
            <Field id="stock-quantity" name={view.adjustment ? "counted_quantity" : "quantity"}
              label={view.adjustment ? "تعداد شمارش‌شده" : "تعداد"} required error={view.errors.quantity}>
              <Input id="stock-quantity" inputMode="numeric" value={form.quantity}
                onChange={(event) => view.changeQuantity(event.target.value)} />
            </Field>
            {!view.transfer && (
              <>
                <Field id="stock-price" name="unit_price" label={view.adjustment ? "بهای هر واحد اضافی (ریال)" : "بهای واحد (ریال)"}
                  required={view.opening} error={view.errors.unitPrice}>
                  <AmountInput id="stock-price" value={form.unitPrice}
                    onValueChange={(unitPrice) => change({ unitPrice })} />
                </Field>
                <Field id="stock-account" name={view.opening ? "equity_account_id" : "adjustment_account_id"}
                  label={view.opening ? "حساب سرمایه" : "حساب تعدیل"} required error={view.errors.accountId}>
                  <Select id="stock-account" value={form.accountId} options={accounts} searchable
                    onValueChange={(accountId) => change({ accountId })} />
                </Field>
              </>
            )}
            <Field id="stock-description" name="description" label="شرح">
              <Input id="stock-description" value={form.description} maxLength={500}
                onChange={(event) => change({ description: event.target.value })} />
            </Field>
          </div>
          <FormMessage error>{view.command.error?.message}</FormMessage>
          <Button type="submit" busy={view.command.busy}>ساخت پیش‌نویس</Button>
        </Form>
      )}
    </Drawer>
  );
}
