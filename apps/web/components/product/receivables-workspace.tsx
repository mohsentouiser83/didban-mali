"use client";

import { useEffect, useState } from "react";
import { Receipt, Clock, Calendar, Users } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/financial/page-header";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/product-api";
import { toman } from "@/lib/cashflow-amounts";
import type { Company, ReceivablesSummaryResponse } from "@/lib/product-types";
import { ReceivablesCustomers } from "./receivables-customers";
import { StatCards } from "./stat-cards";
import styles from "./cashflow-overview.module.css";

export function ReceivablesWorkspace({ company }: { company: Company }) {
  const [data, setData] = useState<{ companyId: string; summary: ReceivablesSummaryResponse } | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setFailed(false);
    setLoading(true);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    api<ReceivablesSummaryResponse>(`/companies/${company.id}/receivables/summary?as_of_date=${today}`)
      .then((summary) => { if (active) setData({ companyId: company.id, summary }); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [company.id, retry]);
  const summary = data?.companyId === company.id ? data.summary : null;
  const notDue = summary?.buckets.find((bucket) => bucket.bucket_key === "not_due")?.amount_irr;
  const cards = [
    { title: "کل مطالبات", value: summary ? toman(summary.total_receivables_irr) : null, currency: "تومان", icon: Receipt },
    { title: "مطالبات سررسیدگذشته", value: summary ? toman(summary.total_overdue_irr) : null, currency: "تومان", icon: Clock },
    { title: "مطالبات سررسیدنرسیده", value: notDue !== undefined ? toman(notDue) : null, currency: "تومان", icon: Calendar },
    { title: "مشتریان بدهکار", value: summary ? String(summary.customer_count) : null, currency: "مشتری", icon: Users },
  ];
  return <div dir="rtl" className={styles.page}>
    <PageHeader title="مطالبات" />
    <section aria-label="آمار مطالبات" aria-busy={loading}>
      {failed ? <div className={styles.error} role="alert"><p>اطلاعات مطالبات دریافت نشد.</p><Button variant="outline" onClick={() => setRetry((value) => value + 1)}>تلاش دوباره</Button></div> : <StatCards key={company.id} items={cards} loading={loading} />}
    </section>
    {summary && <ReceivablesCustomers key={company.id} companyId={company.id} asOfDate={summary.as_of_date} />}
  </div>;
}
