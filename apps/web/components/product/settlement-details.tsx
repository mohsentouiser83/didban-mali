"use client";
import { DetailSection, DetailGroup, DetailField, fieldIcon, ControlLabel } from "@/components/ui/field-layout";
import { Form, FormMessage } from "@/components/ui/form";
import { StatusBadge } from "@/components/ui/financial/status-badge";
import { LoadingState, ErrorState, StatusMessage, EmptyState, toJalaliDate } from "@/components/ui/financial";

import { TablePagination } from "@/components/ui/table-pagination";
import { ActionTooltip, TruncatedText } from "@/components/ui/tooltip";
import { Calendar, FileText, Landmark, Wallet } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { settlementMoney as money } from "@/lib/settlements";
import type { useSettlements } from "./use-settlements";

export type SettlementDetailsController = Pick<ReturnType<typeof useSettlements>, "actionError" | "amount" | "bank" | "bankOffset" | "bankSearch" | "busy" | "changeBankSearch" | "chooseBank" | "complete" | "confirmHistory" | "detail" | "detailError" | "detailLoading" | "notice" | "open" | "retry" | "reverse" | "save" | "selected" | "setAmount" | "setBankOffset" | "setComplete" | "writable">;

export function SettlementDetails({ c }: { c: SettlementDetailsController }) {
  const invoice = c.detail?.invoice;
  return <Drawer size="wide" open={!!c.selected} onOpenChange={(open) => { if (!open) c.open(null); }} title="اتصال فاکتور به بانک">
    {c.detailLoading ? <LoadingState aria-busy="true" aria-label="دریافت جزئیات" variant="details"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></LoadingState> : c.detailError ? <ErrorState onRetry={c.retry} variant="compact" >{c.detailError}</ErrorState> : invoice && <>
      <DetailSection title={invoice.party_name || "طرف حساب نامشخص"}>
        <DetailGroup><DetailField icon={fieldIcon("شماره سند")} label="شماره سند">{invoice.number}</DetailField></DetailGroup>
        <DetailGroup>{invoice.invoice_no && invoice.invoice_no !== invoice.number && <DetailField icon={fieldIcon("شماره فاکتور")} label="شماره فاکتور">{invoice.invoice_no}</DetailField>}<DetailField icon={fieldIcon("تاریخ فاکتور")} label="تاریخ فاکتور">{toJalaliDate(invoice.issue_date)}</DetailField><DetailField icon={fieldIcon("مبلغ فاکتور")} label="مبلغ فاکتور">{money(invoice.gross_amount_irr)} ریال</DetailField><DetailField icon={fieldIcon("تخصیص تأییدشده")} label="تخصیص تأییدشده">{money(invoice.allocated_amount_irr)} ریال</DetailField><DetailField icon={fieldIcon("بدون تخصیص بانکی")} label="بدون تخصیص بانکی">{money(invoice.unallocated_amount_irr)} ریال</DetailField></DetailGroup>
        {invoice.review_reason && <StatusMessage tone="warning" >{invoice.review_reason}</StatusMessage>}
        {invoice.direction === "sales" && <div className="space-y-3 border-t border-border pt-3 text-sm"><p>{c.detail?.receipt_history_complete ? "تاریخچه وصول کامل است." : "مانده مطالبات نیازمند تأیید کامل‌بودن وصول‌هاست."}</p>{!c.detail?.receipt_history_complete && !invoice.review_reason && c.writable && <><ControlLabel className="flex min-h-11 items-center gap-2" icon={fieldIcon("تمام وصول‌های این فاکتور ثبت شده است")}><Checkbox disabled={c.busy} checked={c.complete} onCheckedChange={(value) => c.setComplete(value === true)} />تمام وصول‌های این فاکتور ثبت شده است</ControlLabel><Button variant="outline" disabled={!c.complete || c.busy} onClick={() => void c.confirmHistory()}>تأیید تاریخچه وصول</Button></>}</div>}
      </DetailSection>
      {!!c.detail?.allocations.length && <DetailSection title="سابقه تخصیص"><ul className="space-y-3">{c.detail.allocations.map((a) => <li key={a.id} className="space-y-2 rounded-[var(--ds-card-radius)] border border-border p-3 text-sm"><p className="flex min-w-0 items-center gap-2 leading-relaxed"><FileText size={18} aria-hidden="true" className="shrink-0 text-primary" /><TruncatedText text={a.description} /></p><div className="flex flex-wrap items-center justify-between gap-2"><span className="flex min-w-0 flex-wrap items-center gap-2"><Calendar size={18} aria-hidden="true" className="text-primary" />{toJalaliDate(a.booking_date)}<Wallet size={18} aria-hidden="true" className="text-primary" />{money(a.amount_irr)} ریال</span>{a.reversed ? <StatusBadge status="reversed" label="برگشت داده‌شده" /> : c.writable && <Button variant="ghost" disabled={c.busy} onClick={() => void c.reverse(a.id)}>برگشت تخصیص</Button>}</div></li>)}</ul></DetailSection>}
      {c.writable && !invoice.review_reason && invoice.unallocated_amount_irr !== "0" && <DetailSection title={invoice.direction === "sales" ? "انتخاب دریافت بانک" : "انتخاب پرداخت بانک"}>
        <ControlLabel htmlFor="settlement-bank-search" className="text-sm" icon={fieldIcon("جست‌وجوی شرح، شناسه یا مبلغ")}>جست‌وجوی شرح، شناسه یا مبلغ</ControlLabel><Input id="settlement-bank-search" value={c.bankSearch} disabled={c.busy} onChange={(e) => c.changeBankSearch(e.target.value)} />
        {!c.detail?.candidates.length && <EmptyState variant="inline" >تراکنش تخصیص‌پذیری پیدا نشد.</EmptyState>}
        <ul className="space-y-3">{c.detail?.candidates.map((b) => <li key={b.id}><ActionTooltip content={b.description || b.bank_label}><Button variant="surface" size="auto" type="button" disabled={c.busy} aria-pressed={c.bank?.id === b.id} onClick={() => c.chooseBank(b)} className="!block min-w-0 w-full space-y-2 rounded-[var(--ds-card-radius)] border border-border bg-card p-3 text-start text-sm transition-colors hover:bg-muted aria-pressed:border-primary aria-pressed:bg-muted focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50 motion-reduce:transition-none"><span className="flex flex-wrap justify-between gap-2 font-medium"><span className="flex min-w-0 items-center gap-2"><Landmark size={18} aria-hidden="true" className="shrink-0 text-primary" /><span className="truncate">{b.bank_label}</span>{c.bank?.id === b.id ? " ✓" : ""}</span><span className="flex items-center gap-2"><Wallet size={18} aria-hidden="true" className="shrink-0 text-primary" />{money(b.available_amount_irr)} ریال</span></span><span className="flex min-w-0 items-center gap-2 leading-relaxed"><FileText size={18} aria-hidden="true" className="shrink-0 text-primary" /><span className="block min-w-0 truncate">{b.description}</span></span><span className="flex min-w-0 items-center gap-2 text-muted-foreground"><Calendar size={18} aria-hidden="true" className="shrink-0 text-primary" /><span className="truncate">{toJalaliDate(b.booking_date)} · {b.reason}</span></span></Button></ActionTooltip></li>)}</ul>
        <TablePagination total={c.detail?.transaction_total ?? 0} page={Math.floor(c.bankOffset / 25)} pageSize={25} loading={c.busy || c.detailLoading} onPageChange={(page) => c.setBankOffset(page * 25)} />
        {c.bank && <Form className="space-y-4 rounded-[var(--ds-card-radius)] border border-border p-4" onSubmit={(e) => { e.preventDefault(); void c.save(); }}><ControlLabel htmlFor="allocation-amount" className="block text-sm" icon={fieldIcon("مبلغ تخصیص (ریال)")}>مبلغ تخصیص (ریال)</ControlLabel><Input id="allocation-amount" dir="ltr" inputMode="numeric" value={c.amount} disabled={c.busy} onChange={(e) => c.setAmount(e.target.value)} /><Button type="submit" loading={c.busy}>تأیید تخصیص</Button></Form>}
      </DetailSection>}
    </>}
    {c.actionError && <FormMessage>{c.actionError}</FormMessage>}{c.notice && <StatusMessage  >{c.notice}</StatusMessage>}
  </Drawer>;
}
