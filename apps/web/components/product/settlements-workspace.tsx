"use client";
import { ControlLabel, fieldIcon } from "@/components/ui/field-layout";
import { LoadingState, EmptyState, ErrorState, PageHeader } from "@/components/ui/financial";

import Link from "next/link";
import { TablePagination } from "@/components/ui/table-pagination";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { Company } from "@/lib/product-types";
import { SettlementInvoiceList } from "./settlement-invoice-list";
import { useSettlements } from "./use-settlements";
import { SettlementDetails } from "./settlement-details";

export function SettlementsWorkspace({ company }: { company: Company }) {
  const c = useSettlements(company.id, company.role);
  return <SettlementsView company={company} c={c} />;
}
export function SettlementsView({ company, c }: { company: Company; c: ReturnType<typeof useSettlements> }) {
  return <div dir="rtl" className="flex min-w-0 flex-col gap-6">
    <PageHeader title="دریافت و پرداخت" />
    <section aria-label="انتخاب فاکتورها" className="flex flex-wrap items-end gap-4 rounded-[var(--ds-card-radius)] border border-border bg-card p-4">
      <div className="grid w-full min-w-0 gap-2 sm:w-48"><ControlLabel htmlFor="settlement-direction" icon={fieldIcon("نوع فاکتور")}>نوع فاکتور</ControlLabel><Select dir="rtl" value={c.direction} onValueChange={(value) => c.changeDirection(value as "sales" | "purchases")}><SelectTrigger id="settlement-direction" aria-label="نوع فاکتور" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sales">فروش و وصول</SelectItem><SelectItem value="purchases">خرید و پرداخت</SelectItem></SelectContent></Select></div>
      <div className="grid min-w-0 flex-1 basis-60 gap-2"><ControlLabel htmlFor="settlement-search" icon={fieldIcon("جستجوی فاکتور")}>نام طرف حساب یا شماره فاکتور</ControlLabel><Input id="settlement-search" value={c.search} onChange={(e) => c.changeSearch(e.target.value)} /></div>
      {c.search && <Button variant="ghost" onClick={() => c.changeSearch("")}>پاک‌کردن جست‌وجو</Button>}
    </section>
    {c.loading ? <LoadingState aria-label="دریافت فاکتورها" aria-busy="true" variant="details">{[0,1,2,3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</LoadingState> : c.listError ? <ErrorState onRetry={c.retry} variant="compact" >{c.listError}</ErrorState> : !c.invoices.length ? <EmptyState variant="compact" className="rounded-[var(--ds-card-radius)] border border-border bg-card" title={c.search ? "فاکتوری پیدا نشد." : "فاکتور تکمیل‌شده‌ای برای تخصیص ندارید."} action={c.search ? { label: "پاک‌کردن جست‌وجو", onClick: () => c.changeSearch("") } : { label: "بارگذاری اسناد", href: `/companies/${company.id}/imports` }} /> : <SettlementInvoiceList invoices={c.invoices} onInspect={c.open} />}
    {!c.listError && <TablePagination total={c.total} page={Math.floor(c.offset / c.pageSize)} pageSize={c.pageSize} loading={c.loading} onPageChange={(page) => c.setOffset(page * c.pageSize)} onPageSizeChange={c.changePageSize} />}
    <SettlementDetails c={c} />
  </div>;
}
