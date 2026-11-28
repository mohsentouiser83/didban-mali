"use client";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { StatusMessage } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { AmountInput, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { amount } from "@/lib/utils";
import { toolLabel } from "@/hooks/use-treasury-documents";
import type { useTreasuryDocuments } from "@/hooks/use-treasury-documents";

export function TreasuryAllocationEditors({ view }: { view: Pick<ReturnType<typeof useTreasuryDocuments>,
    "docs" |
    "cmd" |
    "allocDoc" |
    "setAllocDoc" |
    "reversingAlloc" |
    "setReversingAlloc" |
    "selectedToolId" |
    "setSelectedToolId" |
    "selectedInvoiceId" |
    "setSelectedInvoiceId" |
    "allocAmount" |
    "setAllocAmount" |
    "reverseReason" |
    "setReverseReason" |
    "cpNames" |
    "allocInvOptions" |
    "submitAllocate" |
    "submitReverse" |
    "isReverseVersionConflict"
  > }) {
  const {
    docs,
    cmd,
    allocDoc,
    setAllocDoc,
    reversingAlloc,
    setReversingAlloc,
    selectedToolId,
    setSelectedToolId,
    selectedInvoiceId,
    setSelectedInvoiceId,
    allocAmount,
    setAllocAmount,
    reverseReason,
    setReverseReason,
    cpNames,
    allocInvOptions,
    submitAllocate,
    submitReverse,
    isReverseVersionConflict,
  } = view;
  return (
    <>
      <Drawer
        open={!!allocDoc}
        onOpenChange={(open) => { if (!open && !cmd.busy) setAllocDoc(null); }}
        title={allocDoc ? `تخصیص ابزار سند ${allocDoc.number}` : ""}
      >
        {allocDoc && (
          <Form onSubmit={(e) => { e.preventDefault(); submitAllocate(); }}>
            {!(allocDoc.has_payment_proof ?? allocDoc.state === "posted") && (
              <StatusMessage tone="warning">
                این سند خزانه پیش‌نویس بدون شاهد پرداخت است؛ ثبت تخصیص فقط پیش‌نویس تخصیص را نگه می‌دارد و تا ثبت شاهد بانکی/وصول چک یا تأیید سند، ماندهٔ فاکتور را تسویه‌شده نشان نمی‌دهد.
              </StatusMessage>
            )}
            <Field id="ta-tool" label="ابزار خزانه" required>
              <Select
                id="ta-tool"
                value={selectedToolId}
                onValueChange={setSelectedToolId}
                options={allocDoc.tools.map((t) => ({
                  value: t.id,
                  label: `${t.point_of_sale_name || toolLabel[t.tool_kind] || t.tool_kind} — قابل‌تخصیص: ${amount(t.remaining_amount ?? t.amount)} از ${amount(t.amount)} ریال`,
                }))}
              />
            </Field>
            <Field
              id="ta-inv"
              label={`فاکتور باز ${allocDoc.direction === "receipt" ? "فروش" : "خرید"} (${allocDoc.counterparty_name || cpNames[allocDoc.counterparty_id] || allocDoc.counterparty_id})`}
              required
            >
              <Select
                id="ta-inv"
                searchable
                value={selectedInvoiceId}
                onValueChange={setSelectedInvoiceId}
                options={allocInvOptions}
              />
              {allocInvOptions.length === 0 && (
                <p className="mt-1 text-xs text-muted">
                  فاکتور باز هم‌جهت با ماندهٔ مثبت برای این طرف‌حساب یافت نشد.
                </p>
              )}
            </Field>
            <Field id="ta-amt" label="مبلغ تخصیص (ریال)" required>
              <AmountInput id="ta-amt" required value={allocAmount} onValueChange={setAllocAmount} />
            </Field>
            <FormMessage error>{cmd.error?.message}</FormMessage>
            <Button type="submit" busy={cmd.busy} disabled={!selectedToolId || !selectedInvoiceId}>
              ثبت تخصیص به فاکتور
            </Button>
          </Form>
        )}
      </Drawer>
      <Dialog
        open={!!reversingAlloc}
        onOpenChange={(open) => {
          if (!open && !cmd.busy) {
            cmd.clearError();
            setReversingAlloc(null);
            setReverseReason("");
          }
        }}
        title="برگشت تخصیص خزانه"
      >
        {reversingAlloc && (
          <Form onSubmit={(e) => { e.preventDefault(); submitReverse(); }}>
            <div className="rounded-xl border border-border bg-canvas/60 p-3 text-xs text-secondary">
              سند خزانه{" "}
              <span dir="ltr" className="font-mono text-foreground">{reversingAlloc.documentNumber}</span>{" "}
              — مبلغ تخصیص:{" "}
              <span className="tabular-nums text-foreground">{amount(reversingAlloc.allocation.amount)} ریال</span>
            </div>
            <Field id="tr-rev-reason" label="دلیل برگشت" required>
              <Textarea
                id="tr-rev-reason"
                required
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
              />
            </Field>
            {isReverseVersionConflict ? (
              <div className="space-y-3 rounded-control bg-danger-soft p-3 text-danger" role="alert">
                <p className="text-sm">
                  نسخهٔ سند خزانه تغییر کرده و اطلاعات بازشده قدیمی است. برگشت به‌صورت خودکار تکرار نشد؛ فهرست اسناد را بازخوانی کنید و سند را دوباره بازبینی نمایید.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    cmd.clearError();
                    setReversingAlloc(null);
                    setReverseReason("");
                    docs.refresh();
                  }}
                >
                  بازخوانی و بازبینی اسناد
                </Button>
              </div>
            ) : (
              <FormMessage error>{cmd.error?.message}</FormMessage>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={cmd.busy}
                onClick={() => {
                  cmd.clearError();
                  setReversingAlloc(null);
                  setReverseReason("");
                }}
              >
                انصراف
              </Button>
              <Button
                type="submit"
                variant="danger"
                busy={cmd.busy}
                disabled={isReverseVersionConflict}
              >
                ثبت برگشت
              </Button>
            </div>
          </Form>
        )}
      </Dialog>
    </>
  );
}
