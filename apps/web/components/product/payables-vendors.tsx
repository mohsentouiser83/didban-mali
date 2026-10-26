"use client";
import { SearchInput } from "@/components/ui/search-input";
import { DetailGroup, DetailField, fieldIcon } from "@/components/ui/field-layout";
import { ErrorState, MoneyDisplay, toPersianDigits } from "@/components/ui/financial";

import { TableEmptyCell, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, TableRowHeader } from "@/components/ui/table";

import Link from "next/link";
import { toman } from "@/lib/cashflow-amounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Drawer } from "@/components/ui/drawer";
import { PayableEntries } from "./payable-entries";
import { Skeleton } from "@/components/ui/skeleton";
import { Search } from "@/components/ui/icons";
import { OverdueFilter } from "@/components/ui/financial/overdue-filter";
import { usePayableVendors } from "./use-payable-vendors";

export function PayablesVendors({ companyId, asOfDate }: { companyId: string; asOfDate: string }) {
  const controller = usePayableVendors(companyId, asOfDate);
  return <PayableVendorsView companyId={companyId} asOfDate={asOfDate} controller={controller} />;
}
function PayableVendorsView({ companyId, asOfDate, controller }: { companyId: string; asOfDate: string; controller: ReturnType<typeof usePayableVendors> }) {
  const { loading, failed, search, setSearch, overdueOnly, setOverdueOnly, selected, setSelectedId, vendors, refresh } = controller;
  return <section className="min-w-0 overflow-hidden rounded-[var(--ds-card-radius)] border border-border bg-card" aria-labelledby="payables-vendors-title" aria-busy={loading}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 [&_h2]:text-lg [&_h2]:font-bold"><div><h2 id="payables-vendors-title">تأمین‌کنندگان طلبکار</h2></div>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto"><SearchInput label="جستجوی تأمین‌کننده" className="w-full sm:w-56" placeholder="جستجوی تأمین‌کننده" value={search} onChange={(event) => setSearch(event.target.value)}  />
        <OverdueFilter value={overdueOnly} onChange={setOverdueOnly} label="فیلتر تأمین‌کنندگان" />
      </div>
    </div>
    {failed ? <ErrorState onRetry={refresh}  variant="compact"><p>فهرست تأمین‌کنندگان دریافت نشد.</p></ErrorState> : <div className="min-w-0"><Table className="min-w-[580px]" containerClassName="border-0">
      <TableHeader><TableRow><TableHead scope="col">تأمین‌کننده</TableHead><TableHead scope="col">مانده بدهی</TableHead><TableHead scope="col">مبلغ سررسیدگذشته</TableHead><TableHead scope="col">میانگین تأخیر (برآوردی)</TableHead></TableRow></TableHeader>
      <TableBody key={`${loading}:${search}:${overdueOnly}`} className="motion-safe:animate-[metric-update_200ms_ease-out_both]">{loading ? [0, 1, 2].map((row) => <TableRow key={row}>{[0, 1, 2, 3].map((cell) => <TableCell key={cell}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>) : vendors.length ? vendors.map((customer) => <TableRow key={customer.counterparty_id} onActivate={() => setSelectedId(customer.counterparty_id)}>
        <TableRowHeader scope="row"><Button variant="ghost" className="min-h-11 h-auto justify-start whitespace-normal px-0 text-start font-normal" onClick={() => setSelectedId(customer.counterparty_id)}>{customer.name}</Button></TableRowHeader>
        <TableCell><MoneyDisplay amount={toman(customer.total_payable_irr)} currency="تومان" direction="neutral" size="sm" /></TableCell>
        <TableCell>{customer.risk_assessment_incomplete ? "سررسید نامشخص" : <MoneyDisplay amount={toman(customer.overdue_amount_irr)} currency="تومان" direction="neutral" size="sm" />}</TableCell>
        <TableCell>{customer.avg_delay_days > 0 ? `${toPersianDigits(customer.avg_delay_days)} روز` : "—"}</TableCell>
      </TableRow>) : <TableRow><TableEmptyCell colSpan={4} className="h-40 p-0 text-center text-muted-foreground">{search || overdueOnly ? "تأمین‌کننده‌ای با این جستجو و فیلتر پیدا نشد." : <div className="grid justify-items-center gap-3"><span>بدهی‌ای ثبت نشده است.</span><Button asChild variant="outline"><Link href={`/companies/${companyId}/imports`}>بارگذاری اسناد</Link></Button></div>}</TableEmptyCell></TableRow>}</TableBody>
    </Table></div>}
    <Drawer size="wide" open={!!selected} onOpenChange={(open) => { if (!open) setSelectedId(null); }} title={selected?.name ?? "جزئیات تأمین‌کننده"}>
      {selected && <><DetailGroup><DetailField icon={fieldIcon("مانده بدهی")} label="مانده بدهی"><MoneyDisplay amount={toman(selected.total_payable_irr)} currency="تومان" direction="neutral" size="lg" /></DetailField></DetailGroup>
        <PayableEntries key={selected.counterparty_id} companyId={companyId} counterpartyId={selected.counterparty_id} asOfDate={asOfDate} /></>}

    </Drawer>
  </section>;
}
