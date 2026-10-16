"use client";
import { EmptyState, LoadingState, MoneyDisplay, toJalaliDate, toPersianDigits } from "@/components/ui/financial";

import { FinancialChart, ChartGrid, ChartXAxis, ChartYAxis, ChartTooltip, ChartTooltipSurface } from "@/components/ui/financial/financial-chart";

import Link from "next/link";
import { useWeeklyCashChart } from "./use-weekly-cash-chart";
import { Line, LineChart, ReferenceLine } from "recharts";
import { ChevronLeft, ChevronRight } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import type { CashFlowForecastResponse, CashFlowWeekItem, ScenarioType } from "@/lib/product-types";

export const CASH_SCENARIOS: { value: ScenarioType; label: string }[] = [
  { value: "base", label: "پایه" },
  { value: "pessimistic", label: "بدبینانه" },
  { value: "optimistic", label: "خوش‌بینانه" },
];

function CashTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: CashFlowWeekItem }[];
}) {
  const week = payload?.[0]?.payload;
  if (!active || !week) return null;
  return (
    <ChartTooltipSurface>
      <strong>هفته {toPersianDigits(week.week_number)}</strong>
      <p>
        {toJalaliDate(week.start_date)} تا {toJalaliDate(week.end_date)}
      </p>
      <MoneyDisplay
        amount={week.ending_cash_irr}
        executive
        direction="neutral"
        size="sm"
      />
    </ChartTooltipSurface>
  );
}

export function CashFlowForecastChart({
  forecast,
  scenario,
  onScenarioChange,
  loading = false,
  baseline,
  companyBase,
}: {
  forecast: CashFlowForecastResponse;
  scenario: ScenarioType;
  onScenarioChange: (value: ScenarioType) => void;
  loading?: boolean;
  baseline?: CashFlowForecastResponse | null;
  companyBase?: string;
}) {
  const { selected, selectedIndex, setSelectedNumber, firstDeficit, data, buffer, fullScale, setFullScale, horizonLabel, lower, upper, thresholdOutside, lowestWeek, baseWeek, assumptions, calendarTick } = useWeeklyCashChart(forecast, baseline);
  return (
    <section
      id="forecast-section"
      className="min-w-0 overflow-hidden rounded-[var(--ds-card-radius)] border border-border bg-card"
      aria-labelledby="cash-forecast-title"
      aria-busy={loading}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 [&_h2]:text-lg [&_h2]:font-bold sm:p-6">
        <div>
          <h2 id="cash-forecast-title">پیش‌بینی {horizonLabel}</h2>
        </div>
        <div
          className="flex flex-wrap gap-1 [&_button[aria-pressed=true]]:bg-muted [&_button[aria-pressed=true]]:text-primary"
          role="group"
          aria-label="سناریوی پیش‌بینی"
        >
          {CASH_SCENARIOS.map((item) => (
            <Button
              key={item.value}
              variant="ghost"
              size="sm"
              aria-pressed={scenario === item.value}
              disabled={loading}
              onClick={() => onScenarioChange(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 px-4 pb-4 text-sm leading-relaxed text-muted-foreground [&_summary]:cursor-pointer [&_details_p]:mt-2 sm:px-6">
        <p><strong>فرض سناریوی {CASH_SCENARIOS.find((item) => item.value === forecast.scenario)?.label}: </strong>{assumptions}؛ احتمال وصول حداکثر ۱۰۰٪.</p>
        <details><summary>روش برآورد و محدودیت‌ها</summary>
          <p>وصول: مانده فاکتور × احتمال وصول؛ در سررسید ۹۰٪، با تأخیر تا ۳۰ روز ۷۵٪، تا ۶۰ روز ۵۰٪ و بیشتر ۲۵٪. احتمال در ضریب سناریو ضرب می‌شود. بدون سررسید، تاریخ صدور + ۳۰ روز؛ مطالبات معوق در هفته اول قرار می‌گیرند.</p>
          <p>{forecast.outflow_mode === "planned" ? "مصرف: فقط پرداخت‌های ثبت‌شده با مبلغ و تاریخ مشخص؛ تخمین تاریخی اضافه نمی‌شود و ضریب سناریو مبلغ تعهدات را تغییر نمی‌دهد. " : "مصرف: میانگین خروجی ۹۰ روز گذشته × ضریب سناریو. تقسیم هفتگی بر ۴٫۳۳۳؛ در هفته شامل روزهای ۲۸ تا ۳۱ ماه میلادی، حقوق ۴۵٪ مصرف ماهانه، خرید ۴۰٪ مصرف هفتگی و سربار ۱۵٪ آن است. در سایر هفته‌ها خرید ۶۵٪ و سربار ۳۵٪ مصرف هفتگی است. این سهم‌ها فرض مدل‌اند؛ موعد واقعی پرداخت نیستند."}</p>
        </details>
      </div>
      {loading && (
        <LoadingState  variant="inline">
          در حال دریافت پیش‌بینی؛ مقادیر فعلی متعلق به سناریوی قبلی‌اند.
        </LoadingState>
      )}
      <div className="grid min-w-0 border-t border-border xl:grid-cols-[minmax(0,1.8fr)_minmax(260px,0.9fr)]">
        <div className="grid min-w-0 content-start gap-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <Button variant="outline" size="sm" aria-pressed={fullScale} onClick={() => setFullScale(!fullScale)}>{fullScale ? "نمایش جزئیات تغییرات" : "نمایش دامنه کامل با آستانه"}</Button>
            <span>{fullScale ? "دامنه شامل صفر و آستانه ذخیره" : "محور عمودی محدود به دامنه تغییرات مانده"}</span>
          </div>
          <div className="flex flex-wrap justify-between gap-3 text-xs text-muted-foreground [&>div]:flex [&>div]:flex-wrap [&>div]:gap-3 [&_span]:inline-flex [&_span]:items-center [&_span]:gap-2">
            <div>
              <span>
                <i className="inline-block h-0.5 w-4 bg-primary" />
                مانده نقد
              </span>
              <span>
                <i className="inline-block w-4 border-t-2 border-dashed border-[var(--ds-warning)]" />
                ذخیره امن
              </span>
              <span><i className="inline-block w-4 border-t border-dashed border-destructive" />صفر · مرز کسری واقعی</span>
            </div>
            <span>میلیون تومان</span>
          </div>
          <FinancialChart empty={!data.some((week) => week.balance != null)}
            label={`روند مانده نقد در ${horizonLabel}؛ خطوط صفر و ذخیره امن در دامنه کامل مشخص‌اند. جزئیات هر هفته در جدول قابل خواندن است.`}
          >

              <LineChart
                data={data}
                margin={{ top: 16, right: 20, left: 0, bottom: 8 }}
                accessibilityLayer
              >
                <ChartGrid vertical={false} stroke="var(--ds-border)" />
                <ChartXAxis
                  dataKey="week_number"
                  tickFormatter={calendarTick}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={16}
                />
                <ChartYAxis
                  width={52}
                  domain={fullScale ? [Math.min(0, lower, buffer ?? lower), Math.max(upper, buffer ?? upper)] : [lower, upper]}
                  allowDataOverflow
                  tickFormatter={(value: number) => new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(value)}
                  axisLine={false}
                  tickLine={false}
                />
                <ChartTooltip
                  content={<CashTooltip />}
                  cursor={{ stroke: "var(--ds-border-strong)" }}
                />
                {buffer != null && (fullScale || !thresholdOutside) && (
                  <ReferenceLine
                    y={buffer}
                    stroke="var(--ds-warning)"
                    strokeDasharray="5 5"
                    ifOverflow="hidden"
                  />
                )}
                {fullScale && <ReferenceLine y={0} stroke="var(--ds-risk-high-fg)" strokeDasharray="2 3" />}
                {selected && (
                  <ReferenceLine
                    x={selected.week_number}
                    stroke="var(--ds-border-strong)"
                    strokeDasharray="3 5"
                  />
                )}
                <Line
                  dataKey="balance"
                  name="مانده نقد"
                  type="linear"
                  stroke="var(--ds-primary)"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "var(--ds-card-solid)", strokeWidth: 2 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              </LineChart>

          </FinancialChart>
          <div
            className="flex flex-wrap justify-center gap-1 [&_button]:min-h-11 [&_button]:min-w-11 [&_button]:px-3 [&_button[aria-pressed=true]]:bg-muted [&_button[aria-pressed=true]]:font-bold [&_button[aria-pressed=true]]:text-primary"
            role="group"
            aria-label="انتخاب هفته"
          >
            {forecast.weeks.map((week) => (
              <Button
                key={week.week_number}
                variant="ghost"
                size="auto"
                disabled={loading}
                aria-label={`انتخاب هفته ${toPersianDigits(week.week_number)}${Number(week.ending_cash_irr) < 0 ? "، کسری واقعی" : week.is_deficit ? "، افت زیر ذخیره" : ""}`}
                aria-pressed={selected?.week_number === week.week_number}
                onClick={() => setSelectedNumber(week.week_number)}
                className={week.is_deficit ? "relative text-destructive [&>span]:absolute [&>span]:bottom-1 [&>span]:start-1/2 [&>span]:size-1 [&>span]:rounded-full [&>span]:bg-destructive" : undefined}
              >
                {toPersianDigits(week.week_number)}
                {week.is_deficit && <span aria-hidden="true" />}
              </Button>
            ))}
          </div>
          {thresholdOutside && !fullScale && <p className="text-sm text-muted-foreground">آستانه ذخیره خارج از دامنه این نماست؛ برای دیدن فاصله، دامنه کامل را انتخاب کنید.</p>}
          {lowestWeek && <p className="flex flex-wrap items-center gap-2 text-sm">کمترین مانده پایان هفته: <MoneyDisplay amount={lowestWeek.ending_cash_irr} executive direction="neutral" size="sm" /> · {toJalaliDate(lowestWeek.end_date)}</p>}
          <div className="grid gap-2 text-sm text-muted-foreground">
            <span>برای خواندن جزئیات، هفته را انتخاب کنید.</span>
            <span className={firstDeficit ? "text-destructive" : "text-sm text-muted-foreground"}>
              {firstDeficit
                ? `اولین افت زیر ذخیره امن: هفته ${toPersianDigits(firstDeficit.week_number)}`
                : `در ${horizonLabel} این سناریو، افت زیر ذخیره امن پیش‌بینی نشده است.`}
            </span>
          </div>
        </div>
        <aside className="min-w-0 border-t border-border p-4 xl:border-s xl:border-t-0 sm:p-6" aria-labelledby="cash-week-title">
          {selected ? (
            <>
              <div className="flex items-center justify-between gap-3 [&_h3]:font-[family-name:var(--font-display)] [&_h3]:text-2xl [&_h3]:font-bold">
                <div>
                  <span className="text-sm text-muted-foreground">هفته انتخاب‌شده</span>
                  <h3 id="cash-week-title">
                    هفته {toPersianDigits(selected.week_number)}
                  </h3>
                </div>
                <div className="flex gap-1 [&_button]:min-h-11 [&_button]:min-w-11">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="هفته قبل"
                    disabled={selectedIndex <= 0 || loading}
                    onClick={() =>
                      setSelectedNumber(
                        forecast.weeks[selectedIndex - 1]?.week_number,
                      )
                    }
                  >
                    <ChevronRight size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="هفته بعد"
                    disabled={
                      selectedIndex >= forecast.weeks.length - 1 || loading
                    }
                    onClick={() =>
                      setSelectedNumber(
                        forecast.weeks[selectedIndex + 1]?.week_number,
                      )
                    }
                  >
                    <ChevronLeft size={16} />
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-sm">
                {toJalaliDate(selected.start_date)} تا{" "}
                {toJalaliDate(selected.end_date)}
              </p>
              <div className="mt-6 flex min-w-0 flex-col items-start gap-2 [&>span]:flex-wrap [&>small]:text-sm">
                <span>مانده پایان هفته</span>
                <MoneyDisplay
                  amount={selected.ending_cash_irr}
                  executive
                  direction="neutral"
                  size="xl"
                />
                <small
                  className={
                    selected.is_deficit ? "text-destructive" : "text-[var(--ds-success)]"
                  }
                >
                  {Number(selected.ending_cash_irr) < 0
                    ? "کسری واقعی؛ مانده نقد منفی است"
                    : selected.is_deficit
                    ? "افت زیر ذخیره امن؛ مانده هنوز منفی نیست"
                    : "در محدوده ذخیره امن"}
                </small>
              </div>
              {forecast.scenario !== "base" && <p className="mt-4 text-sm">
                {baseWeek ? <>تفاوت مانده این هفته با پایه: <MoneyDisplay amount={String(Number(selected.ending_cash_irr) - Number(baseWeek.ending_cash_irr))} executive direction="neutral" size="sm" showSign /></> : "مقایسه با پایه دریافت نشد؛ به‌روزرسانی را انتخاب کنید."}
              </p>}
              <dl className="mt-6 border-t border-border [&>div]:flex [&>div]:flex-wrap [&>div]:items-baseline [&>div]:justify-between [&>div]:gap-3 [&>div]:border-b [&>div]:border-border [&>div]:py-3 [&_dt]:text-sm [&_dt]:text-muted-foreground [&_dd]:min-w-0 [&_dd]:text-end [&_dd>span]:flex-wrap">
                {[
                  ["مانده ابتدا", selected.starting_cash_irr],
                  ["ورودی پیش‌بینی‌شده", selected.projected_inflows_irr],
                  ["خروجی برآوردی", selected.projected_outflows_irr],
                  ["خالص تغییر", selected.net_change_irr],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>
                      <MoneyDisplay
                        amount={value}
                        executive
                        direction="neutral"
                        size="sm"
                        showSign={label === "خالص تغییر"}
                      />
                    </dd>
                  </div>
                ))}
              </dl>
              {Number(selected.ending_cash_irr) < 0 && <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-destructive">کمبود نقد تا صفر: <MoneyDisplay amount={String(Math.abs(Number(selected.ending_cash_irr)))} executive direction="neutral" size="sm" /></p>}
              {selected.is_deficit && (
                <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-destructive">
                  فاصله تا ذخیره امن:{" "}
                  <MoneyDisplay
                    amount={selected.deficit_amount_irr}
                    executive
                    direction="neutral"
                    size="sm"
                  />
                </p>
              )}
              <div className="mt-5 grid gap-3 text-sm [&_h4]:font-medium [&_ul]:grid [&_ul]:gap-3 [&_li]:flex [&_li]:flex-wrap [&_li]:justify-between [&_li]:gap-2 [&_small]:block [&_small]:text-xs [&_small]:text-muted-foreground">
                <h4>وصول‌های مورد انتظار این هفته</h4>
                {selected.receipts?.length ? <ul>{selected.receipts.map((item) => <li key={item.source_id}><span>{item.title}<small>{toJalaliDate(item.due_date)} · مبلغ با احتمال وصول تعدیل شده</small></span><MoneyDisplay amount={item.amount_irr} executive direction="neutral" size="sm" /></li>)}</ul> : <EmptyState variant="inline">فاکتور قابل وصولی در این هفته ثبت نشده است.</EmptyState>}
                <h4>پرداخت‌های این هفته</h4>
                {forecast.outflow_mode === "planned" ? selected.payments?.length ? <ul>{selected.payments.map((item) => <li key={item.source_id}><span>{item.title}<small>{toJalaliDate(item.due_date)}</small></span><MoneyDisplay amount={item.amount_irr} executive direction="neutral" size="sm" /></li>)}</ul> : <EmptyState variant="inline">پرداختی برای این هفته ثبت نشده؛ کامل‌بودن برنامه را بررسی کنید.</EmptyState> : <p>خروجی تخمینی از مصرف گذشته است؛ تاریخ واقعی پرداخت‌ها ثبت نشده است.</p>}
              </div>
              {companyBase && <div className="mt-5 flex flex-wrap gap-3 text-sm text-primary [&_a]:underline [&_a]:underline-offset-4"><Link href={`${companyBase}/receivables`}>پیگیری وصول مطالبات</Link><Link href={`${companyBase}/payables`}>بررسی بدهی‌ها</Link></div>}
            </>
          ) : (
            <EmptyState variant="inline">جزئیات هفتگی در دسترس نیست.</EmptyState>
          )}
        </aside>
      </div>
    </section>
  );
}
