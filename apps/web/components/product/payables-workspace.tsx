"use client";

import { useEffect, useState } from "react";
import { Receipt, Clock, Calendar, Users } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/financial/page-header";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/product-api";
import { rial, toman } from "@/lib/cashflow-amounts";
import type { Company, PayablesSummaryResponse } from "@/lib/product-types";
import { PayablesVendors } from "./payables-vendors";
import { StatCards } from "./stat-cards";
import styles from "./cashflow-overview.module.css";

export function PayablesWorkspace({ company }: { company: Company }) {
  const [data, setData] = useState<{ companyId: string; summary: PayablesSummaryResponse } | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setFailed(false);
    setLoading(true);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    api<PayablesSummaryResponse>(`/companies/${company.id}/payables/summary?as_of_date=${today}`)
      .then((summary) => { if (active) setData({ companyId: company.id, summary }); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [company.id, retry]);
  const summary = data?.companyId === company.id ? data.summary : null;
  const notDue = summary ? (rial(summary.total_payables_irr) - rial(summary.total_overdue_irr)).toString() : undefined;
  const cards = [
    { title: "کل بدهی‌ها", value: summary ? toman(summary.total_payables_irr) : null, currency: "تومان", icon: Receipt },
    { title: "بدهی‌های سررسیدگذشته", value: summary ? toman(summary.total_overdue_irr) : null, currency: "تومان", icon: Clock },
    { title: "بدهی‌های سررسیدنرسیده", value: notDue !== undefined ? toman(notDue) : null, currency: "تومان", icon: Calendar },
    { title: "تأمین‌کنندگان طلبکار", value: summary ? String(summary.vendor_count) : null, currency: "تأمین‌کننده", icon: Users },
  ];
  return <div dir="rtl" className={styles.page}>
    <div><PageHeader title="بدهی‌ها" /><p className={styles.period}>سررسیدها برآوردی‌اند؛ ۴۵ روز پس از تاریخ سند حسابداری.</p></div>
    <section aria-label="آمار بدهی‌ها" aria-busy={loading}>
      {failed ? <div className={styles.error} role="alert"><p>اطلاعات بدهی‌ها دریافت نشد.</p><Button variant="outline" onClick={() => setRetry((value) => value + 1)}>تلاش دوباره</Button></div> : <StatCards key={company.id} items={cards} loading={loading} />}
    </section>
    {summary && <PayablesVendors key={company.id} companyId={company.id} asOfDate={summary.as_of_date} />}
  </div>;
}
