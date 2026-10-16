"use client";
import { LoadingState } from "@/components/ui/financial/loading-state";
import { ErrorState, EmptyState, MoneyDisplay } from "@/components/ui/financial";

import { Table, TableHeader, TableRow, TableHead, TableBody, TableRowHeader, TableCell } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/financial/page-header";
import { AlertCircle } from "@/components/ui/icons";

import { toman } from "@/lib/cashflow-amounts";
import type { Company } from "@/lib/product-types";
import type { PeriodReport } from "@/lib/financial-periods";
import { ReceivablesCustomers } from "./receivables-customers";
import { StatCards } from "@/components/ui/financial/stat-cards";
import { FinancialPeriodSelector } from "./financial-period-selector";
import { ReceiptHistoryEditor } from "./receipt-history-editor";
import { useReceivablesWorkspace } from "./use-receivables-workspace";
export function ReceivablesWorkspace({ company }: { company: Company }) {
  const controller = useReceivablesWorkspace(company);
  return <ReceivablesView company={company} controller={controller} />;
}
function ReceivablesView({ company, controller: c }: { company: Company; controller: ReturnType<typeof useReceivablesWorkspace> }) {
  return <div dir="rtl" className="grid min-w-0 gap-5">
    <PageHeader title="مطالبات" primaryAction={<ReceiptHistoryEditor key={company.id} companyId={company.id} canWrite={c.canWrite} onChanged={c.refresh} />} />
    <FinancialPeriodSelector companyId={company.id} range={c.range} onChange={c.setRange} canWrite={c.canWrite} />
    <section aria-label="آمار مطالبات" aria-busy={c.loading}>
      {c.error ? <ErrorState onRetry={c.refresh}  variant="compact"><p className="text-sm">اطلاعات مطالبات دریافت نشد.</p></ErrorState> : c.summary && !c.summary.history_complete ? <ReceivablePeriodGap /> : <StatCards items={c.cards} loading={c.loading} />}
    </section>
    {c.summary?.history_complete && <ReceivableAging buckets={c.summary.buckets} />}
    {c.loading && <LoadingState variant="list" />}
    {c.summary?.history_complete ? <ReceivablesCustomers key={`${company.id}:${c.range.end_date}`} companyId={company.id} asOfDate={c.range.end_date} periodReport={c.summary} /> : !c.loading && <ReceivablesCustomers title="مطالبات جاری" key={`${company.id}:current`} companyId={company.id} asOfDate={c.currentDate} />}

  </div>;
}
function ReceivableAging({ buckets }: { buckets: PeriodReport["receivables"]["buckets"] }) {
  if (!buckets.length) return null;
  return <section className="overflow-hidden rounded-[var(--ds-card-radius)] border border-border bg-card" aria-label="سن مطالبات پایان دوره"><h2 className="p-4 text-lg font-bold">سن مطالبات در پایان دوره</h2><div className="min-w-0"><Table className="min-w-[400px]" containerClassName="border-0"><TableHeader><TableRow><TableHead scope="col">وضعیت سررسید</TableHead><TableHead scope="col">مانده</TableHead><TableHead scope="col">تعداد فاکتور</TableHead></TableRow></TableHeader><TableBody>{buckets.map((bucket) => <TableRow key={bucket.bucket_key}><TableRowHeader scope="row" className="font-normal">{bucket.label_fa}</TableRowHeader><TableCell><MoneyDisplay amount={toman(bucket.amount_irr)} currency="تومان" size="sm" direction="neutral" /></TableCell><TableCell>{new Intl.NumberFormat("fa-IR").format(bucket.invoice_count)}</TableCell></TableRow>)}</TableBody></Table></div></section>;
}

function ReceivablePeriodGap() {
  return <EmptyState variant="compact" >
    <AlertCircle size={20} className="mt-1 shrink-0 text-[var(--ds-risk-medium-fg)]" aria-hidden="true" />
    <div><h2 className="text-sm font-medium">مانده دوره قابل محاسبه نیست</h2><p className="mt-1 text-sm text-muted-foreground">تاریخ وصول بعضی فاکتورها ثبت نشده است.</p></div>
  </EmptyState>;
}
