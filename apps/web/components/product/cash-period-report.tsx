"use client";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Wallet, ArrowDownLeft, ArrowUpRight, Calculator } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { MoneyDisplay, toJalaliDate } from "@/components/ui/financial";
import { toman } from "@/lib/cashflow-amounts";
import { useFinancialRange } from "@/lib/financial-periods";
import type { Company } from "@/lib/product-types";
import { FinancialPeriodSelector } from "./financial-period-selector";
import { StatCards } from "./stat-cards";
import { usePeriodReport } from "./use-period-report";
import styles from "./financial-period-selector.module.css";

export function CashPeriodReport({ company }: { company: Company }) {
  const { range, setRange } = useFinancialRange(company.id);
  const { report, error, loading, refresh } = usePeriodReport(company.id, range);
  const cash = report?.cash;
  const [pageSelection, setPageSelection] = useState({ key: "", page: 0 });
  const rangeKey = `${range.start_date}:${range.end_date}`;
  const page = pageSelection.key === rangeKey ? pageSelection.page : 0;
  const pageCount = Math.ceil((cash?.days.length ?? 0) / 20);
  const money = (value: string | null | undefined) => value == null ? null : toman(value);
  const cards = [
    { title: "مانده ابتدای دوره", value: money(cash?.opening_balance_irr), icon: Wallet },
    { title: "دریافت‌های دوره", value: money(cash?.inflows_irr), icon: ArrowDownLeft },
    { title: "پرداخت‌های دوره", value: money(cash?.outflows_irr), icon: ArrowUpRight },
    { title: "مانده پایان دوره", value: money(cash?.closing_balance_irr), icon: Calculator },
  ].map((card) => ({ ...card, currency: "تومان", empty: "اطلاعات کافی نیست" }));
  const points = cash?.days.map((day) => ({ ...day, plot: day.balance_irr === null ? null : Number(day.balance_irr) / 10000000 })) ?? [];
  return <>
    <FinancialPeriodSelector key={company.id} companyId={company.id} range={range} onChange={setRange} canWrite={!!company.role && company.role !== "viewer"} />
    {error ? <div role="alert" className={styles.panel}><p>اطلاعات نقدینگی دریافت نشد. {error}</p><Button variant="outline" onClick={refresh}>تلاش دوباره</Button></div> : <StatCards items={cards} loading={loading} />}
    {cash && <>
      <div className={styles.caption}>{cash.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>
      <section className={styles.panel} aria-label="گردش روزانه نقدینگی">
        <h2>مانده و گردش روزانه</h2>
        {points.some((point) => point.plot !== null) && <div className={styles.chart} aria-label="نمودار مانده روزانه به میلیون تومان">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}><LineChart data={points} accessibilityLayer>
            <CartesianGrid stroke="var(--ds-border)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(value) => toJalaliDate(String(value))} minTickGap={60} />
            <YAxis tickFormatter={(value: number) => new Intl.NumberFormat("fa-IR").format(value)} width={65} />
            <Tooltip labelFormatter={(value) => toJalaliDate(String(value))} formatter={(value) => [`${new Intl.NumberFormat("fa-IR").format(Number(value))} میلیون تومان`, "مانده"]} />
            <Line dataKey="plot" stroke="var(--ds-primary)" dot={false} connectNulls={false} isAnimationActive={false} />
          </LineChart></ResponsiveContainer>
        </div>}
        <div className={styles.scroll}><table className={`${styles.table} ${styles.cashTable}`}><thead><tr><th>تاریخ</th><th>دریافت</th><th>پرداخت</th><th>مانده پایان روز</th></tr></thead><tbody>
          {cash.days.slice(page * 20, (page + 1) * 20).map((day) => <tr key={day.date}><th scope="row">{toJalaliDate(day.date)}</th>{[day.inflows_irr, day.outflows_irr, day.balance_irr].map((amount, index) => <td key={index}>{amount === null || (index < 2 && cash.inflows_irr === null) ? "اطلاعات کافی نیست" : <MoneyDisplay amount={toman(amount)} currency="تومان" size="sm" direction="neutral" />}</td>)}</tr>)}
        </tbody></table></div>
        {pageCount > 1 && <div className={styles.presets} aria-label="صفحه‌بندی گردش روزانه">
          <Button variant="outline" disabled={page === 0} onClick={() => setPageSelection({ key: rangeKey, page: page - 1 })}>روزهای قبل</Button>
          <span className={styles.caption}>صفحه {new Intl.NumberFormat("fa-IR").format(page + 1)} از {new Intl.NumberFormat("fa-IR").format(pageCount)}</span>
          <Button variant="outline" disabled={page >= pageCount - 1} onClick={() => setPageSelection({ key: rangeKey, page: page + 1 })}>روزهای بعد</Button>
        </div>}
      </section>
    </>}
  </>;
}
