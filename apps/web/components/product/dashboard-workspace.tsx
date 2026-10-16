"use client";
import { LoadingState } from "@/components/ui/financial/loading-state";
import { EmptyState, StatusMessage, ErrorState, PageHeader, MoneyDisplay } from "@/components/ui/financial";

import Link from "next/link";
import { useDashboard } from "./use-dashboard";
import type { Company } from "@/lib/product-types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, RefreshCcw } from "@/components/ui/icons";
import { StatCards } from "@/components/ui/financial/stat-cards";
import { DashboardCashChart } from "./dashboard-cash-chart";

export function DashboardWorkspace({ company }: { company: Company }) {
  const controller = useDashboard(company);
  return <DashboardView controller={controller} />;
}
function DashboardView({ controller }: { controller: ReturnType<typeof useDashboard> }) {
  const { data, summaryErrors, loading, retry, base, forecast, points, hasPayments, cards, attention, refresh } = controller;
  return <div dir="rtl" className="grid min-w-0 gap-5">
    <PageHeader title="داشبورد" secondaryActions={<><Button variant="outline" disabled={loading} onClick={refresh}><RefreshCcw size={16} aria-hidden="true" />به‌روزرسانی</Button></>} />
    {!!summaryErrors.length && <ErrorState onRetry={refresh} variant="compact" ><p>اطلاعات {summaryErrors.join("، ")} دریافت نشد.</p></ErrorState>}
    <section aria-label="خلاصه وضعیت مالی"><StatCards items={cards} loading={loading} /></section>
    <section className="min-w-0 rounded-[var(--ds-card-radius)] border border-border bg-card p-4 sm:p-6" aria-labelledby="dashboard-chart-title">
      <div className="mb-5 flex items-center justify-between gap-4 [&_h2]:text-base [&_h2]:font-medium [&_a]:text-xs"><div><h2 id="dashboard-chart-title">پیش‌بینی مانده حساب</h2></div><Button asChild variant="ghost"><Link href={`${base}/cashflow/forecast`}>نقدینگی<ChevronLeft size={16} aria-hidden="true" /></Link></Button></div>
      {loading ? <LoadingState variant="chart" label="در حال دریافت نمودار" /> : points.length ? <DashboardCashChart key={`${forecast?.as_of_date}:${retry}`} points={points} hasPayments={hasPayments} /> : !forecast ? <ErrorState variant="compact" title="پیش‌بینی دریافت نشد." onRetry={refresh} /> : <EmptyState variant="compact" title="مانده حساب بانکی موجود نیست." action={{ label: "بررسی نقدینگی", href: `${base}/cashflow/forecast` }} />}
    </section>
    <section className="min-w-0 rounded-[var(--ds-card-radius)] border border-border bg-card p-4 sm:p-6" aria-labelledby="dashboard-attention-title"><div className="mb-5 flex items-center justify-between gap-4 [&_h2]:text-base [&_h2]:font-medium [&_a]:text-xs"><div><h2 id="dashboard-attention-title">موارد نیازمند توجه</h2></div></div>
      {loading ? <Skeleton className="h-40 w-full" /> : attention.length ? <ul className="m-0 list-none p-0 [&_li+li]:border-t [&_li+li]:border-border [&_a]:flex [&_a]:items-start [&_a]:justify-between [&_a]:gap-3 [&_a]:rounded [&_a]:py-4 [&_a]:focus-visible:outline-2 [&_a]:focus-visible:outline-primary [&_a]:focus-visible:outline-offset-4 [&_a>div:first-child]:grid [&_a>div:first-child]:gap-1.5 [&_a>div:last-child]:flex [&_a>div:last-child]:shrink-0 [&_a>div:last-child]:items-center [&_a>div:last-child]:gap-2 [&_strong]:text-sm [&_strong]:font-medium [&_strong]:transition-colors [&_a:hover_strong]:text-primary [&_span]:text-xs [&_span]:text-muted-foreground motion-reduce:[&_strong]:transition-none sm:[&_a]:items-center sm:[&_a]:gap-6">{attention.slice(0, 5).map((item) => <li key={item.id}><Link href={item.href}><div><strong>{item.title}</strong><span>{item.detail}</span></div><div>{item.amount !== null && <MoneyDisplay interactiveHint={false} amount={item.amount} currency="تومان" size="sm" direction={isNegative(item.amount) ? "negative" : "neutral"} />}<ChevronLeft size={16} aria-hidden="true" /></div></Link></li>)}</ul> : data?.errors.length ? <StatusMessage tone="warning">اطلاعات {data.errors.join("، ")} دریافت نشد.</StatusMessage> : <EmptyState variant="compact">موردی پیدا نشد.</EmptyState>}
    </section>
  </div>;
}

function isNegative(value: string) { return value.startsWith("-"); }
