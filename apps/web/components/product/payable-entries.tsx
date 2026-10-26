"use client";
import { DetailSection, DetailGroup, DetailField, fieldIcon } from "@/components/ui/field-layout";
import { LoadingState, EmptyState, ErrorState, MoneyDisplay, toJalaliDate, toPersianDigits } from "@/components/ui/financial";

import { useEffect, useState } from "react";
import { api } from "@/lib/product-api";
import { rial, toman } from "@/lib/cashflow-amounts";
import type { PayableEntriesResponse } from "@/lib/product-types";


import { Skeleton } from "@/components/ui/skeleton";

export function PayableEntries({ companyId, counterpartyId, asOfDate, request = api }: { companyId: string; counterpartyId: string; asOfDate: string; request?: typeof api }) {
  const [data, setData] = useState<PayableEntriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null); setLoading(true); setFailed(false);
    request<PayableEntriesResponse>(`/companies/${companyId}/payables/vendors/${counterpartyId}/entries?as_of_date=${asOfDate}`)
      .then((response) => { if (active) setData(response); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId, counterpartyId, asOfDate, retry, request]);
  if (loading) return <LoadingState variant="details" aria-label="در حال دریافت اسناد" aria-busy="true"><Skeleton className="h-24 w-full" /></LoadingState>;
  if (failed) return <ErrorState onRetry={() => setRetry((value) => value + 1)} variant="compact" ><p>اسناد دریافت نشد.</p></ErrorState>;
  return <div className="grid min-w-0 gap-6">
    {data?.items.length ? data.items.map((entry) => {
      const net = rial(entry.credit_irr) - rial(entry.debit_irr);
      return <DetailSection key={entry.id} title={`سند ${toPersianDigits(entry.entry_number)}`}>
        <DetailGroup><DetailField icon={fieldIcon("نوع گردش")} label="نوع گردش">{net > BigInt(0) ? "افزایش بدهی" : "کاهش بدهی"}</DetailField></DetailGroup>
        {entry.description && <DetailGroup><DetailField icon={fieldIcon("شرح سند")} label="شرح سند">{entry.description}</DetailField></DetailGroup>}
        <DetailGroup><DetailField icon={fieldIcon("مبلغ")} label="مبلغ"><MoneyDisplay amount={toman((net < BigInt(0) ? -net : net).toString())} currency="تومان" direction="neutral" size="sm" /></DetailField>
          <DetailField icon={fieldIcon("تاریخ سند")} label="تاریخ سند">{toJalaliDate(entry.entry_date)}</DetailField>
          {entry.estimated_due_date && <DetailField icon={fieldIcon("سررسید تخمینی")} label="سررسید تخمینی">{toJalaliDate(entry.estimated_due_date)}</DetailField>}
        </DetailGroup>
      </DetailSection>;
    }) : <EmptyState variant="inline">سندی برای این تأمین‌کننده پیدا نشد.</EmptyState>}
  </div>;
}
