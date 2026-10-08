"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, RefreshCcw, RotateCcw } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyState,
  MoneyDisplay,
  PageHeader,
  toJalaliDate,
  toPersianDigits,
} from "@/components/ui/financial";
import { api } from "@/lib/product-api";
import type {
  CashFlowForecastResponse,
  CashFlowSummaryResponse,
  CashRunwayStatus,
  Company,
  ScenarioType,
} from "@/lib/product-types";
import {
  CashFlowForecastChart,
  CASH_SCENARIOS,
} from "./cashflow-forecast-chart";
import styles from "./cashflow.module.css";

const RUNWAY: Record<CashRunwayStatus, { label: string; description: string }> =
  {
    critical: {
      label: "تاب‌آوری کمتر از ۳۰ روز",
      description: "با نرخ مصرف فعلی، ذخیره نقد کمتر از یک ماه را پوشش می‌دهد.",
    },
    warning: {
      label: "تاب‌آوری ۳۰ تا ۶۰ روز",
      description: "ذخیره نقد با نرخ مصرف فعلی، یک تا دو ماه را پوشش می‌دهد.",
    },
    monitor: {
      label: "تاب‌آوری ۶۰ تا ۱۲۰ روز",
      description:
        "ذخیره نقد بین دو تا چهار ماه را پوشش می‌دهد؛ تغییر وصول و پرداخت‌ها بر این برآورد اثر دارد.",
    },
    healthy: {
      label: "تاب‌آوری حداقل ۱۲۰ روز",
      description: "با نرخ مصرف فعلی، ذخیره نقد حداقل چهار ماه را پوشش می‌دهد.",
    },
    sustainable: {
      label: "نرخ مصرف ثبت‌شده صفر است",
      description:
        "در داده‌های فعلی نرخ مصرف مثبت ثبت نشده است؛ مدت تاب‌آوری قابل محاسبه نیست.",
    },
  };

function validAmount(value: string | undefined) {
  return value != null && value.trim() !== "" && Number.isFinite(Number(value));
}

export function CashFlowWorkspace({ company }: { company: Company }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [summary, setSummary] = useState<CashFlowSummaryResponse | null>(null);
  const [forecast, setForecast] = useState<CashFlowForecastResponse | null>(
    null,
  );
  const [scenario, setScenario] = useState<ScenarioType>("base");
  const [loading, setLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(false);
  const [forecastError, setForecastError] = useState(false);
  const request = useRef(0);
  const reserveAmount = useRef("");
  const [reserveDays, setReserveDays] = useState("default");
  const [baseline, setBaseline] = useState<CashFlowForecastResponse | null>(null);

  const loadData = useCallback(
    async (target: ScenarioType, reset = false) => {
      const id = ++request.current;
      setLoading(true);
      setScenario(target);
      if (reset) {
        setSummary(null);
        setForecast(null);
      }
      const reserveQuery = reserveAmount.current ? `&safety_buffer_irr=${reserveAmount.current}` : "";
      const results = await Promise.allSettled([
        api<CashFlowSummaryResponse>(
          `/companies/${company.id}/cashflow/summary${reserveQuery ? `?${reserveQuery.slice(1)}` : ""}`,
        ),
        api<CashFlowForecastResponse>(
          `/companies/${company.id}/cashflow/forecast?scenario=${target}${reserveQuery}`,
        ),
        ...(target !== "base" ? [api<CashFlowForecastResponse>(`/companies/${company.id}/cashflow/forecast?scenario=base${reserveQuery}`)] : []),
      ]);
      if (id !== request.current) return;
      const [sum, fc] = results;
      setSummaryError(sum.status === "rejected");
      setForecastError(fc.status === "rejected");
      setSummary(sum.status === "fulfilled" ? sum.value : null);
      setForecast(fc.status === "fulfilled" ? fc.value : null);
      const baseResult = target === "base" ? fc : results[2];
      setBaseline(baseResult?.status === "fulfilled" ? baseResult.value as CashFlowForecastResponse : null);
      setLoading(false);
    },
    [company.id],
  );

  useEffect(() => {
    reserveAmount.current = "";
    void loadData("base", true);
    return () => {
      request.current++;
    };
  }, [loadData]);
  const forecastView = searchParams.get("view") === "forecast";

  const firstDeficit = forecast?.weeks.find((week) => week.is_deficit);
  const buffer =
    summary &&
    Number(summary.safety_buffer_irr) > 0 &&
    validAmount(summary.current_cash_irr)
      ? (
          Number(summary.current_cash_irr) / Number(summary.safety_buffer_irr)
        ).toFixed(1)
      : null;
  const base = `/companies/${company.id}`;
  const dataDate = summary?.as_of_date ?? forecast?.as_of_date;
  const hasData = !!(summary || forecast);

  return (
    <div className={styles.page} dir="rtl" aria-busy={loading}>
      <PageHeader
        title="نقدینگی، با دیدِ رو به جلو"
        description="موجودی امروز، مسیر نقد در هفته‌های آینده و اثر زمان‌بندی وصول و پرداخت."
        statusMetadata={
          dataDate ? (
            <span>مبنای داده‌ها: {toJalaliDate(dataDate)}</span>
          ) : undefined
        }
        primaryAction={
          <Button asChild>
            <Link href={`${base}/scenarios`}>
              بررسی سناریوها
              <ChevronLeft size={16} />
            </Link>
          </Button>
        }
        secondaryActions={
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => void loadData(scenario)}
            aria-busy={loading}
          >
            <RefreshCcw
              size={16}
              className={loading ? "animate-spin" : undefined}
            />
            به‌روزرسانی
          </Button>
        }
      />
      <Tabs className="flex min-w-0 flex-col gap-7" value={forecastView ? "forecast" : "current"} variant="line" onValueChange={(view) => {
        const query = new URLSearchParams(searchParams.toString());
        query.set("view", view);
        router.push(`${pathname}?${query}`, { scroll: false });
      }}>
        <TabsList aria-label="نمای نقدینگی">
          <TabsTrigger value="current">موقعیت فعلی</TabsTrigger>
          <TabsTrigger value="forecast">پیش‌بینی نقدینگی</TabsTrigger>
        </TabsList>
      <TabsContent value={forecastView ? "forecast" : "current"} className="m-0 flex min-w-0 flex-col gap-7">
      {loading && !hasData ? (
        <CashFlowSkeleton />
      ) : (
        <>
          {(summaryError || forecastError) && (
            <div className={styles.error} role="alert">
              <p>
                {summaryError && forecastError
                  ? "اطلاعات نقدینگی دریافت نشد. دوباره تلاش کنید."
                  : summaryError
                    ? "شاخص‌های نقدینگی دریافت نشد؛ پیش‌بینی موجود در ادامه نمایش داده می‌شود."
                    : "پیش‌بینی دریافت نشد؛ شاخص‌های موجود در ادامه نمایش داده می‌شوند."}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadData(scenario)}
                disabled={loading}
              >
                تلاش دوباره
              </Button>
            </div>
          )}
          {!hasData && !summaryError && !forecastError && (
            <EmptyState
              title="اطلاعات نقدینگی در دسترس نیست"
              description="گردش بانکی و اسناد مالی را در مرکز داده‌های شرکت بارگذاری و پردازش کنید."
              action={{ label: "رفتن به مرکز داده‌ها", href: `${base}/data` }}
            />
          )}
          {hasData && (
            <>
              <section className={styles.metrics} aria-label="موقعیت نقدینگی">
                <CashMetric
                  label="موجودی نقد در دسترس"
                  note={
                    buffer
                      ? `${toPersianDigits(buffer.replace(".", "٫"))} برابر ذخیره امن`
                      : "بر اساس مانده حساب‌ها"
                  }
                >
                  <MoneyDisplay
                    amount={
                      summary?.current_cash_irr ?? forecast?.current_cash_irr
                    }
                    executive
                    direction="neutral"
                    size="xl"
                  />
                </CashMetric>
                <CashMetric
                  label="تاب‌آوری با نرخ مصرف فعلی"
                  note={
                    summary?.runway_status === "sustainable"
                      ? "نرخ مصرف مثبت ثبت نشده"
                      : summary
                        ? `معادل ${toPersianDigits(String(summary.runway_months).replace(".", "٫"))} ماه`
                        : "شاخص در دسترس نیست"
                  }
                >
                  <strong>
                    {summary
                      ? summary.runway_status === "sustainable"
                        ? "—"
                        : toPersianDigits(summary.runway_days)
                      : "—"}
                  </strong>
                  {summary && summary.runway_status !== "sustainable" && (
                    <span>روز</span>
                  )}
                </CashMetric>
                <CashMetric
                  label="میانگین مصرف ماهانه"
                  note="برآورد بر اساس ۹۰ روز گذشته"
                >
                  <MoneyDisplay
                    amount={summary?.monthly_burn_rate_irr}
                    executive
                    direction="neutral"
                    size="xl"
                  />
                </CashMetric>
                <CashMetric
                  label="اولین افت زیر ذخیره امن"
                  note={`سناریوی ${CASH_SCENARIOS.find((item) => item.value === (forecast?.scenario ?? scenario))?.label ?? "پایه"}`}
                >
                  <strong className={styles.riskValue}>
                    {forecast
                      ? firstDeficit
                        ? `هفته ${toPersianDigits(firstDeficit.week_number)}`
                        : "بدون افت در ۱۳ هفته"
                      : "—"}
                  </strong>
                </CashMetric>
              </section>
              {!forecastView && summary && (
                <section
                  className={`${styles.assessment} ${styles[summary.runway_status]}`}
                  aria-label="ارزیابی تاب‌آوری"
                >
                  <div>
                    <strong>{RUNWAY[summary.runway_status].label}</strong>
                    <p>{RUNWAY[summary.runway_status].description}</p>
                  </div>
                  <div className={styles.bufferAmount}>
                    <span>حداقل ذخیره امن</span>
                    <MoneyDisplay
                      amount={summary.safety_buffer_irr}
                      executive
                      direction="neutral"
                      size="md"
                    />
                  </div>
                </section>
              )}
              {summary && (
                <section className={styles.policy} aria-label="مبنای موجودی و ذخیره">
                  {forecastView && <div className={styles.reserveControl}>
                    <label htmlFor="reserve-days">سیاست ذخیره برای این پیش‌بینی</label>
                    <Select dir="rtl" value={reserveDays} disabled={loading}
                      onValueChange={(days) => {
                        setReserveDays(days);
                        reserveAmount.current = days === "default" ? "" : String(Math.round(Number(summary.monthly_burn_rate_irr) / 30 * Number(days)));
                        void loadData(scenario);
                      }}>
                      <SelectTrigger id="reserve-days" className={styles.reserveSelect}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">پیش‌فرض مدل</SelectItem>
                        {[15, 30, 60].map((days) => <SelectItem key={days} value={String(days)} disabled={Number(summary.monthly_burn_rate_irr) <= 0}>{toPersianDigits(days)} روز مصرف</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p>{reserveDays === "default"
                      ? Number(summary.monthly_burn_rate_irr) > 0 ? "پیش‌فرض: ۲۰٪ مصرف ماهانه، معادل ۶ روز مصرف." : "بدون نرخ مصرف مثبت، پیش‌فرض ۱۰٪ موجودی نقدِ مثبت است."
                      : `آستانه برابر مصرف روزانه × ${toPersianDigits(reserveDays)} روز است.`} انتخاب ذخیره فقط در این صفحه اعمال می‌شود.</p>
                  </div>
                  }
                  {!!summary.cash_warnings?.length && <div role="alert">{summary.cash_warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
                  {!forecastView && <details className={styles.accountDetails}>
                    <summary>مبنای موجودی و مانده حساب‌ها</summary>
                    <p>همان تعریف داشبورد: یک مانده برای هر حساب، با رعایت حساب‌های مستثناشده. مانده صفر و منفی نیز در جمع لحاظ می‌شود.</p>
                    {summary.cash_accounts?.map((account) => <div className={styles.accountRow} key={account.bank_account_id}>
                      <span>{account.bank_name} · {account.label}{account.account_last4 ? ` · ${toPersianDigits(account.account_last4)}` : ""}<small>{account.balance_date ? toJalaliDate(account.balance_date) : "بدون مانده معتبر"} · {account.method === "transaction_net_sum" ? "خالص تراکنش‌ها؛ مانده بانکی ثبت نشده" : account.method === "unavailable" ? "از جمع کنار گذاشته شده" : "آخرین مانده ثبت‌شده"}</small></span>
                      <MoneyDisplay amount={account.balance_irr} direction="neutral" size="sm" />
                    </div>)}
                  </details>}
                </section>
              )}
              {forecastView && (forecast?.weeks.length ? (
                <CashFlowForecastChart
                  key={`${company.id}:${forecast.as_of_date}`}
                  baseline={baseline}
                  forecast={forecast}
                  scenario={scenario}
                  onScenarioChange={(value) => void loadData(value)}
                  loading={loading}
                />
              ) : (
                !forecastError && (
                  <div className={styles.empty}>
                    پیش‌بینی هفتگی در دسترس نیست. اطلاعات فروش و مصرف نقد را در
                    مرکز داده‌ها بررسی کنید.
                  </div>
                )
              ))}
              {forecastView && forecast && (
                <>
                  <section
                    className={styles.sources}
                    aria-labelledby="cash-sources-title"
                  >
                    <div className={styles.sectionHeading}>
                      <div>
                        <h2 id="cash-sources-title">پشتوانه ورود و خروج نقد</h2>
                        <p>ورودی از فاکتورهای باز؛ خروجی برآوردی از مصرف گذشته، نه تعهدات سررسیددار</p>
                      </div>
                      <Link className={styles.textLink} href={`${base}/data`}>
                        بررسی داده‌ها
                        <ChevronLeft size={14} />
                      </Link>
                    </div>
                    <div className={styles.sourcesBody}>
                      <SourceBreakdown
                        title="منابع ورودی"
                        total={forecast.total_projected_inflows_irr}
                        items={forecast.inflow_sources}
                      />
                      <SourceBreakdown
                        title="مصارف برآوردی مدل"
                        total={forecast.total_projected_outflows_irr}
                        items={forecast.outflow_sources}
                      />
                    </div>
                  </section>
                  <details className={styles.detailSection}>
                    <summary>
                      جدول کامل پیش‌بینی هفتگی{" "}
                      <span>مانده، ورودی و خروجی با مبلغ دقیق</span>
                    </summary>
                    <div className={styles.tableScroll}>
                      <table>
                        <caption className="sr-only">
                          جدول پیش‌بینی نقدینگی؛ همه مبالغ به ریال
                        </caption>
                        <thead>
                          <tr>
                            <th>هفته</th>
                            <th>بازه زمانی</th>
                            <th>مانده ابتدا</th>
                            <th>ورودی</th>
                            <th>خروجی برآوردی</th>
                            <th>خالص تغییر</th>
                            <th>مانده پایان</th>
                            <th>وضعیت ذخیره</th>
                          </tr>
                        </thead>
                        <tbody>
                          {forecast.weeks.map((week) => (
                            <tr key={week.week_number}>
                              <th scope="row">
                                {toPersianDigits(week.week_number)}
                              </th>
                              <td>
                                {toJalaliDate(week.start_date)} تا{" "}
                                {toJalaliDate(week.end_date)}
                              </td>
                              {[
                                week.starting_cash_irr,
                                week.projected_inflows_irr,
                                week.projected_outflows_irr,
                                week.net_change_irr,
                                week.ending_cash_irr,
                              ].map((value, index) => (
                                <td key={index}>
                                  <MoneyDisplay
                                    amount={value}
                                    direction="neutral"
                                    size="sm"
                                    showSign={index === 3}
                                  />
                                </td>
                              ))}
                              <td
                                className={
                                  week.is_deficit ? styles.danger : undefined
                                }
                              >
                                {week.is_deficit
                                  ? "زیر ذخیره امن"
                                  : "در محدوده امن"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </>
              )}
              {forecastView && summary && forecast && (
                <CashSensitivity
                  key={company.id}
                  summary={summary}
                  forecast={forecast}
                  base={base}
                />
              )}
              {!forecastView && <Button variant="outline" asChild><Link href={`${base}/cashflow?view=forecast`}>مشاهده مسیر نقد در ۱۳ هفته آینده</Link></Button>}
              {forecastView && <footer className={styles.footer}>
                <p>
                  این برآورد فقط افق ۱۳ هفته و سناریوی انتخاب‌شده را پوشش می‌دهد؛ تضمین توان پرداخت نیست. بدهی‌های سررسیددار، مالیات و هزینه‌های ثبت‌نشده در مدل پرداخت لحاظ نشده‌اند. تغییر
                  زمان وصول، پرداخت یا ورود داده جدید می‌تواند مسیر نقد را تغییر
                  دهد.
                </p>
                <Link className={styles.textLink} href={`${base}/data`}>
                  منابع و پوشش داده‌ها
                  <ChevronLeft size={14} />
                </Link>
              </footer>}
            </>
          )}
        </>
      )}
      </TabsContent>
      </Tabs>
    </div>
  );
}

function CashMetric({
  label,
  note,
  children,
}: {
  label: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.metric}>
      <h2>{label}</h2>
      <div className={styles.metricValue}>{children}</div>
      <p>{note}</p>
    </div>
  );
}

function SourceBreakdown({
  title,
  total,
  items,
}: {
  title: string;
  total: string;
  items: { category: string; amount_irr: string; share_percentage: number }[];
}) {
  return (
    <div className={styles.sourceColumn}>
      <div className={styles.sourceHeading}>
        <h3>{title}</h3>
        <MoneyDisplay amount={total} executive direction="neutral" size="md" />
      </div>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item.category}>
              <div>
                <span>{item.category}</span>
                <MoneyDisplay
                  amount={item.amount_irr}
                  executive
                  direction="neutral"
                  size="sm"
                />
                <small>
                  {Number.isFinite(item.share_percentage)
                    ? `${toPersianDigits(item.share_percentage.toFixed(1).replace(".", "٫"))}٪`
                    : "—"}
                </small>
              </div>
              <span className={styles.sourceTrack} aria-hidden="true">
                <span
                  style={{
                    width: `${Number.isFinite(item.share_percentage) ? Math.max(0, Math.min(100, item.share_percentage)) : 0}%`,
                  }}
                />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.secondary}>جزئیات منابع ثبت نشده است.</p>
      )}
    </div>
  );
}

function CashSensitivity({
  summary,
  forecast,
  base,
}: {
  summary: CashFlowSummaryResponse;
  forecast: CashFlowForecastResponse;
  base: string;
}) {
  const [dso, setDso] = useState(0);
  const [dpo, setDpo] = useState(0);
  const changed = dso !== 0 || dpo !== 0;
  const impact = useMemo(() => {
    const horizon = forecast.weeks.length * 7;
    if (
      !horizon ||
      !validAmount(forecast.total_projected_inflows_irr) ||
      !validAmount(forecast.total_projected_outflows_irr)
    )
      return null;
    const cash = Math.round(
      (-dso * Number(forecast.total_projected_inflows_irr)) / horizon +
        (dpo * Number(forecast.total_projected_outflows_irr)) / horizon,
    );
    const burn = Number(summary.monthly_burn_rate_irr);
    return {
      cash,
      runway:
        burn > 0 &&
        Number.isFinite(burn) &&
        summary.runway_status !== "sustainable"
          ? Math.max(0, summary.runway_days + Math.round(cash / (burn / 30)))
          : null,
    };
  }, [dso, dpo, summary, forecast]);
  return (
    <details className={styles.sensitivity}>
      <summary>
        <span>
          اگر زمان وصول یا پرداخت تغییر کند؟
          <small>برآورد سریع حساسیت نقدینگی</small>
        </span>
        <span className={styles.secondary}>شبیه‌سازی</span>
      </summary>
      <div className={styles.sensitivityBody}>
        <div className={styles.simulationHeading}>
          <p>
            اثر فرضی تغییر زمان‌بندی، با میانگین جریان روزانه همین پیش‌بینی
            محاسبه می‌شود. این برآورد، پیش‌بینی هفتگی را تغییر نمی‌دهد.
          </p>
          <div>
            {changed && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDso(0);
                  setDpo(0);
                }}
              >
                <RotateCcw size={14} />
                بازنشانی
              </Button>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link href={`${base}/scenarios`}>
                سناریوسازی کامل
                <ChevronLeft size={14} />
              </Link>
            </Button>
          </div>
        </div>
        <div className={styles.sliders}>
          <div>
            <div className={styles.sliderLabel}>
              <label id="cash-dso-label">زمان وصول مطالبات</label>
              <output>
                {dso === 0
                  ? "بدون تغییر"
                  : `${toPersianDigits(Math.abs(dso))} روز ${dso < 0 ? "زودتر" : "دیرتر"}`}
              </output>
            </div>
            <Slider
              dir="ltr"
              min={-20}
              max={20}
              step={1}
              value={[dso]}
              onValueChange={([value]) => setDso(value ?? 0)}
              aria-labelledby="cash-dso-label"
            />
            <div className={styles.sliderEnds}>
              <span>۲۰ روز زودتر</span>
              <span>۲۰ روز دیرتر</span>
            </div>
          </div>
          <div>
            <div className={styles.sliderLabel}>
              <label id="cash-dpo-label">زمان پرداخت بدهی‌ها</label>
              <output>
                {dpo === 0
                  ? "بدون تغییر"
                  : `${toPersianDigits(Math.abs(dpo))} روز ${dpo < 0 ? "زودتر" : "دیرتر"}`}
              </output>
            </div>
            <Slider
              dir="ltr"
              min={-20}
              max={20}
              step={1}
              value={[dpo]}
              onValueChange={([value]) => setDpo(value ?? 0)}
              aria-labelledby="cash-dpo-label"
            />
            <div className={styles.sliderEnds}>
              <span>۲۰ روز زودتر</span>
              <span>۲۰ روز دیرتر</span>
            </div>
          </div>
        </div>
        <div className={styles.simulationResult} aria-live="polite">
          <div>
            <span>اثر فرضی بر موجودی نقد</span>
            <MoneyDisplay
              amount={impact?.cash}
              executive
              showSign
              direction="auto"
              size="lg"
            />
          </div>
          <div>
            <span>تاب‌آوری برآوردشده</span>
            <strong>
              {impact?.runway != null
                ? `${toPersianDigits(impact.runway)} روز`
                : "قابل محاسبه نیست"}
            </strong>
          </div>
          <p>
            {changed
              ? "سناریوی فرضی فعال است؛ هیچ داده یا تعهدی در شرکت تغییر نکرده است."
              : "برای مقایسه با وضعیت فعلی، زمان وصول یا پرداخت را تغییر دهید."}
          </p>
        </div>
      </div>
    </details>
  );
}

function CashFlowSkeleton() {
  return (
    <div
      className={styles.skeleton}
      role="status"
      aria-label="در حال بارگذاری نقدینگی"
    >
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-[440px] w-full" />
    </div>
  );
}
