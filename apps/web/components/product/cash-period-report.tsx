"use client";
import { DetailGroup, ControlLabel, fieldIcon, DetailField } from "@/components/ui/field-layout";
import { LoadingState } from "@/components/ui/financial/loading-state";
import { FinancialChart, ChartGrid, ChartXAxis, ChartYAxis, ChartTooltip, ChartValueTooltip } from "@/components/ui/financial/financial-chart";
import { ErrorState, EmptyState, StatusMessage, MoneyDisplay, toJalaliDate } from "@/components/ui/financial";

import { useId, useState } from "react";
import { useCashPeriodReport } from "./use-cash-period-report";
import { Line, LineChart, ReferenceLine } from "recharts";
import { Button } from "@/components/ui/button";

import { Drawer } from "@/components/ui/drawer";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { ChevronLeft, ChevronRight, Calendar } from "@/components/ui/icons";
import type { Company } from "@/lib/product-types";
import { FinancialPeriodSelector } from "./financial-period-selector";
import { StatCards } from "@/components/ui/financial/stat-cards";
type Controller = ReturnType<typeof useCashPeriodReport>;
export function CashPeriodReport({ company }: { company: Company }) {
  const controller = useCashPeriodReport(company);
  return <CashPeriodView company={company} controller={controller} />;
}
function CashPeriodView({ company, controller: c }: { company: Company; controller: Controller }) {
  return <>
    <FinancialPeriodSelector key={company.id} companyId={company.id} includeUpcomingMonth range={c.range} onChange={c.setRange} canWrite={!!company.role && company.role !== "viewer"} />
    {c.error ? <ErrorState onRetry={c.refresh} variant="compact" ><p>گزارش نقدینگی دریافت نشد.</p></ErrorState> : <StatCards items={c.cards} loading={c.loading} />}
    {c.loading ? <LoadingState variant="chart" label="در حال دریافت نمودار" /> : c.cash && <CashBalanceOverview key={c.rangeKey} controller={c} companyId={company.id} />}
  </>;
}
function CashBalanceOverview({ controller: c, companyId }: { controller: Controller; companyId: string }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  return <section className="grid min-w-0 gap-5 rounded-[var(--ds-card-radius)] border border-border bg-card p-4 motion-safe:animate-[workspace-enter_280ms_ease-out_both] sm:p-6" aria-label="روند مانده حساب">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">روند مانده حساب <span className="text-xs font-normal text-muted-foreground">(میلیون تومان)</span></h2>{c.selectedDay && <Button variant="outline" onClick={() => setDetailsOpen(true)}><Calendar size={18} aria-hidden="true" />جزئیات روز</Button>}</div>
    {c.hasBalance ? <CashBalanceChart controller={c} onInspect={() => setDetailsOpen(true)} /> : <EmptyState variant="compact" title="مانده بانکی برای این دوره ثبت نشده است." action={{ label: "بارگذاری گردش بانک", href: `/companies/${companyId}/imports` }} />}
    {c.discrepancy && <StatusMessage tone="warning" >گردش با مانده بانک تطبیق ندارد.</StatusMessage>}
    <CashDayDetails controller={c} open={detailsOpen} onOpenChange={setDetailsOpen} />
  </section>;
}
function CashBalanceChart({ controller: c, onInspect }: { controller: Controller; onInspect: () => void }) {
  return <FinancialChart label="نمودار مانده به میلیون تومان">
    <LineChart data={c.points} accessibilityLayer onClick={(state) => { if (state.activeLabel) { c.chooseDate(String(state.activeLabel)); onInspect(); } }}>
      <ChartGrid stroke="var(--ds-border)" vertical={false} strokeDasharray="3 5" />
      <ChartXAxis dataKey="date" tickFormatter={(value) => toJalaliDate(String(value))} minTickGap={70} tickLine={false} axisLine={false} />
      <ChartYAxis tickFormatter={(value: number) => new Intl.NumberFormat("fa-IR").format(value)} width={60} tickLine={false} axisLine={false} />
      <ReferenceLine y={0} stroke="var(--ds-border-strong)" />
      <ChartTooltip content={<ChartValueTooltip unit="میلیون تومان" labelFormatter={(value) => toJalaliDate(String(value))} />} />
      <Line name="مانده" dataKey="plot" stroke="var(--ds-primary)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
    </LineChart>
  </FinancialChart>;
}
function CashDayDetails({ controller: c, open, onOpenChange }: { controller: Controller; open: boolean; onOpenChange: (open: boolean) => void }) {
  const id = useId();
  return <Drawer size="wide" open={open} onOpenChange={onOpenChange} title="جزئیات گردش روز">
    <div className="space-y-2"><ControlLabel htmlFor={id} className="text-sm" icon={fieldIcon("تاریخ روز")}>تاریخ روز</ControlLabel><PersianDatePicker id={id} value={c.selectedDay?.date ?? ""} min={c.range.start_date} max={c.range.end_date} onValueChange={c.chooseDate} /></div>
    <div className="flex items-center justify-between gap-3"><Button variant="outline" disabled={!c.canPrevious} onClick={c.previous}><ChevronRight size={16} aria-hidden="true" />روز قبل</Button><Button variant="outline" disabled={!c.canNext} onClick={c.next}>روز بعد<ChevronLeft size={16} aria-hidden="true" /></Button></div>
    <DetailGroup key={c.selectedDay?.date} className="motion-safe:animate-[metric-update_240ms_ease-out_both]">{c.dayAmounts.map(({ label, amount }) => <DetailField key={label} icon={fieldIcon(label)} label={<>{label}</>}>{amount === null ? <span className="text-sm">ثبت نشده</span> : <MoneyDisplay amount={amount} currency="تومان" direction="neutral" size="lg" />}</DetailField>)}</DetailGroup>
  </Drawer>;
}
