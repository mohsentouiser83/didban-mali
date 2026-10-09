"use client";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MoneyDisplay, toJalaliDate } from "@/components/ui/financial";
import { Slider } from "@/components/ui/slider";
import type { DailyCashPoint } from "@/lib/dashboard-cash";
import styles from "./dashboard-simple.module.css";
const shortDate = (date: string) => new Intl.DateTimeFormat("fa-IR", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
function DayTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload?: DailyCashPoint }[] }) {
  const day = payload?.[0]?.payload;
  if (!active || !day) return null;
  return <div className={styles.tooltip} dir="rtl"><strong>{toJalaliDate(day.date)}</strong><DayAmounts day={day} /></div>;
}
function DayAmounts({ day }: { day: DailyCashPoint }) {
  return <dl className={styles.dayAmounts}>{[{ label: "مانده پایان روز", value: day.balance }, { label: "دریافت مورد انتظار", value: day.inflows }, { label: "پرداخت ثبت‌شده", value: day.outflows }].map(({ label, value }) => <div key={label}><dt>{label}</dt><dd><MoneyDisplay amount={value} currency="تومان" size="sm" direction={Number(value) < 0 ? "negative" : "neutral"} /></dd></div>)}</dl>;
}
export function DashboardCashChart({ points, hasPayments }: { points: DailyCashPoint[]; hasPayments: boolean }) {
  const [dayIndex, setDayIndex] = useState(0);
  const selected = points[dayIndex] ?? points[0];
  const deficit = points.find((point) => Number(point.balance) < 0);
  if (!selected) return null;
  return <>
    <p className={styles.caption}>دریافت‌ها تخمینی‌اند و پرداخت‌ها از برنامه ثبت‌شده محاسبه می‌شوند.</p>
    {!hasPayments && <p className={styles.notice}>برنامه پرداختی ثبت نشده است؛ نمودار فعلاً فقط اثر دریافت‌های مورد انتظار را نشان می‌دهد.</p>}
    {deficit && <p className={styles.deficit}>مانده پیش‌بینی‌شده از {toJalaliDate(deficit.date)} منفی می‌شود.</p>}
    <div className={styles.chart} dir="ltr" aria-label="نمودار مانده روزانه به میلیون تومان">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={points} margin={{ top: 20, right: 20, bottom: 12, left: 20 }} accessibilityLayer>
          <CartesianGrid stroke="var(--ds-border)" strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} ticks={[points[0].date, points[7].date, points[14].date, points[21].date, points[29].date]} interval="preserveStartEnd" tick={{ fill: "var(--ds-foreground-soft)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis width={65} domain={[(minimum: number) => Math.min(0, minimum), (maximum: number) => Math.max(1, maximum * 1.1)]} tickFormatter={(value: number) => new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(value)} tick={{ fill: "var(--ds-foreground-soft)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <ReferenceLine y={0} stroke="var(--ds-risk-high-fg)" strokeDasharray="4 4" />
          <Tooltip content={<DayTooltip />} />
          <Line type="stepAfter" dataKey="plot" name="مانده" stroke="var(--ds-primary)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
    <div className={styles.axisCaption}>مبالغ نمودار به میلیون تومان</div>
    <div className={styles.selectedDay}><div className={styles.dayHeading}><span>جزئیات روز</span><strong>{toJalaliDate(selected.date)}</strong></div><Slider dir="ltr" min={0} max={points.length - 1} step={1} value={[dayIndex]} onValueChange={(values) => setDayIndex(values[0])} aria-label="انتخاب روز پیش‌بینی" aria-valuetext={toJalaliDate(selected.date)} /><DayAmounts day={selected} /></div>
  </>;
}
