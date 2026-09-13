"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const data = [
  { month: "فروردین", inflow: 42, outflow: 28 },
  { month: "اردیبهشت", inflow: 49, outflow: 31 },
  { month: "خرداد", inflow: 45, outflow: 35 },
  { month: "تیر", inflow: 61, outflow: 39 },
  { month: "مرداد", inflow: 58, outflow: 41 },
  { month: "شهریور", inflow: 72, outflow: 44 },
];

const toPersian = (value: number) => new Intl.NumberFormat("fa-IR").format(value);

export function CashflowChart() {
  return (
    <div className="h-[260px] w-full" aria-label="نمودار نمونه روند جریان نقدی شش ماه اخیر">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="inflowGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--ds-primary)" stopOpacity={0.38} /><stop offset="100%" stopColor="var(--ds-primary)" stopOpacity={0.02} /></linearGradient>
            <linearGradient id="outflowGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--ds-accent)" stopOpacity={0.25} /><stop offset="100%" stopColor="var(--ds-accent)" stopOpacity={0.01} /></linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--ds-grid)" strokeDasharray="4 4" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--ds-foreground-soft)", fontSize: 12 }} />
          <YAxis tickFormatter={toPersian} tickLine={false} axisLine={false} tick={{ fill: "var(--ds-foreground-soft)", fontSize: 12 }} />
          <Tooltip cursor={{ stroke: "var(--ds-border-strong)" }} contentStyle={{ direction: "rtl", borderRadius: 12, border: "1px solid var(--ds-border)", background: "var(--ds-card-solid)", color: "var(--ds-foreground)", fontSize: 14 }} formatter={(value) => [`${toPersian(Number(value))} میلیارد ریال`]} />
          <Area isAnimationActive={false} type="monotone" dataKey="inflow" name="ورودی" stroke="var(--ds-primary)" strokeWidth={2.5} fill="url(#inflowGradient)" />
          <Area isAnimationActive={false} type="monotone" dataKey="outflow" name="خروجی" stroke="var(--ds-accent)" strokeWidth={2} fill="url(#outflowGradient)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
