"use client";

import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { AmountInput, Input } from "@/components/ui/input";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Select } from "@/components/ui/select";
import { useProformaConversion } from "@/hooks/use-commercial";
import type { Proforma } from "@/lib/commercial";
import { amount } from "@/lib/utils";

const baseAccountFields = [
  ["revenue_account_id", "حساب درآمد فروش"],
  ["cost_account_id", "حساب بهای تمام‌شده"],
] as const;

const settlementOptions = [
  { value: "on_account", label: "نسیه" },
  { value: "cash", label: "نقدی" },
  { value: "mixed", label: "ترکیبی" },
];

const mixedFields = [
  ["cash_amount", "مبلغ نقد"],
  ["cheque_amount", "مبلغ چک"],
  ["on_account_amount", "مبلغ نسیه"],
] as const;

export function ProformaConversion({ row, onClose, onComplete }: {
  row: Proforma;
  onClose: () => void;
  onComplete: () => void;
}) {
  const view = useProformaConversion(row, onComplete);
  const error = view.inventory.error ?? view.accounts.error;
  const loading = view.inventory.loading || view.accounts.loading;
  const accountFields = [
    ...baseAccountFields,
    ...(view.onAccount ? [["counterparty_account_id", "حساب دریافتنی تجاری"]] as const : []),
    ...(view.cash ? [["cash_account_id", "حساب نقد یا بانک"]] as const : []),
    ...(view.cheque ? [["cheque_account_id", "حساب اسناد دریافتنی"]] as const : []),
  ];
  const unit = row.currency === "TOMAN" ? "تومان" : "ریال";
  return (
    <Drawer
      open
      title="ساخت پیش‌نویس فروش"
      onOpenChange={(open) => {
        if (!open && !view.command.busy) onClose();
      }}
      footer={
        <Button type="submit" form="proforma-conversion" busy={view.command.busy}
          disabled={!view.valid || loading || !!error}>
          ساخت پیش‌نویس
        </Button>
      }
    >
      {loading ? <LoadingState /> : error ? (
        <ErrorState message={error.message} onRetry={() => {
          view.inventory.refresh();
          view.accounts.refresh();
        }} />
      ) : (
        <form id="proforma-conversion" className="space-y-4" onSubmit={(event) => {
          event.preventDefault();
          view.save();
        }}>
          <p>مبلغ فاکتور <bdi>{amount(row.total_amount)} {unit}</bdi></p>
          <div className="grid gap-4 sm:grid-cols-2">

            <Field id="proforma-conversion-warehouse" label="انبار" required>
              <Select id="proforma-conversion-warehouse" value={view.values.warehouse_id}
                options={view.inventory.data?.warehouses.map(({ id, name }) => ({ value: id, label: name })) ?? []}
                onValueChange={(warehouse_id) => view.setValues((previous) => ({ ...previous, warehouse_id }))} />
            </Field>
            <Field id="proforma-conversion-settlement" label="نوع تسویه" required>
              <Select id="proforma-conversion-settlement" value={view.values.settlement_type} options={settlementOptions}
                onValueChange={(settlement_type) => view.setValues((previous) => ({ ...previous, settlement_type }))} />
            </Field>
            {view.mixed && mixedFields.map(([key, label]) => (
              <Field key={key} id={`proforma-conversion-${key}`} label={`${label} (${unit})`}>
                <AmountInput id={`proforma-conversion-${key}`} value={view.values[key]}
                  onValueChange={(value) => view.setValues((previous) => ({ ...previous, [key]: value }))} />
              </Field>
            ))}
            {view.cheque && (
              <>
                <Field id="proforma-conversion-cheque-number" label="شماره چک" required>
                  <Input id="proforma-conversion-cheque-number" value={view.values.cheque_number} maxLength={100}
                    onChange={(event) => view.setValues((previous) => ({ ...previous, cheque_number: event.target.value }))} />
                </Field>
                <Field id="proforma-conversion-cheque-date" label="سررسید چک" required>
                  <PersianDatePicker id="proforma-conversion-cheque-date" value={view.values.cheque_due_date}
                    onChange={(cheque_due_date) => view.setValues((previous) => ({ ...previous, cheque_due_date }))} />
                </Field>
              </>
            )}
            {accountFields.map(([key, label]) => {
              const options =
                key === "cash_account_id" && view.accounts.treasuryOptions.length > 0
                  ? view.accounts.treasuryOptions
                  : view.accounts.options;
              return (
                <Field key={key} id={`proforma-conversion-${key}`} label={label} required>
                  <Select id={`proforma-conversion-${key}`} value={view.values[key]} options={options}
                    onValueChange={(value) => view.setValues((previous) => ({ ...previous, [key]: value }))} />
                </Field>
              );
            })}
          </div>
          <FormMessage error>{view.command.error?.message}</FormMessage>
        </form>
      )}
    </Drawer>
  );
}
