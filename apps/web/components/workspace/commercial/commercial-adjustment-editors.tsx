"use client";

import type { ReactNode } from "react";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { AmountInput, Input, Textarea } from "@/components/ui/input";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableRowHeader } from "@/components/ui/table";
import { amount, persian } from "@/lib/utils";
import type { useCommercialDocuments } from "@/hooks/use-commercial-documents";

export function CommercialAdjustmentEditors({ view, children }: { children?: ReactNode; view: Pick<ReturnType<typeof useCommercialDocuments>,
    "workspace" |
    "cmd" |
    "detailDoc" |
    "setDetailDoc" |
    "decidingQuarantine" |
    "setDecidingQuarantine" |
    "creditAction" |
    "setCreditAction" |
    "retDate" |
    "setRetDate" |
    "retReason" |
    "setRetReason" |
    "retQuantities" |
    "setRetQuantities" |
    "retConditions" |
    "setRetConditions" |
    "qDecision" |
    "setQDecision" |
    "qDate" |
    "setQDate" |
    "qNote" |
    "setQNote" |
    "qCostAccountId" |
    "setQCostAccountId" |
    "creditTargetDocId" |
    "setCreditTargetDocId" |
    "creditAmount" |
    "setCreditAmount" |
    "creditDate" |
    "setCreditDate" |
    "creditCashAccount" |
    "setCreditCashAccount" |
    "creditCpAccount" |
    "setCreditCpAccount" |
    "creditReason" |
    "setCreditReason" |
    "cpNames" |
    "accOptions" |
    "handleSubmitReturn" |
    "handleQuarantineDecision" |
    "handleCreditSubmit" |
    "eligibleTargetDocs"
  > }) {
  const {
    workspace,
    cmd,
    detailDoc,
    setDetailDoc,
    decidingQuarantine,
    setDecidingQuarantine,
    creditAction,
    setCreditAction,
    retDate,
    setRetDate,
    retReason,
    setRetReason,
    retQuantities,
    setRetQuantities,
    retConditions,
    setRetConditions,
    qDecision,
    setQDecision,
    qDate,
    setQDate,
    qNote,
    setQNote,
    qCostAccountId,
    setQCostAccountId,
    creditTargetDocId,
    setCreditTargetDocId,
    creditAmount,
    setCreditAmount,
    creditDate,
    setCreditDate,
    creditCashAccount,
    setCreditCashAccount,
    creditCpAccount,
    setCreditCpAccount,
    creditReason,
    setCreditReason,
    cpNames,
    accOptions,
    handleSubmitReturn,
    handleQuarantineDecision,
    handleCreditSubmit,
    eligibleTargetDocs,
  } = view;
  return (
    <>
      <Drawer
        open={!!detailDoc}
        onOpenChange={(open) => {
          if (!open && !cmd.busy) setDetailDoc(null);
        }}
        title={detailDoc ? `جزئیات و مرجوعی فاکتور ${detailDoc.number}` : ""}
        className="sm:max-w-3xl"
      >
        {detailDoc && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-canvas/50 p-3 text-xs">
              <span>
                طرف حساب: <b>{detailDoc.party_name || detailDoc.party_snapshot?.name || "—"}</b>
              </span>
              {detailDoc.warehouse_name && (
                <span>
                  انبار: <b>{detailDoc.warehouse_name}</b>
                </span>
              )}
              <span>
                مانده باز: <b>{detailDoc.open_balance_irr != null ? `${amount(detailDoc.open_balance_irr)} ریال` : "—"}</b>
              </span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>شرح</TableHead>
                    <TableHead>تعداد کل / قابل برگشت</TableHead>
                    <TableHead>سهم تخفیف کل</TableHead>
                    <TableHead>خالص ردیف</TableHead>
                    <TableHead>تعداد برگشت</TableHead>
                    <TableHead>وضعیت کالا</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailDoc.lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableRowHeader>{l.description}</TableRowHeader>
                      <TableCell className="tabular-nums">
                        {persian(l.quantity)} / {persian(l.remaining_returnable_qty)} {l.unit}
                      </TableCell>
                      <TableCell className="tabular-nums">{amount(l.allocated_invoice_discount_irr)}</TableCell>
                      <TableCell className="tabular-nums">{amount(l.net_amount_irr)}</TableCell>
                      <TableCell className="w-24">
                        <Input
                          type="number"
                          min={0}
                          max={l.remaining_returnable_qty}
                          value={retQuantities[l.id] ?? ""}
                          onChange={(e) => setRetQuantities((prev) => ({ ...prev, [l.id]: e.target.value }))}
                        />
                      </TableCell>
                      <TableCell className="w-36">
                        <Select
                          value={retConditions[l.id] ?? "healthy"}
                          onValueChange={(v) => setRetConditions((prev) => ({ ...prev, [l.id]: v as "healthy" | "defective" }))}
                          options={[
                            { value: "healthy", label: "سالم (بازگشت FIFO)" },
                            { value: "defective", label: "معیوب (قرنطینه)" },
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {workspace.canWrite && (detailDoc.status === "posted" || detailDoc.status === "partially_returned") ? (
              <Form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSubmitReturn();
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id="ret-date" label="تاریخ برگشت" required>
                    <PersianDatePicker id="ret-date" value={retDate} onChange={setRetDate} />
                  </Field>
                  <Field id="ret-reason" label="دلیل مرجوعی" required>
                    <Input id="ret-reason" required value={retReason} onChange={(e) => setRetReason(e.target.value)} />
                  </Field>
                </div>
                <FormMessage error>{cmd.error?.message}</FormMessage>
                <Button type="submit" busy={cmd.busy}>
                  <ArrowCounterClockwiseIcon size={16} aria-hidden />
                  ایجاد پیش‌نویس مرجوعی
                </Button>
              </Form>
            ) : (
              <StatusMessage>ثبت مرجوعی فقط پس از ثبت نهایی فاکتور مجاز است.</StatusMessage>
            )}
            {children}
          </div>
        )}
      </Drawer>
      <Drawer
        open={!!decidingQuarantine}
        onOpenChange={(open) => {
          if (!open && !cmd.busy) setDecidingQuarantine(null);
        }}
        title="تعیین تکلیف کالای معیوب (قرنطینه)"
      >
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            handleQuarantineDecision();
          }}
        >
          {decidingQuarantine?.warehouse_name && (
            <StatusMessage>انبار مرتبط: {decidingQuarantine.warehouse_name}</StatusMessage>
          )}
          <Field id="q-decision" label="تصمیم کارشناسی" required>
            <Select
              id="q-decision"
              value={qDecision}
              onValueChange={(v) => setQDecision(v as "restocked" | "repaired" | "scrapped")}
              options={[
                { value: "restocked", label: "بازگشت به موجودی قابل فروش انبار" },
                { value: "repaired", label: "تعمیر و اصلاح وضعیت" },
                { value: "scrapped", label: "اسقاط و ثبت ضایعات" },
              ]}
            />
          </Field>
          {qDecision === "restocked" && (
            <Field id="q-cost-acc" label="حساب بهای تمام‌شده">
              <Select id="q-cost-acc" searchable value={qCostAccountId} onValueChange={setQCostAccountId} options={accOptions} />
            </Field>
          )}
          <Field id="q-date" label="تاریخ" required>
            <PersianDatePicker id="q-date" value={qDate} onChange={setQDate} />
          </Field>
          <Field id="q-note" label="شرح تصمیم" required>
            <Textarea id="q-note" required value={qNote} onChange={(e) => setQNote(e.target.value)} />
          </Field>
          <FormMessage error>{cmd.error?.message}</FormMessage>
          <Button type="submit" busy={cmd.busy}>
            ثبت تصمیم و ساخت پیش‌نویس
          </Button>
        </Form>
      </Drawer>
      <Drawer
        open={!!creditAction}
        onOpenChange={(open) => {
          if (!open && !cmd.busy) setCreditAction(null);
        }}
        title={creditAction?.mode === "apply" ? "اعمال اعتبار به فاکتور" : "ایجاد پیش‌نویس استرداد اعتبار"}
      >
        {creditAction && (
          <Form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreditSubmit();
            }}
          >
            <StatusMessage>
              طرف حساب:{" "}
              {creditAction.credit.counterparty_name || cpNames[creditAction.credit.counterparty_id] || creditAction.credit.counterparty_id}
              {" · "}مانده قابل استفاده: {amount(creditAction.credit.remaining_amount_irr)} ریال
            </StatusMessage>
            {creditAction.mode === "apply" ? (
              <Field id="cr-target-doc" label="فاکتور مقصد (دارای مانده باز)" required>
                <Select
                  id="cr-target-doc"
                  searchable
                  value={creditTargetDocId}
                  onValueChange={setCreditTargetDocId}
                  options={eligibleTargetDocs.map((d) => ({
                    value: d.id,
                    label: `${d.number} — مانده: ${amount(d.open_balance_irr || d.net_amount_irr)} ریال`,
                  }))}
                />
              </Field>
            ) : (
              <>
                <Field id="cr-cash-acc" label="حساب نقد/بانک" required>
                  <Select id="cr-cash-acc" searchable value={creditCashAccount} onValueChange={setCreditCashAccount} options={accOptions} />
                </Field>
                <Field id="cr-cp-acc" label="حساب طرف حساب" required>
                  <Select id="cr-cp-acc" searchable value={creditCpAccount} onValueChange={setCreditCpAccount} options={accOptions} />
                </Field>
                <Field id="cr-reason" label="شرح استرداد" required>
                  <Input id="cr-reason" required value={creditReason} onChange={(e) => setCreditReason(e.target.value)} />
                </Field>
              </>
            )}
            <Field id="cr-amt" label="مبلغ (ریال)" required>
              <AmountInput id="cr-amt" required value={creditAmount} onValueChange={setCreditAmount} />
            </Field>
            <Field id="cr-date" label="تاریخ" required>
              <PersianDatePicker id="cr-date" value={creditDate} onChange={setCreditDate} />
            </Field>
            <FormMessage error>{cmd.error?.message}</FormMessage>
            <Button type="submit" busy={cmd.busy} disabled={creditAction.mode === "apply" && !creditTargetDocId}>
              ثبت
            </Button>
          </Form>
        )}
      </Drawer>
    </>
  );
}
