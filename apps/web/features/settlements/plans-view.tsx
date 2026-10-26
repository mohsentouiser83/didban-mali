import { useState } from "react";
import type { Schema } from "@didban/api-client";
import { PageHeader } from "@/features/companies/company-view";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Field, Input, FormMessage, FieldError } from "@/components/ui/field";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/states";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableRowHeader,
} from "@/components/ui/table";
export type PlanRow = {
  id: string;
  title: string;
  date: string;
  total: string;
  remaining: string;
  state: string;
  active: boolean;
};
export type RecurrenceRow = {
  id: string;
  title: string;
  date: string;
  amount: string;
  state: string;
  proposed: boolean;
};
export function PlansView({
  company,
  asOf,
  rows,
  proposals,
  unit,
  canOperate,
  busy,
  error,
  onCreate,
  onEdit,
  onCancel,
  onProposal,
}: {
  company: Schema<"Company">;
  asOf?: string;
  rows: PlanRow[];
  proposals: RecurrenceRow[];
  unit: string;
  canOperate: boolean;
  busy: boolean;
  error: string | null;
  onCreate: () => void;
  onEdit: (id: string) => void;
  onCancel: (id: string) => void;
  onProposal: (id: string, action: "accept" | "reject") => void;
}) {
  return (
    <section className="space-y-6 motion-safe:animate-reveal">
      <PageHeader
        title="برنامه پرداخت"
        description={company.name}
        action={
          canOperate ? <Button onClick={onCreate}>تعهد جدید</Button> : undefined
        }
      />
      {asOf ? <p className="text-xs text-muted">مانده‌ها تا {asOf}</p> : null}
      {error ? <FormMessage>{error}</FormMessage> : null}
      {!rows.length ? (
        <EmptyState title="برنامه‌ای ثبت نشده" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>تعهد</TableHead>
              <TableHead>تاریخ</TableHead>
              <TableHead>کل تعهد · {unit}</TableHead>
              <TableHead>مانده · {unit}</TableHead>
              <TableHead>وضعیت</TableHead>
              <TableHead>عملیات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableRowHeader>{row.title}</TableRowHeader>
                <TableCell>{row.date}</TableCell>
                <TableCell>{row.total}</TableCell>
                <TableCell>{row.remaining}</TableCell>
                <TableCell>
                  <Badge>{row.state}</Badge>
                </TableCell>
                <TableCell>
                  {canOperate && row.active ? (
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={() => onEdit(row.id)}>
                        ویرایش
                      </Button>
                      <Button variant="ghost" onClick={() => onCancel(row.id)}>
                        لغو
                      </Button>
                    </div>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <section className="space-y-4">
        <h2 className="text-sm font-medium">پیشنهاد پرداخت تکرارشونده</h2>
        {!proposals.length ? (
          <EmptyState title="الگوی تکرار قابل اتکا پیدا نشده" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {proposals.map((p) => (
              <article
                key={p.id}
                className="space-y-4 rounded-panel border border-border bg-surface p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium">{p.title}</h3>
                  <Badge>{p.state}</Badge>
                </div>
                <p className="tabular-nums">
                  {p.amount} {unit} · {p.date}
                </p>
                {canOperate && p.proposed ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={busy}
                      onClick={() => onProposal(p.id, "accept")}
                    >
                      بررسی و افزودن تعهد
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => onProposal(p.id, "reject")}
                    >
                      رد پیشنهاد
                    </Button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
export function PlanDialog({
  open,
  onClose,
  plan,
  invoices,
  busy,
  error,
  amountError,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  plan: Schema<"PlannedPayment"> | null;
  invoices: { value: string; label: string }[];
  busy: boolean;
  error: string | null;
  amountError: string | null;
  onSubmit: (data: FormData) => void;
}) {
  const [invoice, setInvoice] = useState(plan?.invoice_id ?? ""),
    [unit, setUnit] = useState("IRR");
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
      title={plan ? "ویرایش برنامه" : "تعهد جدید"}
    >
      <Form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(new FormData(e.currentTarget));
        }}
      >
        <Field id="plan-title" label="عنوان تعهد">
          <Input
            id="plan-title"
            name="title"
            defaultValue={plan?.title}
            required
          />
        </Field>
        <Field id="plan-date" label="تاریخ مورد انتظار">
          <PersianDatePicker
            id="plan-date"
            name="scheduled_on"
            label="تاریخ مورد انتظار"
            initialValue={plan?.scheduled_on}
            required
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Field id="plan-amount" label="کل مبلغ تعهد">
              <Input
                id="plan-amount"
                name="total_amount"
                inputMode="decimal"
                defaultValue={plan?.total_amount}
                required
                aria-invalid={!!amountError}
                aria-describedby={amountError ? "plan-amount-error" : undefined}
              />
              <FieldError id="plan-amount-error">{amountError}</FieldError>
            </Field>
          </div>
          <Field id="plan-unit" label="واحد">
            <Select
              id="plan-unit"
              name="unit"
              value={unit}
              onValueChange={setUnit}
              options={[
                { value: "IRR", label: "ریال" },
                { value: "IRT", label: "تومان" },
              ]}
            />
          </Field>
        </div>
        {!plan ? (
          <Field id="plan-invoice" label="فاکتور مرتبط">
            <Select
              id="plan-invoice"
              name="invoice_id"
              value={invoice}
              onValueChange={setInvoice}
              options={[{ value: "none", label: "تعهد مستقل" }, ...invoices]}
            />
          </Field>
        ) : null}
        {error ? <FormMessage>{error}</FormMessage> : null}
        <Button type="submit" disabled={busy}>
          {busy ? "در حال ثبت…" : "ثبت برنامه"}
        </Button>
      </Form>
    </Dialog>
  );
}
