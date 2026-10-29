import { AppIcon } from "@/components/ui/app-icon";
import { useRef, useState } from "react";
import Link from "next/link";
import type { Schema } from "@didban/api-client";
import { PageHeader } from "@/features/companies/company-view";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { Dialog, ConfirmDialog } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import {
  Field,
  Input,
  Textarea,
  FormMessage,
  FieldError,
} from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableRowHeader,
} from "@/components/ui/table";

export type AllocationRow = {
  id: string;
  invoice: string;
  amount: string;
  date: string;
  reversed: boolean;
  provenance: string;
};
export type BankRow = {
  id: string;
  date: string;
  amount: string;
  reference: string;
  ready: boolean;
};
export function SettlementsView({
  company,
  date,
  revision,
  unit,
  rows,
  banks,
  canOperate,
  busy,
  error,
  onCreate,
  onReverse,
  onEvent,
}: {
  company: Schema<"Company">;
  date: string;
  revision: string;
  unit: string;
  rows: AllocationRow[];
  banks: BankRow[];
  canOperate: boolean;
  busy: boolean;
  error: string | null;
  onCreate: () => void;
  onReverse: (id: string) => void;
  onEvent: (id: string) => void;
}) {
  return (
    <section className="space-y-6 motion-safe:animate-reveal">
      <PageHeader
        icon="ArrowUpRight"
        title="دریافت‌وپرداخت"
        description={company.name}
        action={
          canOperate ? (
            <Button onClick={onCreate}>
              <AppIcon name="Plus" />
              ارتباط جدید
            </Button>
          ) : undefined
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          تا {date} · نسخه عملیاتی {revision}
        </p>
        <Button asChild variant="secondary">
          <Link href={`/companies/${company.id}/planned-payments`}>
            <AppIcon name="ArrowUpRight" />
            برنامه پرداخت
          </Link>
        </Button>
      </div>
      {error ? <FormMessage>{error}</FormMessage> : null}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <AppIcon name="Link2" className="text-primary" />
          ارتباط‌های ثبت‌شده
        </h2>
        {!rows.length ? (
          <EmptyState icon="Link2" title="ارتباطی ثبت نشده" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>فاکتور</TableHead>
                <TableHead>تاریخ</TableHead>
                <TableHead>مبلغ · {unit}</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead>عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableRowHeader>
                    <bdi>{row.invoice}</bdi>
                  </TableRowHeader>
                  <TableCell>{row.date}</TableCell>
                  <TableCell>{row.amount}</TableCell>
                  <TableCell>
                    <Badge>{row.reversed ? "برگشت‌شده" : "ثبت‌شده"}</Badge>
                  </TableCell>
                  <TableCell>
                    {canOperate && !row.reversed ? (
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => onReverse(row.id)}
                      >
                        <AppIcon name="Undo2" />
                        برگشت ارتباط
                      </Button>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <AppIcon name="Banknote" className="text-primary" />
          گردش‌های بانکی برای تخصیص
        </h2>
        {!banks.length ? (
          <EmptyState icon="Banknote" title="گردش بانکی موجود نیست" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>مرجع</TableHead>
                <TableHead>تاریخ</TableHead>
                <TableHead>مبلغ · {unit}</TableHead>
                <TableHead>عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {banks.map((row) => (
                <TableRow key={row.id}>
                  <TableRowHeader>
                    <bdi>{row.reference}</bdi>
                  </TableRowHeader>
                  <TableCell>{row.date}</TableCell>
                  <TableCell>{row.amount}</TableCell>
                  <TableCell>
                    {row.ready ? (
                      <Badge>رویداد تسویه موجود است</Badge>
                    ) : canOperate ? (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => onEvent(row.id)}
                      >
                        <AppIcon name="Link2" />
                        آماده‌سازی تخصیص
                      </Button>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </section>
  );
}
export function AllocationDialog({
  open,
  onClose,
  invoices,
  events,
  onSubmit,
  busy,
  error,
  amountError,
}: {
  open: boolean;
  onClose: () => void;
  invoices: { value: string; label: string }[];
  events: { value: string; label: string }[];
  onSubmit: (data: FormData) => void;
  busy: boolean;
  error: string | null;
  amountError: string | null;
}) {
  const [invoice, setInvoice] = useState(""),
    [event, setEvent] = useState("");
  return (
    <Dialog
      icon="ArrowUpRight"
      open={open}
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
      title="ارتباط دریافت یا پرداخت"
    >
      <Form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(new FormData(e.currentTarget));
        }}
      >
        <Field icon="FileText" id="allocation-invoice" label="فاکتور">
          <Select
            id="allocation-invoice"
            name="invoice_id"
            value={invoice}
            onValueChange={setInvoice}
            options={invoices}
            validate={(v) => (v ? null : "فاکتور را انتخاب کنید.")}
          />
        </Field>
        <Field
          icon="ArrowUpRight"
          id="allocation-event"
          label="رویداد دریافت یا پرداخت"
        >
          <Select
            id="allocation-event"
            name="event_id"
            value={event}
            onValueChange={setEvent}
            options={events}
            validate={(v) => (v ? null : "رویداد را انتخاب کنید.")}
          />
        </Field>
        <Field icon="Coins" id="allocation-amount" label="مبلغ تخصیص · ریال">
          <Input
            id="allocation-amount"
            name="amount"
            inputMode="decimal"
            required
            aria-invalid={!!amountError}
            aria-describedby={
              amountError ? "allocation-amount-error" : undefined
            }
          />
          <FieldError id="allocation-amount-error">{amountError}</FieldError>
        </Field>
        <Field icon="Link2" id="allocation-reason" label="دلیل ارتباط">
          <Textarea id="allocation-reason" name="reason" required />
        </Field>
        {error ? <FormMessage>{error}</FormMessage> : null}
        <Button type="submit" disabled={busy}>
          <AppIcon name="Save" />
          {busy ? "در حال ثبت…" : "ثبت ارتباط"}
        </Button>
      </Form>
    </Dialog>
  );
}
export function ReversalDialog({
  open,
  onClose,
  onSubmit,
  busy,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  busy: boolean;
  error: string | null;
}) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title="برگشت ارتباط"
      description="مبلغ جابه‌جا نمی‌شود؛ ارتباط دریافت یا پرداخت با فاکتور برگشت می‌خورد."
      busy={busy}
      onConfirm={() => form.current?.requestSubmit()}
    >
      <Form
        ref={form}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(
            String(new FormData(e.currentTarget).get("reason") ?? "").trim(),
          );
        }}
      >
        <Field icon="Link2" id="reversal-reason" label="دلیل برگشت">
          <Textarea id="reversal-reason" name="reason" required />
        </Field>
        {error ? <FormMessage>{error}</FormMessage> : null}
      </Form>
    </ConfirmDialog>
  );
}
