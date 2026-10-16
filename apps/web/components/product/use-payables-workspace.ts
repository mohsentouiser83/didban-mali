"use client";

import { useEffect, useState } from "react";
import { Receipt, Clock, Calendar, Users } from "@/components/ui/icons";
import { api } from "@/lib/product-api";
import { rial, toman } from "@/lib/cashflow-amounts";
import type { Company, PayablesSummaryResponse } from "@/lib/product-types";

export function usePayablesWorkspace(company: Company) {
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
  const missingDue = summary?.buckets.find((bucket) => bucket.bucket_key === "due_date_missing")?.amount_irr ?? "0";
  const notDue = summary ? (rial(summary.total_payables_irr) - rial(summary.total_overdue_irr) - rial(missingDue)).toString() : undefined;
  const cards = [
    { title: "کل بدهی‌ها", value: summary ? toman(summary.total_payables_irr) : null, currency: "تومان", icon: Receipt },
    { title: "بدهی‌های سررسیدگذشته", value: summary && rial(missingDue) === BigInt(0) ? toman(summary.total_overdue_irr) : null, currency: "تومان", empty: "سررسید نامشخص", icon: Clock },
    { title: "بدهی‌های سررسیدنرسیده", value: notDue !== undefined ? toman(notDue) : null, currency: "تومان", icon: Calendar },
    { title: "تأمین‌کنندگان طلبکار", value: summary ? String(summary.vendor_count) : null, currency: "تأمین‌کننده", icon: Users },
  ];
  return { summary, cards, loading, failed, refresh: () => setRetry((value) => value + 1) };
}
