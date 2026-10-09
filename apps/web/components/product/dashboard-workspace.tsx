"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/product-api";
import { rial, toman } from "@/lib/cashflow-amounts";
import { dailyCashForecast } from "@/lib/dashboard-cash";
import type { CashFlowForecastResponse, CashFlowSummaryResponse, Company, CustomersReceivablesResponse, PayablesSummaryResponse, ReceivablesSummaryResponse, VendorsPayablesResponse } from "@/lib/product-types";
import { PageHeader, MoneyDisplay, toJalaliDate } from "@/components/ui/financial";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, ArrowUpRight, ArrowDownLeft, Receipt, ChevronLeft, RefreshCcw } from "@/components/ui/icons";
import { StatCards } from "./stat-cards";
import { DashboardCashChart } from "./dashboard-cash-chart";
import type { ReviewItem } from "./review-workspace";
import pageStyles from "./cashflow-overview.module.css";
import styles from "./dashboard-simple.module.css";

type DashboardData = { cash: CashFlowSummaryResponse | null; forecast: CashFlowForecastResponse | null; receivables: ReceivablesSummaryResponse | null; payables: PayablesSummaryResponse | null; customers: CustomersReceivablesResponse | null; vendors: VendorsPayablesResponse | null; findings: ReviewItem[] | null; errors: string[] };
type AttentionItem = { id: string; title: string; detail: string; amount: string | null; href: string };
export function DashboardWorkspace({ company }: { company: Company }) {
  return <DashboardContent key={company.id} company={company} />;
}
function DashboardContent({ company }: { company: Company }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const base = `/companies/${company.id}`;
  useEffect(() => {
    let active = true;
    setLoading(true); setData(null);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    void Promise.allSettled([
      api<CashFlowSummaryResponse>(`${base}/cashflow/summary?as_of_date=${today}`),
      api<CashFlowForecastResponse>(`${base}/cashflow/forecast?horizon_days=30&outflow_mode=planned&scenario=base&as_of_date=${today}`),
      api<ReceivablesSummaryResponse>(`${base}/receivables/summary?as_of_date=${today}`),
      api<PayablesSummaryResponse>(`${base}/payables/summary?as_of_date=${today}`),
      api<CustomersReceivablesResponse>(`${base}/receivables/customers?as_of_date=${today}`),
      api<VendorsPayablesResponse>(`${base}/payables/vendors?as_of_date=${today}`),
      api<{ items: ReviewItem[] }>(`${base}/findings?status=new&limit=5`),
    ]).then(([cash, forecast, receivables, payables, customers, vendors, findings]) => {
      if (!active) return;
      setData({ cash: cash.status === "fulfilled" ? cash.value : null, forecast: forecast.status === "fulfilled" ? forecast.value : null, receivables: receivables.status === "fulfilled" ? receivables.value : null, payables: payables.status === "fulfilled" ? payables.value : null, customers: customers.status === "fulfilled" ? customers.value : null, vendors: vendors.status === "fulfilled" ? vendors.value : null, findings: findings.status === "fulfilled" ? findings.value.items : null,
        errors: [cash, forecast, receivables, payables, customers, vendors, findings].flatMap((result, index) => result.status === "rejected" ? [["مانده حساب", "پیش‌بینی", "مطالبات", "بدهی‌ها", "مشتریان", "تأمین‌کنندگان", "موارد بررسی"][index]] : []) });
      setLoading(false);
    });
    return () => { active = false; };
  }, [base, retry]);
  const accounts = data?.cash?.cash_accounts ?? [];
  const cash = accounts.length === 1 && accounts[0].method === "running_balance" ? accounts[0].balance_irr : null;
  const forecast = data?.forecast;
  const points = forecast && cash !== null ? dailyCashForecast(forecast, cash) : [];
  const hasPayments = forecast?.weeks.some((week) => !!week.payments?.length) ?? false;
  const payments = hasPayments ? forecast?.projected_outflows_30d_irr ?? null : null;
  const cards = [
    { title: "مانده حساب", value: cash !== null ? toman(cash) : null, currency: "تومان", empty: "مانده موجود نیست", icon: Wallet },
    { title: "پرداخت‌های ۳۰ روز آینده", value: payments !== null ? toman(payments) : null, currency: "تومان", empty: forecast ? "ثبت نشده" : "در دسترس نیست", icon: ArrowUpRight },
    { title: "مطالبات سررسیدگذشته", value: data?.receivables ? toman(data.receivables.total_overdue_irr) : null, currency: "تومان", icon: ArrowDownLeft },
    { title: "بدهی‌های سررسیدگذشته", value: data?.payables ? toman(data.payables.total_overdue_irr) : null, currency: "تومان", icon: Receipt },
  ];
  const attention: AttentionItem[] = [];
  const deficit = points.find((point) => isNegative(point.balance));
  if (deficit) attention.push({ id: "deficit", title: "احتمال کسری مانده حساب", detail: toJalaliDate(deficit.date), amount: deficit.balance, href: `${base}/cashflow` });
  const upcoming = forecast?.weeks.flatMap((week) => week.payments ?? []).sort((a, b) => a.due_date.localeCompare(b.due_date)) ?? [];
  for (const payment of upcoming.slice(0, 2)) attention.push({ id: payment.source_id, title: payment.title, detail: `پرداخت در ${toJalaliDate(payment.due_date)}`, amount: toman(payment.amount_irr), href: `${base}/cashflow` });
  const customer = data?.customers?.items.filter((item) => rial(item.overdue_amount_irr) > BigInt(0)).sort((a, b) => compareAmounts(b.overdue_amount_irr, a.overdue_amount_irr))[0];
  if (customer) attention.push({ id: `customer:${customer.counterparty_id}`, title: customer.name, detail: "بیشترین مطالبات سررسیدگذشته", amount: toman(customer.overdue_amount_irr), href: `${base}/receivables` });
  const vendor = data?.vendors?.items.filter((item) => rial(item.overdue_amount_irr) > BigInt(0)).sort((a, b) => compareAmounts(b.overdue_amount_irr, a.overdue_amount_irr))[0];
  if (vendor) attention.push({ id: `vendor:${vendor.counterparty_id}`, title: vendor.name, detail: "بیشترین بدهی سررسیدگذشته · سررسید برآوردی", amount: toman(vendor.overdue_amount_irr), href: `${base}/payables` });
  const finding = data?.findings?.find((item) => item.severity === "critical" || item.severity === "high");
  if (finding) attention.unshift({ id: finding.id, title: finding.title_fa, detail: finding.due_date ? `موعد بررسی ${toJalaliDate(finding.due_date)}` : "نیازمند بررسی", amount: finding.affected_amount_irr !== null ? toman(finding.affected_amount_irr) : null, href: `${base}/findings/${finding.id}` });
  return <div dir="rtl" className={pageStyles.page}>
    <PageHeader title="داشبورد" secondaryActions={<Button variant="outline" disabled={loading} onClick={() => setRetry((value) => value + 1)}><RefreshCcw size={16} aria-hidden="true" />به‌روزرسانی</Button>} />
    {!!data?.errors.length && <div role="alert" className={pageStyles.error}><p>اطلاعات {data.errors.join("، ")} دریافت نشد.</p><Button variant="outline" onClick={() => setRetry((value) => value + 1)}>تلاش دوباره</Button></div>}
    <section aria-label="خلاصه وضعیت مالی"><StatCards items={cards} loading={loading} /></section>
    <section className={styles.section} aria-labelledby="dashboard-chart-title">
      <div className={styles.heading}><div><h2 id="dashboard-chart-title">پیش‌بینی مانده حساب</h2><p>۳۰ روز آینده · مانده پایان هر روز</p></div><Button asChild variant="ghost"><Link href={`${base}/cashflow`}>نقدینگی<ChevronLeft size={16} aria-hidden="true" /></Link></Button></div>
      {loading ? <Skeleton className="h-80 w-full" /> : points.length ? <DashboardCashChart key={`${forecast?.as_of_date}:${retry}`} points={points} hasPayments={hasPayments} /> : <div className={styles.empty}><p>{!forecast ? "پیش‌بینی دریافت نشد." : "برای نمایش نمودار، مانده ثبت‌شده یک حساب بانکی لازم است."}</p><Button asChild variant="outline"><Link href={`${base}/cashflow`}>بررسی نقدینگی</Link></Button></div>}
    </section>
    <section className={styles.section} aria-labelledby="dashboard-attention-title"><div className={styles.heading}><div><h2 id="dashboard-attention-title">موارد نیازمند توجه</h2><p>پرداخت‌های نزدیک و موارد مهم برای پیگیری</p></div></div>
      {loading ? <Skeleton className="h-40 w-full" /> : attention.length ? <ul className={styles.attention}>{attention.slice(0, 5).map((item) => <li key={item.id}><Link href={item.href}><div><strong>{item.title}</strong><span>{item.detail}</span></div><div>{item.amount !== null && <MoneyDisplay amount={item.amount} currency="تومان" size="sm" direction={isNegative(item.amount) ? "negative" : "neutral"} />}<ChevronLeft size={16} aria-hidden="true" /></div></Link></li>)}</ul> : <p className={styles.empty}>{data?.errors.length ? "برای بررسی موارد نیازمند توجه، دریافت اطلاعات را دوباره امتحان کنید." : "در داده‌های ثبت‌شده، موردی برای این فهرست پیدا نشد."}</p>}
    </section>
  </div>;
}
function compareAmounts(a: string, b: string) { const difference = rial(a) - rial(b); return difference > BigInt(0) ? 1 : difference < BigInt(0) ? -1 : 0; }
function isNegative(value: string) { return value.startsWith("-"); }
