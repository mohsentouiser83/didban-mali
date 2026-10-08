"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/product-api";
import type { CompanyReadiness } from "@/lib/product-types";

const steps: Record<string, string> = {
  data: "ورود داده‌ها", analysis: "محاسبه صورت‌های مالی", reconciliation: "تطبیق",
  findings: "بررسی یافته‌ها", review: "رسیدگی انسانی", dashboard: "داشبورد",
  report: "تهیه گزارش", ai: "دستیار مالی",
};
const states = { ready: "آماده", limited: "پوشش محدود", missing: "نیازمند اقدام" };

export function DataReadinessSummary({ companyId, expanded = false }: { companyId: string; expanded?: boolean }) {
  const [readiness, setReadiness] = useState<CompanyReadiness | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    api<CompanyReadiness>(`/companies/${companyId}/readiness`).then((value) => {
      if (active) { setReadiness(value); setError(false); }
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [companyId, retry]);
  if (error) return <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-4 text-sm">
    وضعیت راه‌اندازی دریافت نشد.
    <Button variant="outline" onClick={() => { setError(false); setRetry((value) => value + 1); }}>تلاش دوباره</Button>
  </div>;
  if (!readiness) return <Skeleton className="h-14 rounded-xl" aria-label="در حال بررسی راه‌اندازی" />;
  return <details key={`${companyId}:${expanded}`} open={expanded || undefined} className="rounded-xl border border-border bg-card p-4">
    <summary className="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary">
      آمادگی فرآیندهای مالی · {readiness.completed_steps.toLocaleString("fa-IR")} از {readiness.total_steps.toLocaleString("fa-IR")} گام تکمیل‌شده
    </summary>
    <ol className="mt-4 grid gap-2 sm:grid-cols-2">
      {readiness.journey.map((step) => <li key={step.id}>
        <Link href={step.href} className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-muted/40 p-3 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary">
          <span>{steps[step.id] ?? step.id}<small className="mt-1 block text-xs text-muted-foreground">{step.detail_fa}</small></span>
          <span className="shrink-0 text-xs">{states[step.state]}</span>
        </Link>
      </li>)}
    </ol>
  </details>;
}
