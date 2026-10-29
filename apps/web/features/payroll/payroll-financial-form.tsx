"use client";
import { useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Field, Input, FormMessage } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { PayrollDateField } from "./payroll-fields";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/features/results/presentation";
import {
  LoadingState,
  ErrorState,
  StatusMessage,
} from "@/components/ui/states";
export type FinancialOptions = {
  content: {
    plans: {
      id: string;
      title: string;
      scheduled_on: string;
      total_amount: string;
      version: number;
    }[];
    source_manifest_id: string | null;
    ledger_lines: {
      id: string;
      entry: string;
      date: string;
      account_code: string;
      account_name: string;
      credit: string;
    }[];
    truncated: boolean;
    plans_truncated: boolean;
    ledger_truncated: boolean;
  };
};
export function PayrollFinancialForm({
  options,
  loading,
  error,
  busy,
  onClose,
  onRetry,
  onSubmit,
}: {
  options?: FinancialOptions;
  loading: boolean;
  error?: string;
  busy: boolean;
  onClose: () => void;
  onRetry: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const [plan, setPlan] = useState("new");
  const existing = options?.content.plans.find((p) => p.id === plan);
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title="اتصال حقوق به برنامه پرداخت"
      busy={busy}
    >
      {loading ? (
        <LoadingState />
      ) : !options ? (
        <ErrorState
          message={error ?? "اطلاعات برنامه پرداخت دریافت نشد."}
          onRetry={onRetry}
        />
      ) : (
        <Form onSubmit={onSubmit} className="space-y-5">
          <Field id="existing_plan_id" label="برنامه پرداخت">
            <Select
              id="existing_plan_id"
              name="existing_plan_id"
              value={plan}
              onValueChange={setPlan}
              options={[
                ...(options.content.plans_truncated
                  ? []
                  : [{ value: "new", label: "ایجاد برنامه تجمیعی حقوق" }]),
                ...options.content.plans.map((p) => ({
                  value: p.id,
                  label:
                    p.title +
                    " · " +
                    formatMoney(p.total_amount, "IRR") +
                    " ریال",
                })),
              ]}
            />
          </Field>
          {options.content.plans_truncated ? (
            <StatusMessage>
              فقط ۱۰۰۰ برنامه نخست نمایش داده شده؛ ساخت برنامه تازه بسته است.
              برنامه موجود را انتخاب کنید.
            </StatusMessage>
          ) : null}
          <PayrollDateField
            key={plan}
            id="scheduled_on"
            name="scheduled_on"
            label="تاریخ پرداخت"
            initialValue={existing?.scheduled_on}
            required
          />
          <Field id="financial_reason" label="علت اتصال">
            <Input
              id="financial_reason"
              name="reason"
              required
              maxLength={1000}
            />
          </Field>
          <details className="rounded-control border border-border p-4">
            <summary className="cursor-pointer text-sm font-medium">
              مقایسه با ثبت‌های دفتر
            </summary>
            <div className="mt-4 space-y-3">
              {options.content.ledger_truncated ? (
                <StatusMessage>
                  فقط ۱۰۰۰ ردیف نخست دفتر نمایش داده شده؛ این انتخاب پوشش کامل
                  دفتر را نشان نمی‌دهد.
                </StatusMessage>
              ) : null}
              {options.content.ledger_lines.length ? (
                options.content.ledger_lines.map((line) => (
                  <Checkbox
                    key={line.id}
                    id={`ledger-${line.id}`}
                    name="ledger_line_ids"
                    value={line.id}
                    label={`سند ${line.entry} · ${line.account_name} · ${formatMoney(line.credit, "IRR")} ریال`}
                  />
                ))
              ) : (
                <p className="text-sm text-muted">
                  ردیف بستانکار قابل مقایسه موجود نیست.
                </p>
              )}
            </div>
          </details>
          <FormMessage>{error}</FormMessage>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" disabled={busy} onClick={onClose}>
              انصراف
            </Button>
            <Button
              type="submit"
              disabled={
                busy || (options.content.plans_truncated && plan === "new")
              }
            >
              {busy ? "در حال ثبت…" : "تأیید اتصال"}
            </Button>
          </div>
        </Form>
      )}
    </Dialog>
  );
}
