"use client";
import type { CashDay } from "@/lib/api";
import { amount, displayDate } from "@/lib/utils";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { EmptyState } from "../content-states";
export function FinancialChart({
  data,
  children,
  label,
}: {
  data: unknown[];
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className="h-64 w-full min-w-0 motion-safe:animate-fade-in"
      dir="ltr"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 12, right: 12, left: 0, bottom: 8 }}
        >
          {children}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
export function ChartGrid() {
  return <CartesianGrid stroke="var(--color-border)" vertical={false} />;
}
export function ChartXAxis() {
  return (
    <XAxis
      dataKey="date"
      tickFormatter={(value) => displayDate(String(value))}
      tickLine={false}
      axisLine={false}
      minTickGap={35}
      stroke="var(--color-muted)"
      fontSize={11}
    />
  );
}
export function ChartYAxis() {
  return (
    <YAxis
      tickFormatter={(value) =>
        new Intl.NumberFormat("fa-IR", { notation: "compact" }).format(value)
      }
      tickLine={false}
      axisLine={false}
      stroke="var(--color-muted)"
      fontSize={11}
      width={65}
    />
  );
}
export function ChartTooltipSurface({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      dir="rtl"
      className="rounded-control border border-border bg-surface p-3 text-sm shadow-overlay"
    >
      {children}
    </div>
  );
}
export function ChartTooltipContent({
  active,
  payload,
  label,
  unit = "IRR",
}: Partial<TooltipContentProps<number, string>> & { unit?: "IRR" | "TOMAN" }) {
  if (!active || !payload?.length) return null;
  const sourceBalance = payload[0]?.payload?.balance;
  const exactBalance = typeof sourceBalance === "string" ? sourceBalance : null;
  return (
    <ChartTooltipSurface>
      <p className="text-xs text-muted">{displayDate(String(label))}</p>
      <p className="mt-1 tabular-nums">
        {amount(exactBalance, unit)} {unit === "IRR" ? "ریال" : "تومان"}
      </p>
    </ChartTooltipSurface>
  );
}
export function ChartTooltip({ unit = "IRR" }: { unit?: "IRR" | "TOMAN" }) {
  return (
    <Tooltip
      content={<ChartTooltipContent unit={unit} />}
      isAnimationActive={false}
    />
  );
}
export function CashChart({
  days,
  unit = "IRR",
  label = "مانده روزانه نقد",
}: {
  days: CashDay[];
  unit?: "IRR" | "TOMAN";
  label?: string;
}) {
  if (!days.some((day) => day.balance != null))
    return (
      <EmptyState
        compact
        title="مانده روزانه موجود نیست"
        description="مانده مبنا و گردش تاریخ‌دار بانک لازم است."
      />
    );
  return (
    <FinancialChart
      data={days.map((day) => ({
        ...day,
        value:
          day.balance == null
            ? null
            : Number(day.balance) / (unit === "TOMAN" ? 10 : 1),
      }))}
      label={`${label} (${unit === "IRR" ? "ریال" : "تومان"})`}
    >
      <ChartGrid />
      <ChartXAxis />
      <ChartYAxis />
      <ChartTooltip unit={unit} />
      <Line
        dataKey="value"
        type="monotone"
        stroke="var(--color-analytical)"
        strokeWidth={2.5}
        connectNulls={false}
        dot={
          days.filter((day) => day.balance != null).length === 1
            ? { r: 4 }
            : false
        }
        activeDot={{ r: 4 }}
        isAnimationActive={false}
      />
    </FinancialChart>
  );
}
