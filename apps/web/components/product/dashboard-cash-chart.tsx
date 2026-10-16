"use client";
import { FinancialChart, ChartGrid, ChartXAxis, ChartYAxis, ChartTooltip, ChartTooltipSurface } from "@/components/ui/financial/financial-chart";
import { useState } from "react";
import { Line, LineChart, ReferenceLine } from "recharts";
import { EmptyState, StatusMessage, MoneyDisplay, toJalaliDate } from "@/components/ui/financial";
import { Slider } from "@/components/ui/slider";
import type { DailyCashPoint } from "@/lib/dashboard-cash";
const shortDate = (date: string) => new Intl.DateTimeFormat("fa-IR", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
function DayTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload?: DailyCashPoint }[] }) {
  const day = payload?.[0]?.payload;
  if (!active || !day) return null;
  return <ChartTooltipSurface className="[&_dl]:grid-cols-1 [&_dl]:gap-2.5 [&_dl>div]:flex [&_dl>div]:flex-wrap [&_dl>div]:justify-between [&_dl>div]:gap-3"><strong>{toJalaliDate(day.date)}</strong><DayAmounts day={day} /></ChartTooltipSurface>;
}
function DayAmounts({ day }: { day: DailyCashPoint }) {
  return <dl className="grid grid-cols-1 gap-3 text-xs [&_dt]:mb-1.5 [&_dt]:text-muted-foreground [&_dd_span]:text-sm [&_dd_span]:font-medium sm:grid-cols-3 sm:gap-4">{[{ label: "مانده پایان روز", value: day.balance }, { label: "دریافت مورد انتظار", value: day.inflows }, { label: "پرداخت ثبت‌شده", value: day.outflows }].map(({ label, value }) => <div key={label}><dt>{label}</dt><dd><MoneyDisplay amount={value} currency="تومان" size="sm" direction={Number(value) < 0 ? "negative" : "neutral"} /></dd></div>)}</dl>;
}
export function DashboardCashChart({ points, hasPayments }: { points: DailyCashPoint[]; hasPayments: boolean }) {
  const [dayIndex, setDayIndex] = useState(0);
  const selected = points[dayIndex] ?? points[0];
  const deficit = points.find((point) => Number(point.balance) < 0);
  if (!selected) return <EmptyState variant="compact">مانده حساب بانکی موجود نیست.</EmptyState>;
  return <>
    <p className="text-sm text-muted-foreground">دریافت تخمینی · پرداخت برنامه‌ریزی‌شده</p>
    {!hasPayments && <StatusMessage tone="warning" className="mt-2">برنامه پرداخت ثبت نشده است.</StatusMessage>}
    {deficit && <StatusMessage tone="warning" className="mt-2">مانده پیش‌بینی‌شده از {toJalaliDate(deficit.date)} منفی می‌شود.</StatusMessage>}
    <FinancialChart className="mt-5 h-[270px] sm:h-80" label="نمودار مانده روزانه به میلیون تومان">

        <LineChart data={points} margin={{ top: 20, right: 20, bottom: 12, left: 20 }} accessibilityLayer>
          <ChartGrid stroke="var(--ds-border)" strokeDasharray="3 5" vertical={false} />
          <ChartXAxis dataKey="date" tickFormatter={shortDate} ticks={points.filter((_, index) => index % 7 === 0 || index === points.length - 1).map((point) => point.date)} interval="preserveStartEnd" axisLine={false} tickLine={false} />
          <ChartYAxis width={65} domain={[(minimum: number) => Math.min(0, minimum), (maximum: number) => Math.max(1, maximum * 1.1)]} tickFormatter={(value: number) => new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(value)} axisLine={false} tickLine={false} />
          <ReferenceLine y={0} stroke="var(--ds-risk-high-fg)" strokeDasharray="4 4" />
          <ChartTooltip content={<DayTooltip />} />
          <Line type="stepAfter" dataKey="plot" name="مانده" stroke="var(--ds-primary)" strokeWidth={2.5} dot={points.length === 1 ? { r: 4 } : false} activeDot={{ r: 5 }} isAnimationActive={false} />
        </LineChart>

    </FinancialChart>
    <div className="text-center text-[11px] text-muted-foreground">مبالغ نمودار به میلیون تومان</div>
    <div className="mt-6 grid gap-5 border-t border-border pt-5"><div className="flex justify-between gap-4 text-xs text-muted-foreground [&_strong]:font-normal [&_strong]:text-foreground"><span>جزئیات روز</span><strong>{toJalaliDate(selected.date)}</strong></div>{points.length > 1 && <Slider dir="ltr" min={0} max={points.length - 1} step={1} value={[dayIndex]} onValueChange={(values) => setDayIndex(values[0])} aria-label="انتخاب روز پیش‌بینی" aria-valuetext={toJalaliDate(selected.date)} />}<DayAmounts day={selected} /></div>
  </>;
}
