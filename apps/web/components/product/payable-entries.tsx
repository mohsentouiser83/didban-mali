"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/product-api";
import { rial, toman } from "@/lib/cashflow-amounts";
import type { PayableEntriesResponse } from "@/lib/product-types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay, toJalaliDate, toPersianDigits } from "@/components/ui/financial";
import styles from "./receivables-customers.module.css";

export function PayableEntries({ companyId, counterpartyId, asOfDate }: { companyId: string; counterpartyId: string; asOfDate: string }) {
  const [data, setData] = useState<PayableEntriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null); setLoading(true); setFailed(false);
    api<PayableEntriesResponse>(`/companies/${companyId}/payables/vendors/${counterpartyId}/entries?as_of_date=${asOfDate}`)
      .then((response) => { if (active) setData(response); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId, counterpartyId, asOfDate, retry]);
  if (loading) return <div aria-label="در حال دریافت اسناد" aria-busy="true"><Skeleton className="h-24 w-full" /></div>;
  if (failed) return <div role="alert" className={styles.empty}><p>اسناد دریافت نشد.</p><Button variant="outline" onClick={() => setRetry((value) => value + 1)}>تلاش دوباره</Button></div>;
  return <div className={styles.invoices}>
    <p className="text-xs text-muted-foreground leading-7">این‌ها گردش اسناد حسابداری‌اند. سررسید تخمینی ۴۵ روز پس از تاریخ سند است؛ پرداخت‌ها هنوز به سند بدهی مشخصی متصل نشده‌اند.</p>
    {data?.items.length ? data.items.map((entry) => {
      const net = rial(entry.credit_irr) - rial(entry.debit_irr);
      return <article key={entry.id} className={styles.invoice}>
        <div className={styles.invoiceHeading}><h3>سند {toPersianDigits(entry.entry_number)}</h3><span>{net > BigInt(0) ? "افزایش بدهی" : "کاهش بدهی"}</span></div>
        {entry.description && <p className="text-xs text-muted-foreground leading-7 mt-2">{entry.description}</p>}
        <dl><div><dt>مبلغ</dt><dd><MoneyDisplay amount={toman((net < BigInt(0) ? -net : net).toString())} currency="تومان" direction="neutral" size="sm" /></dd></div>
          <div><dt>تاریخ سند</dt><dd>{toJalaliDate(entry.entry_date)}</dd></div>
          {entry.estimated_due_date && <div><dt>سررسید تخمینی</dt><dd>{toJalaliDate(entry.estimated_due_date)}</dd></div>}
        </dl>
      </article>;
    }) : <p className={styles.empty}>سندی برای این تأمین‌کننده پیدا نشد.</p>}
  </div>;
}
