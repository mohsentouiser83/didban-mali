"use client";

import { Receipt, Clock, Calendar, Users } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/financial/page-header";
import { MoneyDisplay } from "@/components/ui/financial";
import { Button } from "@/components/ui/button";
import { toman } from "@/lib/cashflow-amounts";
import { useFinancialRange } from "@/lib/financial-periods";
import type { Company } from "@/lib/product-types";
import { ReceivablesCustomers } from "./receivables-customers";
import { StatCards } from "./stat-cards";
import { FinancialPeriodSelector } from "./financial-period-selector";
import { ReceiptHistoryEditor } from "./receipt-history-editor";
import { usePeriodReport } from "./use-period-report";
import styles from "./cashflow-overview.module.css";
import periodStyles from "./financial-period-selector.module.css";

export function ReceivablesWorkspace({ company }: { company: Company }) {
  const { range, setRange } = useFinancialRange(company.id);
  const { report, error, loading, refresh } = usePeriodReport(company.id, range);
  const summary = report?.receivables;
  const money = (value: string | null | undefined) => value == null ? null : toman(value);
  const canWrite = !!company.role && company.role !== "viewer";
  const cards = [
    { title: "مطالبات ابتدای دوره", value: money(summary?.opening_balance_irr), icon: Receipt },
    { title: "فروش دوره", value: money(summary?.sales_irr), icon: Calendar },
    { title: "وصول‌های دوره", value: money(summary?.receipts_irr), icon: Users },
    { title: "مطالبات پایان دوره", value: money(summary?.closing_balance_irr), icon: Clock },
  ].map((card) => ({ ...card, currency: "تومان", empty: "اطلاعات کافی نیست" }));
  return <div dir="rtl" className={styles.page}>
    <PageHeader title="مطالبات" />
    <FinancialPeriodSelector key={`periods:${company.id}`} companyId={company.id} range={range} onChange={setRange} canWrite={canWrite} />
    <section aria-label="آمار مطالبات" aria-busy={loading}>
      {error ? <div className={styles.error} role="alert"><p>اطلاعات مطالبات دریافت نشد. {error}</p><Button variant="outline" onClick={refresh}>تلاش دوباره</Button></div> : <StatCards items={cards} loading={loading} />}
    </section>
    {summary && <>
      <div className={periodStyles.caption} role={summary.history_complete ? undefined : "status"}>{summary.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>
      {summary.buckets.length > 0 && <section className={periodStyles.panel} aria-label="سن مطالبات پایان دوره"><h2>سن مطالبات در پایان دوره</h2><div className={periodStyles.scroll}><table className={periodStyles.table}><thead><tr><th>وضعیت سررسید</th><th>مانده</th><th>تعداد فاکتور</th></tr></thead><tbody>{summary.buckets.map((bucket) => <tr key={bucket.bucket_key}><th scope="row">{bucket.label_fa}</th><td><MoneyDisplay amount={toman(bucket.amount_irr)} currency="تومان" size="sm" direction="neutral" /></td><td>{new Intl.NumberFormat("fa-IR").format(bucket.invoice_count)}</td></tr>)}</tbody></table></div></section>}
      {summary.history_complete && <ReceivablesCustomers key={`${company.id}:${range.end_date}`} companyId={company.id} asOfDate={range.end_date} periodReport={summary} />}
    </>}
    <ReceiptHistoryEditor key={`receipts:${company.id}`} companyId={company.id} canWrite={canWrite} onChanged={refresh} />
  </div>;
}
