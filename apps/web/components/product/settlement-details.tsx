"use client";
import { Form, FormMessage } from "@/components/ui/form";
import { StatusBadge } from "@/components/ui/financial/status-badge";
import { LoadingState, ErrorState, StatusMessage, EmptyState, toJalaliDate } from "@/components/ui/financial";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerDetails, DrawerSection } from "@/components/ui/drawer";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { settlementMoney as money } from "@/lib/settlements";
import type { useSettlements } from "./use-settlements";

export function SettlementDetails({ c }: { c: ReturnType<typeof useSettlements> }) {
  const invoice = c.detail?.invoice;
  return <Drawer open={!!c.selected} onOpenChange={(open) => { if (!open) c.open(null); }} title="اتصال فاکتور به بانک">
    {c.detailLoading ? <LoadingState aria-busy="true" aria-label="دریافت جزئیات" variant="details"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></LoadingState> : c.detailError ? <ErrorState onRetry={c.retry} variant="compact" >{c.detailError}</ErrorState> : invoice && <>
      <DrawerSection title={invoice.party_name || "طرف حساب نامشخص"}>
        <p dir="ltr" className="break-all text-end text-sm">{invoice.number}</p>
        <DrawerDetails>{invoice.invoice_no && invoice.invoice_no !== invoice.number && <div><dt>شماره فاکتور</dt><dd dir="ltr">{invoice.invoice_no}</dd></div>}<div><dt>تاریخ فاکتور</dt><dd>{toJalaliDate(invoice.issue_date)}</dd></div><div><dt>مبلغ فاکتور</dt><dd>{money(invoice.gross_amount_irr)} ریال</dd></div><div><dt>تخصیص تأییدشده</dt><dd>{money(invoice.allocated_amount_irr)} ریال</dd></div><div><dt>بدون تخصیص بانکی</dt><dd>{money(invoice.unallocated_amount_irr)} ریال</dd></div></DrawerDetails>
        {invoice.review_reason && <StatusMessage tone="warning" >{invoice.review_reason}</StatusMessage>}
        {invoice.direction === "sales" && <div className="space-y-3 border-t border-border pt-3 text-sm"><p>{c.detail?.receipt_history_complete ? "تاریخچه وصول کامل است." : "مانده مطالبات نیازمند تأیید کامل‌بودن وصول‌هاست."}</p>{!c.detail?.receipt_history_complete && !invoice.review_reason && c.writable && <><label className="flex min-h-11 items-center gap-2"><Checkbox disabled={c.busy} checked={c.complete} onCheckedChange={(value) => c.setComplete(value === true)} />تمام وصول‌های این فاکتور ثبت شده است</label><Button variant="outline" disabled={!c.complete || c.busy} onClick={() => void c.confirmHistory()}>تأیید تاریخچه وصول</Button></>}</div>}
      </DrawerSection>
      {!!c.detail?.allocations.length && <DrawerSection title="سابقه تخصیص"><ul className="space-y-3">{c.detail.allocations.map((a) => <li key={a.id} className="space-y-2 rounded-[var(--ds-card-radius)] border border-border p-3 text-sm"><p className="break-words leading-relaxed">{a.description}</p><div className="flex flex-wrap items-center justify-between gap-2"><span>{toJalaliDate(a.booking_date)} · {money(a.amount_irr)} ریال</span>{a.reversed ? <StatusBadge status="reversed" label="برگشت داده‌شده" /> : c.writable && <Button variant="ghost" disabled={c.busy} onClick={() => void c.reverse(a.id)}>برگشت تخصیص</Button>}</div></li>)}</ul></DrawerSection>}
      {c.writable && !invoice.review_reason && invoice.unallocated_amount_irr !== "0" && <DrawerSection title={invoice.direction === "sales" ? "انتخاب دریافت بانک" : "انتخاب پرداخت بانک"}>
        <label htmlFor="settlement-bank-search" className="text-sm">جست‌وجوی شرح، شناسه یا مبلغ</label><Input id="settlement-bank-search" value={c.bankSearch} disabled={c.busy} onChange={(e) => c.changeBankSearch(e.target.value)} />
        {!c.detail?.candidates.length && <EmptyState variant="inline" >تراکنش تخصیص‌پذیری پیدا نشد.</EmptyState>}
        <ul className="space-y-3">{c.detail?.candidates.map((b) => <li key={b.id}><Button variant="surface" size="auto" type="button" disabled={c.busy} aria-pressed={c.bank?.id === b.id} onClick={() => c.chooseBank(b)} className="!block w-full space-y-2 rounded-[var(--ds-card-radius)] border border-border bg-card p-3 text-start text-sm transition-colors hover:bg-muted aria-pressed:border-primary aria-pressed:bg-muted focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50 motion-reduce:transition-none"><span className="flex flex-wrap justify-between gap-2 font-medium"><span>{b.bank_label}{c.bank?.id === b.id ? " ✓" : ""}</span><span>{money(b.available_amount_irr)} ریال</span></span><span className="block break-words leading-relaxed">{b.description}</span><span className="block text-muted-foreground">{toJalaliDate(b.booking_date)} · {b.reason}</span></Button></li>)}</ul>
        <div className="flex items-center justify-between gap-2"><Button variant="outline" disabled={c.busy || c.bankOffset === 0} onClick={() => c.setBankOffset(Math.max(0, c.bankOffset - 25))}>قبلی</Button><span className="text-sm">{(c.detail?.transaction_total ?? 0).toLocaleString("fa-IR")} تراکنش</span><Button variant="outline" disabled={c.busy || c.bankOffset + 25 >= (c.detail?.transaction_total ?? 0)} onClick={() => c.setBankOffset(c.bankOffset + 25)}>بعدی</Button></div>
        {c.bank && <Form className="space-y-4 rounded-[var(--ds-card-radius)] border border-border p-4" onSubmit={(e) => { e.preventDefault(); void c.save(); }}><label htmlFor="allocation-amount" className="block text-sm">مبلغ تخصیص (ریال)</label><Input id="allocation-amount" dir="ltr" inputMode="numeric" value={c.amount} disabled={c.busy} onChange={(e) => c.setAmount(e.target.value)} /><Button type="submit" loading={c.busy}>تأیید تخصیص</Button></Form>}
      </DrawerSection>}
    </>}
    {c.actionError && <FormMessage>{c.actionError}</FormMessage>}{c.notice && <StatusMessage  >{c.notice}</StatusMessage>}
  </Drawer>;
}
