"use client";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "./product-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

const statusLabels: Record<AnalysisRun["status"], string> = {
  queued: "در صف محاسبه",
  processing: "در حال محاسبه",
  completed: "تکمیل‌شده",
  completed_limited: "تکمیل با پوشش محدود",
  failed: "ناموفق",
};

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
        const recentRuns = await api<AnalysisRun[]>(`/companies/${company.id}/analysis-runs?limit=20`);
        const savedId = window.localStorage.getItem(`didban:last-analysis:${company.id}`);
        const savedRun = recentRuns.find((item) => item.id === savedId) ?? recentRuns.find((item) => item.status === "completed" || item.status === "completed_limited");
        if (savedRun) {
          if (ignore) return;
          setRun(savedRun); setPeriodStart(savedRun.period_start); setPeriodEnd(savedRun.period_end);
          window.localStorage.setItem(`didban:last-analysis:${company.id}`, savedRun.id);
          if (savedRun.status === "completed" || savedRun.status === "completed_limited") await loadMetrics(savedRun);
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

  return (
    <div className="analysis-workspace space-y-6">
      <section className="analysis-intro flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <span className="model-kicker inline-flex items-center gap-1.5 text-xs font-bold text-primary mb-1">
            <Icon name="chart" className="size-3.5" />
            محاسبات نسخه‌دار
          </span>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
            یک دوره انتخاب کنید؛ تصویر مالی همان داده تثبیت می‌شود
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-2xl leading-relaxed">
            شاخص‌ها فقط از اسناد نرمال‌شده محاسبه می‌شوند و کمبود هر منبع در کنار نتیجه باقی می‌ماند.
          </p>
        </div>

        {run && (
          <div className="run-state flex items-center gap-2.5 p-2.5 rounded-xl border border-border/80 bg-card shrink-0">
            <span className="size-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <div className="text-start">
              <small className="block text-[10px] text-muted-foreground">آخرین اجرا</small>
              <strong className="block text-xs font-bold text-foreground">{statusLabels[run.status]}</strong>
            </div>
          </div>
        )}
      </section>

      {error && (
        <Alert variant="destructive" className="form-error text-xs p-3.5 rounded-xl" role="alert">
          {error}
        </Alert>
      )}

      {/* Period Selection */}
      <ProductCard className="period-panel p-6 rounded-2xl border border-border bg-card space-y-4" aria-labelledby="period-title">
        <div className="period-heading flex items-center gap-3 border-b border-border/60 pb-3">
          <span className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Icon name="calendar" className="size-4" />
          </span>
          <div>
            <h3 id="period-title" className="text-base font-bold text-foreground">دورهٔ محاسبه</h3>
            <p className="text-xs text-muted-foreground">تاریخ‌ها میلادی ثبت می‌شوند؛ نمایش نتایج با تقویم فارسی است.</p>
          </div>
        </div>

        <form onSubmit={(event) => void startAnalysis(event)} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto] items-end gap-3">
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-foreground">از تاریخ</label>
            <Input
              type="date"
              dir="ltr"
              value={periodStart}
              onChange={(event) => updateStart(event.target.value)}
              required
              className="h-10 text-xs bg-background text-end"
            />
          </div>

          <span className="period-separator hidden sm:block text-muted-foreground pb-2.5" aria-hidden="true">
            تا
          </span>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-foreground">تا تاریخ</label>
            <Input
              type="date"
              dir="ltr"
              value={periodEnd}
              onChange={(event) => updateEnd(event.target.value)}
              required
              className="h-10 text-xs bg-background text-end"
            />
          </div>

          <Button
            type="submit"
            className="primary-button h-10 text-xs font-bold gap-2 px-6"
            disabled={!canRun || submitting || isRunning}
          >
            {isRunning ? (
              <>
                <span className="loading-ring size-3.5" />
                در حال محاسبه…
              </>
            ) : (
              <>
                <Icon name="activity" className="size-3.5" />
                اجرای تحلیل
              </>
            )}
          </Button>
        </form>

        {!canRun ? (
          <div className="analysis-advisory flex items-center gap-2 p-3 rounded-xl bg-muted text-xs text-muted-foreground">
            <Icon name="shield" className="size-4 text-primary shrink-0" />
            <p>
              <strong className="font-bold text-foreground">دسترسی مشاهده‌گر: </strong>
              می‌توانید نتایج موجود را ببینید؛ اجرای دوره جدید به نقش مدیر مالی یا مشاور نیاز دارد.
            </p>
          </div>
        ) : unclassifiedCount ? (
          <div className="analysis-advisory warning flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300">
            <Icon name="alert" className="size-4 text-amber-600 shrink-0" />
            <p>
              <strong className="font-bold">نتیجه با پوشش محدود تولید می‌شود: </strong>
              {new Intl.NumberFormat("fa-IR").format(unclassifiedCount)} حساب هنوز طبقه‌بندی نشده است.{" "}
              <Link href={`/companies/${company.id}/financial-model`} className="underline font-bold">
                تکمیل مدل مالی
              </Link>
            </p>
          </div>
        ) : null}
      </ProductCard>

      {/* Running State */}
      {isRunning && (
        <section className="analysis-running p-6 rounded-2xl border border-primary/20 bg-primary/5 text-center flex flex-col items-center justify-center space-y-2" aria-live="polite">
          <span className="loading-ring size-6 text-primary" />
          <strong className="block text-sm font-bold text-foreground">
            {run?.status === "queued" ? "درخواست در صف محاسبات است" : "شاخص‌های مالی در حال محاسبه‌اند"}
          </strong>
          <p className="text-xs text-muted-foreground">
            داده‌های این اجرا تثبیت شده‌اند؛ نتیجه پس از تکمیل خودکار نمایش داده می‌شود.
          </p>
        </section>
      )}

      {/* Results */}
      {metrics.length && run ? (
        <div className="space-y-6">
          <ProductCard className="analysis-result-header p-4 sm:p-5 rounded-2xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="overline block text-[11px] font-bold text-primary">نتیجهٔ دوره</span>
              <h3 className="text-base sm:text-lg font-bold text-foreground">
                {faDate(run.period_start)} تا {faDate(run.period_end)}
              </h3>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>نسخه قواعد:</span>
              <code dir="ltr" className="px-2 py-1 rounded bg-muted font-mono font-bold text-foreground">
                {run.rule_set_version}
              </code>
            </div>
          </ProductCard>

          <div className="analysis-results-grid grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-6">
            <ProductCard className="profit-statement p-6 rounded-2xl border border-border bg-card space-y-4" aria-labelledby="profit-title">
              <div className="panel-heading flex items-center justify-between border-b border-border/60 pb-3">
                <div>
                  <h3 id="profit-title" className="text-base font-bold text-foreground">عملکرد دوره</h3>
                  <p className="text-xs text-muted-foreground">خلاصه سود و زیان بر پایه آرتیکل‌های طبقه‌بندی‌شده</p>
                </div>
                {margin ? (
                  <Badge variant="secondary" className="margin-chip text-xs">
                    حاشیه سود {new Intl.NumberFormat("fa-IR", { style: "percent", maximumFractionDigits: 1 }).format(Number(margin))}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="margin-chip unavailable text-xs text-muted-foreground">
                    حاشیه سود ناموجود
                  </Badge>
                )}
              </div>

              <div className="statement-lines divide-y divide-border/60">
                {profitCodes.map((code) => (
                  <MetricLine
                    key={code}
                    metric={byCode.get(code)}
                    label={moneyLabels[code] ?? code}
                    emphasized={code === "net_profit_irr"}
                  />
                ))}
              </div>
            </ProductCard>

            <CoveragePanel coverage={run.coverage} />
          </div>

          <ProductCard className="balance-panel p-6 rounded-2xl border border-border bg-card space-y-4" aria-labelledby="balance-title">
            <div className="panel-heading border-b border-border/60 pb-3">
              <h3 id="balance-title" className="text-base font-bold text-foreground">وضعیت مالی تا پایان دوره</h3>
              <p className="text-xs text-muted-foreground">مانده حساب‌ها تا {faDate(run.period_end)}</p>
            </div>
            <div className="balance-values grid grid-cols-1 sm:grid-cols-3 gap-4">
              {balanceCodes.map((code) => (
                <div key={code} className="p-4 rounded-xl bg-muted/20 border border-border/60 space-y-1">
                  <span className="block text-xs text-muted-foreground">{moneyLabels[code]}</span>
                  <strong dir="ltr" className="block text-base sm:text-lg font-bold font-mono text-foreground">
                    {money(byCode.get(code)?.value_irr)}
                  </strong>
                  <small className="block text-[10px] text-muted-foreground">ریال</small>
                </div>
              ))}
            </div>
          </ProductCard>

          <ProductCard className="optional-metrics p-6 rounded-2xl border border-border bg-card space-y-4" aria-labelledby="optional-title">
            <div className="panel-heading border-b border-border/60 pb-3">
              <h3 id="optional-title" className="text-base font-bold text-foreground">نقد و فروش</h3>
              <p className="text-xs text-muted-foreground">شاخص‌های تکمیلی فقط در صورت وجود منبع مرتبط محاسبه می‌شوند.</p>
            </div>
            <div className="optional-list divide-y divide-border/60">
              {optionalCodes.map((code) => (
                <MetricLine key={code} metric={byCode.get(code)} label={moneyLabels[code] ?? code} />
              ))}
            </div>
          </ProductCard>

          <ProductCard className="analysis-manifest p-4 rounded-xl bg-muted/30 border border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2.5">
              <Icon name="shield" className="size-4 text-primary shrink-0" />
              <div>
                <strong className="text-foreground">رد محاسبه محفوظ است: </strong>
                <span>
                  {new Intl.NumberFormat("fa-IR").format(run.input_manifest.journal_line_count_through_period_end ?? 0)} آرتیکل و{" "}
                  {new Intl.NumberFormat("fa-IR").format(run.input_manifest.import_batch_ids?.length ?? 0)} بسته ورودی در snapshot این اجرا ثبت شده است.
                </span>
              </div>
            </div>
            <span className="font-mono text-[11px] shrink-0">تکمیل: {faDateTime(run.completed_at)}</span>
          </ProductCard>
        </div>
      ) : !isRunning ? (
        <section className="analysis-empty py-12 text-center text-xs text-muted-foreground flex flex-col items-center justify-center space-y-2">
          <span className="size-12 rounded-2xl bg-muted flex items-center justify-center mb-1">
            <Icon name="chart" className="size-6 text-muted-foreground/60" />
          </span>
          <h3 className="text-sm font-bold text-foreground">هنوز تحلیلی برای این دوره اجرا نشده است</h3>
          <p className="max-w-md leading-relaxed">
            بازه را کنترل کنید و «اجرای تحلیل» را بزنید. محاسبات در پس‌زمینه انجام می‌شود و همین صفحه نتیجه را دنبال می‌کند.
          </p>
        </section>
      ) : null}
    </div>
  );
}

function MetricLine({
  metric,
  label,
  emphasized = false,
}: {
  metric?: MetricObservation;
  label: string;
  emphasized?: boolean;
}) {
  return (
    <div
      className={`metric-line flex items-center justify-between gap-3 py-3 ${
        emphasized ? "emphasized bg-primary/5 px-3 rounded-xl font-bold" : ""
      }`}
    >
      <div>
        <strong className="block text-xs font-bold text-foreground">{label}</strong>
        <small className="block text-[11px] text-muted-foreground">
          {metric
            ? `${new Intl.NumberFormat("fa-IR").format(
                metric.calculation.line_count ?? metric.calculation.record_count ?? 0
              )} رکورد در محاسبه`
            : "منبع کافی در این دوره وجود ندارد"}
        </small>
      </div>

      <div className="text-end">
        <b dir="ltr" className="block text-sm font-mono font-bold text-foreground">
          {money(metric?.value_irr)}
        </b>
        {metric && <small className="text-[10px] text-muted-foreground">ریال</small>}
      </div>
    </div>
  );
}

function CoveragePanel({ coverage }: { coverage: AnalysisCoverage }) {
  return (
    <ProductCard className="coverage-panel p-6 rounded-2xl border border-border bg-card space-y-4" aria-labelledby="coverage-title">
      <div className="panel-heading border-b border-border/60 pb-3">
        <h3 id="coverage-title" className="text-base font-bold text-foreground">پوشش داده</h3>
        <p className="text-xs text-muted-foreground">حد اتکای هر بخش از نتیجه</p>
      </div>

      <div className="coverage-list space-y-3">
        {coverageLabels.map(({ key, label, description }) => {
          const section = coverage[key];
          const score = Math.max(0, Math.min(100, section?.score ?? 0));
          return (
            <div key={key} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-muted/20 border border-border/60">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`coverage-mark size-7 rounded-lg flex items-center justify-center shrink-0 ${
                    section?.available ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
                  }`}
                >
                  <Icon name={section?.available ? "check" : "alert"} className="size-3.5" />
                </span>
                <div className="min-w-0">
                  <strong className="block text-xs font-bold text-foreground">{label}</strong>
                  <small className="block text-[11px] text-muted-foreground truncate">
                    {section?.reasons?.[0] ?? description}
                  </small>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <Progress className="w-16 h-1.5" value={score} />
                <b className="text-xs font-mono text-foreground">{new Intl.NumberFormat("fa-IR").format(score)}٪</b>
              </div>
            </div>
          );
        })}
      </div>
    </ProductCard>
  );
}

function AnalysisSkeleton() {
  return (
    <div className="analysis-skeleton space-y-4" aria-label="در حال دریافت تحلیل مالی">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-44 w-full rounded-2xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
      <Skeleton className="h-36 w-full rounded-2xl" />
    </div>
  );
}
