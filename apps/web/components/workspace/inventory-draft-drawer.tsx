"use client";

import {
  BarcodeIcon,
  CalendarBlankIcon,
  CoinsIcon,
  HashIcon,
  PackageIcon,
  StorefrontIcon,
  UserIcon,
  WalletIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { AmountInput, Input, Textarea } from "@/components/ui/input";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Select, type SelectOption } from "@/components/ui/select";
import { useInventoryDraft, type useInventoryOverview } from "@/hooks/use-inventory";
import { inventoryTitle, type InventoryOperation, type InventoryState } from "@/lib/inventory";

export function InventoryDraftDrawer({
  kind,
  open,
  inventory,
  accounts,
  onClose,
  onCreated,
}: {
  kind: InventoryOperation;
  open: boolean;
  inventory: InventoryState;
  accounts: SelectOption[];
  onClose: () => void;
  onCreated: ReturnType<typeof useInventoryOverview>["onDraftCreated"];
}) {
  const view = useInventoryDraft(kind, inventory, (result, operationKind, reference) => {
    onCreated(result, operationKind, reference);
    onClose();
  });
  const { value, change, command } = view;
  const item = inventory.items.find((item) => item.id === value.item_id);
  const unitLabel = value.unit === "IRR" ? "ریال" : "تومان";
  return (
    <Drawer
      open={open}
      title={inventoryTitle[kind]}
      onOpenChange={(open) => {
        if (!open && !command.busy) onClose();
      }}
      className="sm:max-w-2xl"
      footer={
        <Button type="submit" form="inventory-operation" busy={command.busy}>
          ساخت پیش‌نویس
        </Button>
      }
    >
      <Form
        id="inventory-operation"
        fieldErrors={view.fields}
        onSubmit={(event) => {
          event.preventDefault();
          view.save();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="inventory-item_id" name="item_id" label="کالا" icon={PackageIcon}>
            <Select
              id="inventory-item_id"
              label="کالا"
              value={value.item_id}
              onValueChange={(item_id) => change({ item_id })}
              options={inventory.items.map(({ id, code, name }) => ({
                value: id, label: `${code} · ${name}`,
              }))}
            />
          </Field>
          <Field id="inventory-warehouse_id" name="warehouse_id" label="انبار" icon={StorefrontIcon}>
            <Select
              id="inventory-warehouse_id"
              label="انبار"
              value={value.warehouse_id}
              onValueChange={(warehouse_id) => change({ warehouse_id })}
              options={inventory.warehouses.map(({ id, code, name }) => ({
                value: id, label: `${code} · ${name}`,
              }))}
            />
          </Field>
          <Field id="inventory-period_id" name="period_id" label="دوره مالی" icon={CalendarBlankIcon}>
            <Select
              id="inventory-period_id"
              label="دوره مالی"
              value={value.period_id}
              onValueChange={(period_id) => change({ period_id })}
              options={view.periods.map(({ id, name }) => ({ value: id, label: name }))}
            />
          </Field>
          <Field id="inventory-date" label="تاریخ سند" icon={CalendarBlankIcon}>
            <PersianDatePicker
              id="inventory-date"
              value={value.date}
              onChange={(date) => change({ date })}
            />
          </Field>
          <Field id="inventory-source_reference" name="source_reference" label="شماره مرجع" icon={BarcodeIcon}>
            <Input
              id="inventory-source_reference"
              required
              maxLength={120}
              value={value.source_reference}
              onChange={(event) => change({ source_reference: event.target.value })}
            />
          </Field>
          <Field id="inventory-party_id" name="party_id" label={view.sale ? "مشتری" : "تأمین‌کننده"} icon={UserIcon}>
            <Input
              id="inventory-party_id"
              required
              maxLength={100}
              value={value.party_id}
              onChange={(event) => change({ party_id: event.target.value })}
            />
          </Field>
          <Field id="inventory-quantity" label="تعداد" icon={HashIcon}>
            <Input
              id="inventory-quantity"
              inputMode="numeric"
              dir="ltr"
              required
              value={value.quantity}
              onChange={(event) => change({ quantity: event.target.value })}
            />
          </Field>
          <Field id="inventory-unit" label="واحد پول" icon={CoinsIcon}>
            <Select
              id="inventory-unit"
              label="واحد پول"
              value={value.unit}
              onValueChange={(unit) => change({ unit: unit === "TOMAN" ? "TOMAN" : "IRR" })}
              options={[
                { value: "IRR", label: "ریال" },
                { value: "TOMAN", label: "تومان" },
              ]}
            />
          </Field>
          <Field id="inventory-unit_price" name="unit_price" label={`قیمت واحد (${unitLabel})`} icon={CoinsIcon}>
            <AmountInput
              id="inventory-unit_price"
              required
              value={value.unit_price}
              onValueChange={(unit_price) => change({ unit_price })}
            />
          </Field>
          <Field
            id="inventory-counterparty_account_id"
            name="counterparty_account_id"
            label={view.sale ? "حساب دریافتنی تجاری" : "حساب پرداختنی تجاری"}
            icon={WalletIcon}
          >
            <Select
              id="inventory-counterparty_account_id"
              label={view.sale ? "حساب دریافتنی تجاری" : "حساب پرداختنی تجاری"}
              value={value.counterparty_account_id}
              onValueChange={(counterparty_account_id) => change({ counterparty_account_id })}
              options={accounts.filter((account) => account.value !== item?.inventory_account_id)}
            />
          </Field>
          {view.sale && (
            <>
              <Field id="inventory-revenue_account_id" name="revenue_account_id" label="حساب درآمد فروش" icon={WalletIcon}>
                <Select
                  id="inventory-revenue_account_id"
                  label="حساب درآمد فروش"
                  value={value.revenue_account_id}
                  onValueChange={(revenue_account_id) => change({ revenue_account_id })}
                  options={accounts}
                />
              </Field>
              <Field id="inventory-cost_account_id" name="cost_account_id" label="حساب بهای تمام‌شده" icon={WalletIcon}>
                <Select
                  id="inventory-cost_account_id"
                  label="حساب بهای تمام‌شده"
                  value={value.cost_account_id}
                  onValueChange={(cost_account_id) => change({ cost_account_id })}
                  options={accounts}
                />
              </Field>
            </>
          )}
        </div>
        <Field id="inventory-description" label="شرح سند">
          <Textarea
            id="inventory-description"
            maxLength={500}
            value={value.description}
            onChange={(event) => change({ description: event.target.value })}
          />
        </Field>
        <FormMessage error>{command.error?.message}</FormMessage>
      </Form>
    </Drawer>
  );
}
