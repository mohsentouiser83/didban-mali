"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronLeft, ChevronRight } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import {
  MoneyDisplay,
  toJalaliDate,
  toPersianDigits,
} from "@/components/ui/financial";
import type {
  CashFlowForecastResponse,
  CashFlowWeekItem,
  ScenarioType,
} from "@/lib/product-types";
import styles from "./cashflow.module.css";

export const CASH_SCENARIOS: { value: ScenarioType; label: string }[] = [
  { value: "base", label: "پایه" },
  { value: "pessimistic", label: "بدبینانه" },
  { value: "optimistic", label: "خوش‌بینانه" },
];

function millions(value: string) {
  return value.trim() && Number.isFinite(Number(value))
    ? Number(value) / 10_000_000
    : null;
}

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
    <div className={styles.tooltip} dir="rtl">
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
    </div>
  );
}

export function CashFlowForecastChart({
  forecast,
  scenario,
  onScenarioChange,
  loading = false,
  baseline,
}: {
  forecast: CashFlowForecastResponse;
  scenario: ScenarioType;
  onScenarioChange: (value: ScenarioType) => void;
  loading?: boolean;
  baseline?: CashFlowForecastResponse | null;
}) {
  const [selectedNumber, setSelectedNumber] = useState(
    () =>
      (forecast.weeks.find((week) => week.is_deficit) ?? forecast.weeks[0])
        ?.week_number,
  );
  const selected =
    forecast.weeks.find((week) => week.week_number === selectedNumber) ??
    forecast.weeks[0];
  const selectedIndex = forecast.weeks.findIndex(
    (week) => week.week_number === selected?.week_number,
  );
  const firstDeficit = forecast.weeks.find((week) => week.is_deficit);
  const data = forecast.weeks.map((week) => ({
    ...week,
    balance: millions(week.ending_cash_irr),
  }));
  const buffer = millions(forecast.safety_buffer_irr);
  const [fullScale, setFullScale] = useState(false);
  const balances = data.map((week) => week.balance).filter((value): value is number => value != null);
  const minimum = Math.min(...balances);
  const maximum = Math.max(...balances);
  const padding = Math.max((maximum - minimum) * 0.15, Math.abs(maximum) * 0.02, 1);
  const lower = minimum - padding;
  const upper = maximum + padding;
  const thresholdOutside = buffer != null && (buffer < lower || buffer > upper);
  const lowestWeek = forecast.weeks.reduce((lowest, week) => Number(week.ending_cash_irr) < Number(lowest.ending_cash_irr) ? week : lowest, forecast.weeks[0]);
  const baseWeek = baseline?.as_of_date === forecast.as_of_date && baseline.safety_buffer_irr === forecast.safety_buffer_irr ? baseline.weeks.find((week) => week.week_number === selected?.week_number) : undefined;
  const assumptions = forecast.scenario === "pessimistic" ? "ضریب احتمال وصول: ۰٫۷۰ · ضریب مصرف: ۱٫۱۰" : forecast.scenario === "optimistic" ? "ضریب احتمال وصول: ۱٫۱۵ · ضریب مصرف: ۰٫۹۵" : "ضریب احتمال وصول: ۱٫۰۰ · ضریب مصرف: ۱٫۰۰";
  const calendarTick = (weekNumber: number) => {
    const week = forecast.weeks.find((item) => item.week_number === weekNumber);
    return week ? new Intl.DateTimeFormat("fa-IR", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${week.end_date}T12:00:00Z`)) : "";
  };
  return (
    <section
      id="forecast-section"
      className={styles.forecast}
      aria-labelledby="cash-forecast-title"
      aria-busy={loading}
    >
      <div className={styles.sectionHeading}>
        <div>
          <h2 id="cash-forecast-title">مسیر نقدینگی در ۱۳ هفته آینده</h2>
          <p>مانده پایان هفته در برابر حداقل ذخیره امن</p>
        </div>
        <div
          className={styles.scenarios}
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
      <div className={styles.modelNotes}>
        <p><strong>فرض سناریوی {CASH_SCENARIOS.find((item) => item.value === forecast.scenario)?.label}: </strong>{assumptions}؛ احتمال وصول حداکثر ۱۰۰٪.</p>
        <details><summary>روش برآورد و محدودیت‌ها</summary>
          <p>وصول: مانده فاکتور × احتمال وصول؛ در سررسید ۹۰٪، با تأخیر تا ۳۰ روز ۷۵٪، تا ۶۰ روز ۵۰٪ و بیشتر ۲۵٪. احتمال در ضریب سناریو ضرب می‌شود. بدون سررسید، تاریخ صدور + ۳۰ روز؛ مطالبات معوق در هفته اول قرار می‌گیرند.</p>
          <p>مصرف: میانگین خروجی ۹۰ روز گذشته × ضریب سناریو. تقسیم هفتگی بر ۴٫۳۳۳؛ در هفته شامل روزهای ۲۸ تا ۳۱ ماه میلادی، حقوق ۴۵٪ مصرف ماهانه، خرید ۴۰٪ مصرف هفتگی و سربار ۱۵٪ آن است. در سایر هفته‌ها خرید ۶۵٪ و سربار ۳۵٪ مصرف هفتگی است. این سهم‌ها فرض مدل‌اند؛ موعد واقعی پرداخت نیستند.</p>
        </details>
      </div>
      {loading && (
        <p className={styles.loadingNote} role="status">
          در حال دریافت پیش‌بینی؛ مقادیر فعلی متعلق به سناریوی قبلی‌اند.
        </p>
      )}
      <div className={styles.forecastBody}>
        <div className={styles.trajectory}>
          <div className={styles.scaleControl}>
            <Button variant="outline" size="sm" aria-pressed={fullScale} onClick={() => setFullScale(!fullScale)}>{fullScale ? "نمایش جزئیات تغییرات" : "نمایش دامنه کامل با آستانه"}</Button>
            <span>{fullScale ? "دامنه شامل صفر و آستانه ذخیره" : "محور عمودی محدود به دامنه تغییرات مانده"}</span>
          </div>
          <div className={styles.chartMeta}>
            <div>
              <span>
                <i className={styles.balanceKey} />
                مانده نقد
              </span>
              <span>
                <i className={styles.bufferKey} />
                ذخیره امن
              </span>
            </div>
            <span>میلیون تومان</span>
          </div>
          <div
            className={styles.chart}
            dir="ltr"
            role="img"
            aria-label="روند مانده نقد در ۱۳ هفته؛ در نمای دامنه کامل خط نقطه‌چین آستانه ذخیره را نشان می‌دهد. جزئیات با انتخاب هفته و در جدول قابل خواندن است."
          >
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 600, height: 280 }}
            >
              <LineChart
                data={data}
                margin={{ top: 16, right: 20, left: 0, bottom: 8 }}
                accessibilityLayer
              >
                <CartesianGrid vertical={false} stroke="var(--ds-border)" />
                <XAxis
                  dataKey="week_number"
                  tickFormatter={calendarTick}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={16}
                  tick={{ fill: "var(--ds-foreground-soft)", fontSize: 14 }}
                />
                <YAxis
                  width={52}
                  domain={fullScale ? [Math.min(0, lower, buffer ?? lower), Math.max(upper, buffer ?? upper)] : [lower, upper]}
                  allowDataOverflow
                  tickFormatter={(value: number) => new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(value)}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--ds-foreground-soft)", fontSize: 14 }}
                />
                <Tooltip
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
            </ResponsiveContainer>
          </div>
          <div
            className={styles.weekPicker}
            role="group"
            aria-label="انتخاب هفته"
          >
            {forecast.weeks.map((week) => (
              <Button
                key={week.week_number}
                variant="ghost"
                size="auto"
                disabled={loading}
                aria-label={`انتخاب هفته ${toPersianDigits(week.week_number)}${week.is_deficit ? "، کسری ذخیره" : ""}`}
                aria-pressed={selected?.week_number === week.week_number}
                onClick={() => setSelectedNumber(week.week_number)}
                className={week.is_deficit ? styles.deficitWeek : undefined}
              >
                {toPersianDigits(week.week_number)}
                {week.is_deficit && <span aria-hidden="true" />}
              </Button>
            ))}
          </div>
          {thresholdOutside && !fullScale && <p className={styles.loadingNote}>آستانه ذخیره خارج از دامنه این نماست؛ برای دیدن فاصله، دامنه کامل را انتخاب کنید.</p>}
          {lowestWeek && <p className={styles.lowestBalance}>کمترین مانده پایان هفته: <MoneyDisplay amount={lowestWeek.ending_cash_irr} executive direction="neutral" size="sm" /> · {toJalaliDate(lowestWeek.end_date)}</p>}
          <div className={styles.chartFootnote}>
            <span>برای خواندن جزئیات، هفته را انتخاب کنید.</span>
            <span className={firstDeficit ? styles.danger : styles.secondary}>
              {firstDeficit
                ? `اولین افت زیر ذخیره امن: هفته ${toPersianDigits(firstDeficit.week_number)}`
                : "در افق ۱۳ هفته این سناریو، افت زیر ذخیره امن پیش‌بینی نشده است."}
            </span>
          </div>
        </div>
        <aside className={styles.inspector} aria-labelledby="cash-week-title">
          {selected ? (
            <>
              <div className={styles.inspectorHeading}>
                <div>
                  <span className={styles.secondary}>هفته انتخاب‌شده</span>
                  <h3 id="cash-week-title">
                    هفته {toPersianDigits(selected.week_number)}
                  </h3>
                </div>
                <div className={styles.weekArrows}>
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
              <p className={styles.weekDate}>
                {toJalaliDate(selected.start_date)} تا{" "}
                {toJalaliDate(selected.end_date)}
              </p>
              <div className={styles.weekBalance}>
                <span>مانده پایان هفته</span>
                <MoneyDisplay
                  amount={selected.ending_cash_irr}
                  executive
                  direction="neutral"
                  size="xl"
                />
                <small
                  className={
                    selected.is_deficit ? styles.danger : styles.success
                  }
                >
                  {selected.is_deficit
                    ? "کمتر از حداقل ذخیره امن"
                    : "در محدوده ذخیره امن"}
                </small>
              </div>
              {forecast.scenario !== "base" && <p className={styles.comparison}>
                {baseWeek ? <>تفاوت مانده این هفته با پایه: <MoneyDisplay amount={String(Number(selected.ending_cash_irr) - Number(baseWeek.ending_cash_irr))} executive direction="neutral" size="sm" showSign /></> : "مقایسه با پایه دریافت نشد؛ به‌روزرسانی را انتخاب کنید."}
              </p>}
              <dl className={styles.weekLedger}>
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
              {selected.is_deficit && (
                <p className={styles.deficitNote}>
                  فاصله تا ذخیره امن:{" "}
                  <MoneyDisplay
                    amount={selected.deficit_amount_irr}
                    executive
                    direction="neutral"
                    size="sm"
                  />
                </p>
              )}
            </>
          ) : (
            <p className={styles.empty}>جزئیات هفتگی در دسترس نیست.</p>
          )}
        </aside>
      </div>
    </section>
  );
}
