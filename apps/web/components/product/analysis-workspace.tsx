"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/product-api";
import type { AnalysisCoverage, AnalysisRun, Company, FinancialAccount, MetricCode, MetricObservation, MetricsResponse } from "@/lib/product-types";

import { Icon } from "./icons";

const moneyLabels: Partial<Record<MetricCode, string>> = {
  revenue_irr: "درآمد",
  expenses_irr: "هزینه‌ها",
  net_profit_irr: "سود خالص",
  total_assets_irr: "دارایی‌ها",
  total_liabilities_irr: "بدهی‌ها",
  total_equity_irr: "حقوق مالکانه",
  net_cash_movement_irr: "خالص حرکت نقد",
  sales_invoiced_irr: "فروش صورتحساب‌شده",
  sales_collected_irr: "وصول‌شده",
  sales_outstanding_irr: "مانده وصول",
};
const coverageLabels: { key: keyof AnalysisCoverage; label: string; description: string }[] = [
  { key: "accounting", label: "حسابداری", description: "آرتیکل‌های طبقه‌بندی‌شده" },
  { key: "bank_cash_flow", label: "جریان نقد بانکی", description: "تراکنش‌های بانکی دوره" },
  { key: "sales", label: "فروش و وصول", description: "صورتحساب‌های فروش دوره" },
  { key: "gross_profit", label: "سود ناخالص", description: "تفکیک بهای تمام‌شده" },
];
const statusLabels: Record<AnalysisRun["status"], string> = { queued: "در صف محاسبه", processing: "در حال محاسبه", completed: "تکمیل‌شده", completed_limited: "تکمیل با پوشش محدود", failed: "ناموفق" };

function monthBounds(value = new Date()) {
  const year = value.getFullYear();
  const month = value.getMonth();
  const pad = (part: number) => String(part).padStart(2, "0");
  return { start: `${year}-${pad(month + 1)}-01`, end: `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}` };
}

function faDate(value: string) {
  return new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "long", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function faDateTime(value: string | null) {
  return value ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
}

function money(value: string | null | undefined) {
  if (value == null) return "—";
  try { return new Intl.NumberFormat("fa-IR").format(BigInt(value)); }
  catch { return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(Number(value)); }
}

export function AnalysisWorkspace({ company }: { company: Company }) {
  const defaults = useMemo(() => monthBounds(), []);
  const [periodStart, setPeriodStart] = useState(defaults.start);
  const [periodEnd, setPeriodEnd] = useState(defaults.end);
  const [unclassifiedCount, setUnclassifiedCount] = useState(0);
  const [run, setRun] = useState<AnalysisRun | null>(null);
  const [metrics, setMetrics] = useState<MetricObservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const canRun = company.role !== "viewer";
  const isRunning = run?.status === "queued" || run?.status === "processing";

  const loadMetrics = useCallback(async (analysisRun: AnalysisRun) => {
    const [result, coverage] = await Promise.all([
      api<MetricsResponse>(`/companies/${company.id}/metrics?analysis_run_id=${analysisRun.id}`),
      api<Record<string, unknown>>(`/companies/${company.id}/analysis-runs/${analysisRun.id}/coverage`),
    ]);
    const sections = { ...coverage };
    delete sections.analysis_run_id;
    delete sections.status;
    setRun({ ...result.analysis_run, coverage: sections as AnalysisCoverage });
    setMetrics(result.metrics);
  }, [company.id]);

  useEffect(() => {
    let ignore = false;
    async function bootstrap() {
      setLoading(true); setError("");
      try {
        const accounts = await api<FinancialAccount[]>(`/companies/${company.id}/accounts/unclassified`);
        if (!ignore) setUnclassifiedCount(accounts.length);
        const savedId = window.localStorage.getItem(`didban:last-analysis:${company.id}`);
        if (savedId) {
          const savedRun = await api<AnalysisRun>(`/companies/${company.id}/analysis-runs/${savedId}`);
          if (ignore) return;
          setRun(savedRun); setPeriodStart(savedRun.period_start); setPeriodEnd(savedRun.period_end);
          if (savedRun.status === "completed" || savedRun.status === "completed_limited") await loadMetrics(savedRun);
          return;
        }
      } catch (caught) {
        if (!ignore) setError(caught instanceof Error ? caught.message : "اطلاعات تحلیل دریافت نشد.");
      } finally { if (!ignore) setLoading(false); }
    }
    void bootstrap();
    return () => { ignore = true; };
  }, [company.id, loadMetrics]);

  useEffect(() => {
    if (!run || !isRunning) return;
    const timer = window.setInterval(async () => {
      try {
        const current = await api<AnalysisRun>(`/companies/${company.id}/analysis-runs/${run.id}`);
        setRun(current);
        if (current.status === "completed" || current.status === "completed_limited") { window.clearInterval(timer); await loadMetrics(current); setSubmitting(false); }
        if (current.status === "failed") { window.clearInterval(timer); setSubmitting(false); setError(current.failure_message ?? "محاسبه مالی ناموفق بود."); }
      } catch (caught) { window.clearInterval(timer); setSubmitting(false); setError(caught instanceof Error ? caught.message : "وضعیت محاسبه دریافت نشد."); }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [company.id, isRunning, loadMetrics, run]);

  function updateStart(value: string) { setPeriodStart(value); setRun(null); setMetrics([]); }
  function updateEnd(value: string) { setPeriodEnd(value); setRun(null); setMetrics([]); }

  async function startAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (periodStart > periodEnd) { setError("ابتدای دوره نباید بعد از انتهای دوره باشد."); return; }
    setSubmitting(true); setMetrics([]);
    try {
      const result = await api<AnalysisRun>(`/companies/${company.id}/analysis-runs`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ period_start: periodStart, period_end: periodEnd, rule_set_version: "financial-metrics-v1" }) });
      setRun(result); window.localStorage.setItem(`didban:last-analysis:${company.id}`, result.id);
    } catch (caught) { setSubmitting(false); setError(caught instanceof Error ? caught.message : "اجرای تحلیل آغاز نشد."); }
  }

  const byCode = new Map(metrics.map((item) => [item.metric_code, item]));
  const profitCodes: MetricCode[] = ["revenue_irr", "expenses_irr", "net_profit_irr"];
  const balanceCodes: MetricCode[] = ["total_assets_irr", "total_liabilities_irr", "total_equity_irr"];
  const optionalCodes: MetricCode[] = ["net_cash_movement_irr", "sales_invoiced_irr", "sales_collected_irr", "sales_outstanding_irr"];
  const margin = byCode.get("net_margin_ratio")?.value_ratio;

  if (loading) return <AnalysisSkeleton />;

  return <div className="analysis-workspace">
    <section className="analysis-intro">
      <div><span className="model-kicker"><Icon name="chart" />محاسبات نسخه‌دار</span><h2>یک دوره انتخاب کنید؛ تصویر مالی همان داده تثبیت می‌شود</h2><p>شاخص‌ها فقط از اسناد نرمال‌شده محاسبه می‌شوند و کمبود هر منبع در کنار نتیجه باقی می‌ماند.</p></div>
      {run ? <div className={`run-state state-${run.status}`}><span className="status-pulse" /><div><small>آخرین اجرا</small><strong>{statusLabels[run.status]}</strong></div></div> : null}
    </section>

    {error ? <p className="form-error global" role="alert">{error}</p> : null}

    <section className="period-panel" aria-labelledby="period-title">
      <div className="period-heading"><span><Icon name="calendar" /></span><div><h3 id="period-title">دورهٔ محاسبه</h3><p>تاریخ‌ها میلادی ثبت می‌شوند؛ نمایش نتایج با تقویم فارسی است.</p></div></div>
      <form onSubmit={(event) => void startAnalysis(event)}>
        <label>از تاریخ<input type="date" dir="ltr" value={periodStart} onChange={(event) => updateStart(event.target.value)} required /></label>
        <span className="period-separator" aria-hidden="true" />
        <label>تا تاریخ<input type="date" dir="ltr" value={periodEnd} onChange={(event) => updateEnd(event.target.value)} required /></label>
        <button className="primary-button" disabled={!canRun || submitting || isRunning}>{isRunning ? <><span className="button-spinner" />در حال محاسبه…</> : <><Icon name="activity" />اجرای تحلیل</>}</button>
      </form>
      {!canRun ? <div className="analysis-advisory"><Icon name="shield" /><p><strong>دسترسی مشاهده‌گر</strong>می‌توانید نتایج موجود را ببینید؛ اجرای دوره جدید به نقش مدیر مالی یا مشاور نیاز دارد.</p></div> : unclassifiedCount ? <div className="analysis-advisory warning"><Icon name="alert" /><p><strong>نتیجه با پوشش محدود تولید می‌شود</strong>{new Intl.NumberFormat("fa-IR").format(unclassifiedCount)} حساب هنوز طبقه‌بندی نشده است. <Link href={`/companies/${company.id}/financial-model`}>تکمیل مدل مالی</Link></p></div> : null}
    </section>

    {isRunning ? <section className="analysis-running" aria-live="polite"><div className="calculation-wave"><i /><i /><i /><i /><i /></div><div><strong>{run?.status === "queued" ? "درخواست در صف محاسبات است" : "شاخص‌های مالی در حال محاسبه‌اند"}</strong><p>داده‌های این اجرا تثبیت شده‌اند؛ نتیجه پس از تکمیل خودکار نمایش داده می‌شود.</p></div></section> : null}

    {metrics.length && run ? <>
      <section className="analysis-result-header"><div><span className="overline">نتیجهٔ دوره</span><h3>{faDate(run.period_start)} تا {faDate(run.period_end)}</h3></div><div><small>نسخه قواعد</small><code dir="ltr">{run.rule_set_version}</code></div></section>
      <div className="analysis-results-grid">
        <section className="profit-statement" aria-labelledby="profit-title"><div className="panel-heading"><div><h3 id="profit-title">عملکرد دوره</h3><p>خلاصه سود و زیان بر پایه آرتیکل‌های طبقه‌بندی‌شده</p></div>{margin ? <span className="margin-chip">حاشیه سود {new Intl.NumberFormat("fa-IR", { style: "percent", maximumFractionDigits: 1 }).format(Number(margin))}</span> : <span className="margin-chip unavailable">حاشیه سود ناموجود</span>}</div><div className="statement-lines">{profitCodes.map((code) => <MetricLine key={code} metric={byCode.get(code)} label={moneyLabels[code] ?? code} emphasized={code === "net_profit_irr"} />)}</div></section>
        <CoveragePanel coverage={run.coverage} />
      </div>

      <section className="balance-panel" aria-labelledby="balance-title"><div className="panel-heading"><div><h3 id="balance-title">وضعیت مالی تا پایان دوره</h3><p>مانده حساب‌ها تا {faDate(run.period_end)}</p></div></div><div className="balance-values">{balanceCodes.map((code) => <div key={code}><span>{moneyLabels[code]}</span><strong dir="ltr">{money(byCode.get(code)?.value_irr)}</strong><small>ریال</small></div>)}</div></section>

      <section className="optional-metrics" aria-labelledby="optional-title"><div className="panel-heading"><div><h3 id="optional-title">نقد و فروش</h3><p>شاخص‌های تکمیلی فقط در صورت وجود منبع مرتبط محاسبه می‌شوند.</p></div></div><div className="optional-list">{optionalCodes.map((code) => <MetricLine key={code} metric={byCode.get(code)} label={moneyLabels[code] ?? code} />)}</div></section>

      <section className="analysis-manifest"><Icon name="shield" /><div><strong>رد محاسبه محفوظ است</strong><p>{new Intl.NumberFormat("fa-IR").format(run.input_manifest.journal_line_count_through_period_end ?? 0)} آرتیکل و {new Intl.NumberFormat("fa-IR").format(run.input_manifest.import_batch_ids?.length ?? 0)} بسته ورودی در snapshot این اجرا ثبت شده است.</p></div><span>تکمیل: {faDateTime(run.completed_at)}</span></section>
    </> : !isRunning ? <section className="analysis-empty"><span><Icon name="chart" /></span><div><h3>هنوز تحلیلی برای این دوره اجرا نشده است</h3><p>بازه را کنترل کنید و «اجرای تحلیل» را بزنید. محاسبات در پس‌زمینه انجام می‌شود و همین صفحه نتیجه را دنبال می‌کند.</p></div></section> : null}
  </div>;
}

function MetricLine({ metric, label, emphasized = false }: { metric?: MetricObservation; label: string; emphasized?: boolean }) {
  return <div className={`metric-line${emphasized ? " emphasized" : ""}`}><div><strong>{label}</strong><small>{metric ? `${new Intl.NumberFormat("fa-IR").format(metric.calculation.line_count ?? metric.calculation.record_count ?? 0)} رکورد در محاسبه` : "منبع کافی در این دوره وجود ندارد"}</small></div><span className={!metric ? "unavailable" : ""}><b dir="ltr">{money(metric?.value_irr)}</b>{metric ? <small>ریال</small> : null}</span></div>;
}

function CoveragePanel({ coverage }: { coverage: AnalysisCoverage }) {
  return <section className="coverage-panel" aria-labelledby="coverage-title"><div className="panel-heading"><div><h3 id="coverage-title">پوشش داده</h3><p>حد اتکای هر بخش از نتیجه</p></div></div><div className="coverage-list">{coverageLabels.map(({ key, label, description }) => { const section = coverage[key]; const score = Math.max(0, Math.min(100, section?.score ?? 0)); return <div key={key}><span className={`coverage-mark${section?.available ? " ready" : ""}`}>{section?.available ? <Icon name="check" /> : <Icon name="alert" />}</span><div><strong>{label}</strong><small>{section?.reasons?.[0] ?? description}</small><div className="coverage-track"><i style={{ width: `${score}%` }} /></div></div><b>{new Intl.NumberFormat("fa-IR").format(score)}٪</b></div>; })}</div></section>;
}

function AnalysisSkeleton() {
  return <div className="analysis-skeleton" aria-label="در حال دریافت تحلیل مالی"><span /><span /><div><span /><span /></div><span /></div>;
}
