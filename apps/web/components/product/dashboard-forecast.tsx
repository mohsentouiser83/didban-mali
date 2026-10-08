"use client";

import {
  ComposedChart,
  Line,
  Bar,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MoneyDisplay, toPersianDigits, toJalaliDate } from "@/components/ui/financial";



type ForecastWeek = {
  week_number: number;
  jalali_range?: string;
  start_date?: string;
  end_date?: string;
  closing_cash_irr?: string | number | null;
  expected_inflow_irr?: string | number | null;
  expected_outflow_irr?: string | number | null;
};
export type ForecastOutlook = {
  weeks?: ForecastWeek[];
  starting_cash_irr?: number | string | null;
  lowest_projected_cash_irr?: number | string | null;
  inflow_coverage_percentage?: number | null;
  first_deficit_week?: number | null;
};

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
    <div className="dashboard-chart-tooltip" dir="rtl">
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
    </div>
  );
}

export function DashboardForecast({ outlook, asOfDate }: { outlook: ForecastOutlook; asOfDate?: string }) {
  const weeks = outlook.weeks ?? [];
  const data = weeks.map((week) => ({
    ...week,
    calendarLabel: calendarLabel(week),
    inflow: finiteMillions(week.expected_inflow_irr),
    outflow: finiteMillions(week.expected_outflow_irr),
    closing:
      week.closing_cash_irr == null ||
      week.closing_cash_irr === "" ||
      !Number.isFinite(Number(week.closing_cash_irr))
        ? null
        : Number(week.closing_cash_irr) / 10_000_000,
  }));
  return (
    <section
      className="dashboard-panel dashboard-forecast"
      aria-labelledby="dashboard-forecast-title"
    >
      <div className="dashboard-panel-heading">
        <div>
          <h2 id="dashboard-forecast-title">دورنمای نقدینگی</h2>
          <p>پیش‌بینی ۱۳ هفته‌ای{asOfDate ? ` از ${toJalaliDate(asOfDate)}` : ""}</p>
        </div>
        {outlook.first_deficit_week != null && (
          <span className="dashboard-metric-note dashboard-state-warning">
            کسری · هفته {toPersianDigits(outlook.first_deficit_week)}
          </span>
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
      {data.some((week) => week.closing !== null) ? (
        <>
          <div className="dashboard-chart-unit"><strong>ماندهٔ نقد</strong><span>میلیون تومان</span></div>
          <div className="dashboard-chart dashboard-chart-balance" dir="ltr" role="img"
            aria-label="نمودار ماندهٔ نقد پیش‌بینی‌شده؛ مقادیر دقیق در جزئیات هفتگی">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 160 }}>
              <ComposedChart data={data} margin={{ top: 10, right: 14, left: 0, bottom: 4 }} accessibilityLayer>
                <CartesianGrid vertical={false} stroke="var(--ds-border)" />
                <XAxis dataKey="calendarLabel" axisLine={false} tickLine={false} minTickGap={32}
                  tick={{ fill: "var(--ds-foreground-soft)", fontSize: 12 }} />
                <YAxis width={58} tickFormatter={(value) => new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(value)}
                  axisLine={false} tickLine={false} tick={{ fill: "var(--ds-foreground-soft)", fontSize: 12 }} />
                <Tooltip content={<ForecastTooltip />} />
                <ReferenceLine y={0} stroke="var(--ds-foreground-soft)" />
                <Line type="monotone" dataKey="closing" name="مانده نقد" stroke="var(--ds-primary)" strokeWidth={2.5}
                  isAnimationActive={false} connectNulls={false} dot={{ r: 2.5, fill: "var(--ds-card-solid)", strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="dashboard-chart-unit"><strong>جریان هفتگی</strong><span>میلیون تومان</span>
            <span className="dashboard-chart-legend is-inflow"><i />ورودی</span>
            <span className="dashboard-chart-legend is-outflow"><i />خروجی</span>
          </div>
          <div className="dashboard-chart dashboard-chart-flows" dir="ltr" role="img"
            aria-label="نمودار ورودی و خروجی نقد در مقیاس جداگانه؛ مقادیر دقیق در جزئیات هفتگی">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 130 }}>
              <ComposedChart data={data} margin={{ top: 10, right: 14, left: 0, bottom: 4 }} accessibilityLayer>
                <CartesianGrid vertical={false} stroke="var(--ds-border)" />
                <XAxis dataKey="calendarLabel" axisLine={false} tickLine={false} minTickGap={32}
                  tick={{ fill: "var(--ds-foreground-soft)", fontSize: 12 }} />
                <YAxis width={58} tickFormatter={(value) => new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(value)}
                  axisLine={false} tickLine={false} tick={{ fill: "var(--ds-foreground-soft)", fontSize: 12 }} />
                <Tooltip content={<ForecastTooltip />} />
                <Bar dataKey="inflow" name="ورودی" fill="var(--ds-primary)" maxBarSize={12} isAnimationActive={false} />
                <Bar dataKey="outflow" name="خروجی" fill="var(--ds-foreground-soft)" maxBarSize={12} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

        </>
      ) : (
        <p className="dashboard-empty-note">
          دادهٔ کافی برای رسم روند نقدینگی موجود نیست.
        </p>
      )}
      <details className="dashboard-chart-details">
        <summary>جزئیات هفتگی</summary>
        <div className="dashboard-table-scroll">
          <table>
            <caption className="sr-only">
              مقادیر پیش‌بینی نقدینگی به تفکیک هفته
            </caption>
            <thead>
              <tr>
                <th>بازهٔ هفته</th>
                <th>ورودی</th>
                <th>خروجی</th>
                <th>مانده نقد</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => (
                <tr key={week.week_number}>
                  <th>{toPersianDigits(week.jalali_range) || (week.start_date ? `${toJalaliDate(week.start_date)} تا ${toJalaliDate(week.end_date)}` : `هفتهٔ ${toPersianDigits(week.week_number)}`)}</th>
                  <td>
                    <MoneyDisplay
                      direction="neutral"
                      amount={week.expected_inflow_irr}
                      executive
                      size="sm"
                    />
                  </td>
                  <td>
                    <MoneyDisplay
                      direction="neutral"
                      amount={week.expected_outflow_irr}
                      executive
                      size="sm"
                    />
                  </td>
                  <td>
                    <MoneyDisplay
                      direction="neutral"
                      amount={week.closing_cash_irr}
                      executive
                      size="sm"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function finiteMillions(value: string | number | null | undefined) {
  return value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value) / 10_000_000;
}

function calendarLabel(week: ForecastWeek) {
  if (week.start_date) {
    const date = new Date(`${week.start_date}T12:00:00Z`);
    if (Number.isFinite(date.getTime())) return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "short", day: "numeric", timeZone: "Asia/Tehran" }).format(date);
  }
  const start = week.jalali_range?.split(" تا ")[0];
  return start ? toPersianDigits(start.replace(/^\d{4}\//, "")) : `هفته ${toPersianDigits(week.week_number)}`;
}
