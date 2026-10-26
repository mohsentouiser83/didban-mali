"use client";
import { SearchInput } from "@/components/ui/search-input";
import { DetailSection, DetailGroup, DetailField, fieldIcon } from "@/components/ui/field-layout";
import { EmptyState, ErrorState, MoneyDisplay, toJalaliDate, toPersianDigits } from "@/components/ui/financial";

import { TableEmptyCell, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, TableRowHeader } from "@/components/ui/table";

import Link from "next/link";
import { useReceivableCustomers } from "./use-receivable-customers";
import type { PeriodReport } from "@/lib/financial-periods";
import { toman } from "@/lib/cashflow-amounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Drawer } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { OverdueFilter } from "@/components/ui/financial/overdue-filter";
import { Search } from "@/components/ui/icons";

export function ReceivablesCustomers({ companyId, asOfDate, periodReport, title = "مشتریان بدهکار" }: { companyId: string; asOfDate: string; periodReport?: PeriodReport["receivables"]; title?: string }) {
  const controller = useReceivableCustomers(companyId, asOfDate, periodReport);
  return <ReceivableCustomersView controller={controller} companyId={companyId} title={title} />;
}
function ReceivableCustomersView({ controller, companyId, title }: { controller: ReturnType<typeof useReceivableCustomers>; companyId: string; title: string }) {
  const { loading, failed, search, setSearch, overdueOnly, setOverdueOnly, selected, setSelectedId, customers, maxDelays, selectedInvoices, retry } = controller;
  return <section className="min-w-0 overflow-hidden rounded-[var(--ds-card-radius)] border border-border bg-card" aria-labelledby="receivables-customers-title" aria-busy={loading}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 [&_h2]:text-lg [&_h2]:font-bold"><div><h2 id="receivables-customers-title">{title}</h2></div>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto"><SearchInput label="جستجوی مشتری" className="w-full sm:w-56" placeholder="جستجوی مشتری" value={search} onChange={(event) => setSearch(event.target.value)}  />
        <OverdueFilter value={overdueOnly} onChange={setOverdueOnly} label="فیلتر مشتریان" />
      </div>
    </div>
    {failed ? <ErrorState onRetry={retry}  variant="compact"><p>فهرست مشتریان دریافت نشد.</p></ErrorState> : <div className="min-w-0"><Table className="min-w-[580px]" containerClassName="border-0">
      <TableHeader><TableRow><TableHead scope="col">مشتری</TableHead><TableHead scope="col">مانده مطالبات</TableHead><TableHead scope="col">مبلغ سررسیدگذشته</TableHead><TableHead scope="col">بیشترین تأخیر</TableHead></TableRow></TableHeader>
      <TableBody key={`${loading}:${search}:${overdueOnly}`} className="motion-safe:animate-[metric-update_200ms_ease-out_both]">{loading ? [0, 1, 2].map((row) => <TableRow key={row}>{[0, 1, 2, 3].map((cell) => <TableCell key={cell}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>) : customers.length ? customers.map((customer) => <TableRow key={customer.counterparty_id} onActivate={() => setSelectedId(customer.counterparty_id)}>
        <TableRowHeader scope="row"><Button variant="ghost" className="min-h-11 h-auto justify-start whitespace-normal px-0 text-start font-normal" onClick={() => setSelectedId(customer.counterparty_id)}>{customer.name}</Button></TableRowHeader>
        <TableCell><MoneyDisplay amount={toman(customer.total_outstanding_irr)} currency="تومان" direction="neutral" size="sm" /></TableCell>
        <TableCell><MoneyDisplay amount={toman(customer.overdue_amount_irr)} currency="تومان" direction="neutral" size="sm" /></TableCell>
        <TableCell>{(maxDelays.get(customer.counterparty_id) ?? 0) > 0 ? `${toPersianDigits(maxDelays.get(customer.counterparty_id)!)} روز` : "—"}</TableCell>
      </TableRow>) : <TableRow><TableEmptyCell colSpan={4} className="h-40 p-0 text-center text-muted-foreground">{search || overdueOnly ? "مشتری‌ای با این جستجو و فیلتر پیدا نشد." : <div className="grid justify-items-center gap-3"><span>مطالبه‌ای ثبت نشده است.</span><Button asChild variant="outline"><Link href={`/companies/${companyId}/imports`}>بارگذاری اسناد</Link></Button></div>}</TableEmptyCell></TableRow>}</TableBody>
    </Table></div>}
    <Drawer size="wide" open={!!selected} onOpenChange={(open) => { if (!open) setSelectedId(null); }} title={selected?.name ?? "جزئیات مشتری"}>
      {selected && <><DetailGroup><DetailField icon={fieldIcon("مانده مطالبات")} label="مانده مطالبات"><MoneyDisplay amount={toman(selected.total_outstanding_irr)} currency="تومان" direction="neutral" size="lg" /></DetailField></DetailGroup>
        <div className="grid gap-4">{selectedInvoices.length ? selectedInvoices.map((invoice) => <DetailSection key={invoice.id} title={`فاکتور ${toPersianDigits(invoice.invoice_no)}`}>

          <DetailGroup><DetailField icon={fieldIcon("وضعیت سررسید")} label="وضعیت سررسید">{!invoice.due_date ? "سررسید نامشخص" : invoice.delay_days > 0 ? `${toPersianDigits(invoice.delay_days)} روز تأخیر` : "سررسیدنرسیده"}</DetailField><DetailField icon={fieldIcon("مانده")} label="مانده"><MoneyDisplay amount={toman(invoice.remaining_amount_irr)} currency="تومان" direction="neutral" size="sm" /></DetailField><DetailField icon={fieldIcon("سررسید")} label="سررسید">{invoice.due_date ? toJalaliDate(invoice.due_date) : "ثبت نشده"}</DetailField></DetailGroup>
        </DetailSection>) : <EmptyState variant="inline">فاکتور تسویه‌نشده‌ای پیدا نشد.</EmptyState>}</div></>}
    </Drawer>
  </section>;
}
