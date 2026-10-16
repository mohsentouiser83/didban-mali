"use client";
import { Badge } from "@/components/ui/badge";
import { prepareForecastChart, type ForecastWeek, type ForecastOutlook } from "@/lib/dashboard-forecast-chart";
export type { ForecastOutlook } from "@/lib/dashboard-forecast-chart";
import { EmptyState, MoneyDisplay, toPersianDigits, toJalaliDate } from "@/components/ui/financial";

import { FinancialChart, ChartGrid, ChartXAxis, ChartYAxis, ChartTooltip, ChartTooltipSurface } from "@/components/ui/financial/financial-chart";
import { Table, TableCaption, TableHeader, TableRow, TableHead, TableBody, TableRowHeader, TableCell } from "@/components/ui/table";

import { ComposedChart, Line, Bar, ReferenceLine } from "recharts";

function ForecastTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: ForecastWeek }[];
}) {
  const week = payload?.[0]?.payload;
  if (!active || !week) return null;
  return (
    <ChartTooltipSurface>
      <strong>
        {toPersianDigits(week.jalali_range) || (week.start_date ? toJalaliDate(week.start_date) : `هفتهٔ ${toPersianDigits(week.week_number)}`)}
      </strong>
      <p>
        مانده نقد{" "}
        <MoneyDisplay
          direction="neutral"
          amount={week.closing_cash_irr}
          executive
          size="sm"
        />
      </p>
      <p>
        ورودی{" "}
        <MoneyDisplay
          direction="neutral"
          amount={week.expected_inflow_irr}
          executive
          size="sm"
        />
      </p>
      <p>
        خروجی{" "}
        <MoneyDisplay
          direction="neutral"
          amount={week.expected_outflow_irr}
          executive
          size="sm"
        />
      </p>
    </ChartTooltipSurface>
  );
}

export function DashboardForecast({ outlook }: { outlook: ForecastOutlook; asOfDate?: string }) {
  const weeks = outlook.weeks ?? [];
  const data = prepareForecastChart(weeks);
  return (
    <section
      className="dashboard-panel dashboard-forecast"
      aria-labelledby="dashboard-forecast-title"
    >
      <div className="dashboard-panel-heading">
        <div>
          <h2 id="dashboard-forecast-title">دورنمای نقدینگی</h2>
        </div>
        {outlook.first_deficit_week != null && (
          <Badge variant="warning" size="sm">
            کسری · هفته {toPersianDigits(outlook.first_deficit_week)}
          </Badge>
        )}
      </div>
      <div className="dashboard-forecast-summary">
        <div>
          <span>کمترین مانده</span>
          <MoneyDisplay
            direction="neutral"
            amount={outlook.lowest_projected_cash_irr}
            executive
            size="md"
          />
        </div>
        <div>
          <span>پوشش داده‌های وصول</span>
          <strong>
            {outlook.inflow_coverage_percentage == null
              ? "—"
              : `${toPersianDigits(outlook.inflow_coverage_percentage)}٪`}
          </strong>
        </div>
      </div>
      {data.length ? (
        <>
          <div className="my-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground [&_strong]:font-medium"><strong>ماندهٔ نقد</strong><span>میلیون تومان</span></div>
          <FinancialChart empty={!data.some((week) => week.closing != null)} emptyMessage="مانده نقد برای این بازه موجود نیست." className="h-44 sm:h-48" label="نمودار ماندهٔ نقد پیش‌بینی‌شده؛ مقادیر دقیق در جزئیات هفتگی">

              <ComposedChart data={data} margin={{ top: 10, right: 14, left: 0, bottom: 4 }} accessibilityLayer>
                <ChartGrid vertical={false} stroke="var(--ds-border)" />
                <ChartXAxis dataKey="calendarLabel" axisLine={false} tickLine={false} minTickGap={32} />
                <ChartYAxis width={58} tickFormatter={(value) => new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(value)}
                  axisLine={false} tickLine={false} />
                <ChartTooltip content={<ForecastTooltip />} />
                <ReferenceLine y={0} stroke="var(--ds-foreground-soft)" />
                <Line type="monotone" dataKey="closing" name="مانده نقد" stroke="var(--ds-primary)" strokeWidth={2.5}
                  isAnimationActive={false} connectNulls={false} dot={{ r: 2.5, fill: "var(--ds-card-solid)", strokeWidth: 2 }} />
              </ComposedChart>

          </FinancialChart>
          <div className="my-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground [&_strong]:font-medium"><strong>جریان هفتگی</strong><span>میلیون تومان</span>
            <span className="inline-flex items-center gap-2 before:h-2 before:w-2 before:rounded-sm before:bg-primary"><i />ورودی</span>
            <span className="inline-flex items-center gap-2 before:h-2 before:w-2 before:rounded-sm before:bg-muted-foreground"><i />خروجی</span>
          </div>
          <FinancialChart empty={!data.some((week) => week.inflow != null || week.outflow != null)} emptyMessage="جریان نقد برای این بازه موجود نیست." className="h-40 sm:h-44" label="نمودار ورودی و خروجی نقد در مقیاس جداگانه؛ مقادیر دقیق در جزئیات هفتگی">

              <ComposedChart data={data} margin={{ top: 10, right: 14, left: 0, bottom: 4 }} accessibilityLayer>
                <ChartGrid vertical={false} stroke="var(--ds-border)" />
                <ChartXAxis dataKey="calendarLabel" axisLine={false} tickLine={false} minTickGap={32} />
                <ChartYAxis width={58} tickFormatter={(value) => new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(value)}
                  axisLine={false} tickLine={false} />
                <ChartTooltip content={<ForecastTooltip />} />
                <Bar dataKey="inflow" name="ورودی" fill="var(--ds-primary)" maxBarSize={12} isAnimationActive={false} />
                <Bar dataKey="outflow" name="خروجی" fill="var(--ds-foreground-soft)" maxBarSize={12} isAnimationActive={false} />
              </ComposedChart>

          </FinancialChart>

        </>
      ) : (
        <EmptyState variant="inline">
          دادهٔ کافی برای رسم روند نقدینگی موجود نیست.
        </EmptyState>
      )}
      <details className="dashboard-chart-details">
        <summary>جزئیات هفتگی</summary>
        <div className="min-w-0">
          <Table className="min-w-[640px]" containerClassName="border-0">
            <TableCaption className="sr-only">
              مقادیر پیش‌بینی نقدینگی به تفکیک هفته
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>بازهٔ هفته</TableHead>
                <TableHead>ورودی</TableHead>
                <TableHead>خروجی</TableHead>
                <TableHead>مانده نقد</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {weeks.map((week) => (
                <TableRow key={week.week_number}>
                  <TableRowHeader>{toPersianDigits(week.jalali_range) || (week.start_date ? `${toJalaliDate(week.start_date)} تا ${toJalaliDate(week.end_date)}` : `هفتهٔ ${toPersianDigits(week.week_number)}`)}</TableRowHeader>
                  <TableCell>
                    <MoneyDisplay
                      direction="neutral"
                      amount={week.expected_inflow_irr}
                      executive
                      size="sm"
                    />
                  </TableCell>
                  <TableCell>
                    <MoneyDisplay
                      direction="neutral"
                      amount={week.expected_outflow_irr}
                      executive
                      size="sm"
                    />
                  </TableCell>
                  <TableCell>
                    <MoneyDisplay
                      direction="neutral"
                      amount={week.closing_cash_irr}
                      executive
                      size="sm"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </details>
    </section>
  );
}
