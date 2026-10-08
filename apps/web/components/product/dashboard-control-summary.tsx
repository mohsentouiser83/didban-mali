"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/product-api";
import type { ControlOverview, FindingDetectionRun } from "@/lib/product-types";

export function DashboardControlSummary({ companyId }: { companyId: string }) {
  const [overview, setOverview] = useState<ControlOverview | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState("");
  const [runError, setRunError] = useState("");
  async function runDetection() {
    if (running) return;
    setRunning(true);
    setRunMessage("");
    setRunError("");
    try {
      const result = await api<FindingDetectionRun>(`/companies/${companyId}/findings/detect`, {
        method: "POST", body: JSON.stringify({ trigger_type: "manual" }),
      });
      setRunMessage(`پایش انجام شد؛ ${result.findings_detected.toLocaleString("fa-IR")} مورد ارزیابی شد.`);
      setRetry((value) => value + 1);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "اجرای پایش انجام نشد. دوباره تلاش کنید.");
    } finally { setRunning(false); }
  }
  useEffect(() => {
    let active = true;
    api<ControlOverview>(`/companies/${companyId}/control/overview`).then((value) => {
      if (active) { setOverview(value); setError(false); }
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [companyId, retry]);
  const base = `/companies/${companyId}`;
  return <section aria-label="خلاصه کنترل مالی" className="rounded-xl border border-border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm">
        <h2 className="font-bold">کنترل مالی</h2>
        {error ? <p role="alert">خلاصه کنترل مالی دریافت نشد.</p> : overview ?
          <p className="mt-1 text-muted-foreground">{(overview.critical_count + overview.high_count).toLocaleString("fa-IR")} مورد فوری · {overview.total_active_count.toLocaleString("fa-IR")} یافته باز · {(overview.resolved_count + overview.verified_count).toLocaleString("fa-IR")} مورد رسیدگی‌شده</p>
          : <p role="status" className="mt-1 text-muted-foreground">در حال دریافت وضعیت رسیدگی…</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {error && <Button variant="outline" onClick={() => { setError(false); setRetry((value) => value + 1); }}>تلاش دوباره</Button>}
        <Button disabled={running} aria-busy={running} onClick={() => void runDetection()}>{running ? "در حال پایش…" : "اجرای پایش"}</Button>
        <Button asChild variant="outline"><Link href={`${base}/actions`}>کارهای من</Link></Button>
        <Button asChild variant="outline"><Link href={`${base}/findings`}>بررسی و پایش یافته‌ها</Link></Button>
      </div>
    </div>
    {runMessage && <p role="status" className="mt-3 text-sm">{runMessage}</p>}
    {runError && <p role="alert" className="mt-3 text-sm text-ds-danger">{runError}</p>}
    {(!!overview?.recent_activities.length || overview?.latest_reconciliation) && <details className="mt-3 border-t border-border pt-3 text-sm">
      <summary className="cursor-pointer focus-visible:outline-2 focus-visible:outline-primary">آخرین رسیدگی و وضعیت تطبیق</summary>
      {overview.latest_reconciliation && <Link className="mt-2 block min-h-11 rounded-lg p-2 hover:bg-muted" href={`${base}/reconciliation`}>
        {(overview.latest_reconciliation.unmatched_bank_count + overview.latest_reconciliation.unmatched_journal_count).toLocaleString("fa-IR")} مورد تطبیق‌نیافته · بررسی تطبیق
      </Link>}
      <ul className="mt-2 space-y-2">{overview.recent_activities.slice(0, 3).map((activity) =>
        <li key={activity.id}><Link href={`${base}/findings/${activity.finding_id}`} className="block min-h-11 rounded-lg p-2 hover:bg-muted">
          {activity.finding_title}<small className="block text-muted-foreground">{activity.user_name}{activity.note ? ` · ${activity.note}` : ""}</small>
        </Link></li>)}</ul>
    </details>}
  </section>;
}
