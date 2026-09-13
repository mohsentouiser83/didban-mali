"use client";

import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/product-api";
import type { AnalysisRun, Company, DashboardMetric, DashboardResponse, PriorityBand } from "@/lib/product-types";

import { Icon, type ProductIconName } from "./icons";

const mainMetricCodes = ["revenue_irr", "net_profit_irr", "net_cash_movement_irr", "sales_outstanding_irr", "payables_irr", "net_margin_ratio"];
const secondaryMetricCodes = ["expenses_irr", "total_assets_irr", "total_liabilities_irr", "total_equity_irr", "sales_invoiced_irr", "sales_collected_irr"];
const metricIcons: Record<string, ProductIconName> = {
  revenue_irr: "chart", net_profit_irr: "activity", net_cash_movement_irr: "bank", sales_outstanding_irr: "reconcile", payables_irr: "file", net_margin_ratio: "target",
};
const metricFallbackLabels: Record<string, string> = {
  revenue_irr: "درآمد", net_profit_irr: "سود خالص", net_cash_movement_irr: "خالص حرکت نقد", sales_outstanding_irr: "مانده وصول", payables_irr: "بدهی‌های پرداختنی", net_margin_ratio: "حاشیه سود خالص",
  expenses_irr: "هزینه‌ها", total_assets_irr: "دارایی‌ها", total_liabilities_irr: "بدهی‌ها", total_equity_irr: "حقوق مالکانه", sales_invoiced_irr: "فروش صورتحساب‌شده", sales_collected_irr: "مبلغ وصول‌شده",
};
const healthLabels = { critical_attention: "اقدام فوری", attention: "نیازمند توجه", monitor: "نیازمند پایش", stable: "پایدار", limited_visibility: "دید محدود", analysis_incomplete: "تحلیل ناتمام" } as const;
const bandLabels: Record<PriorityBand, string> = { critical: "بحرانی", high: "بالا", medium: "متوسط", low: "پایین" };
const workflowLabels = { needs_review: "نیازمند بررسی", confirmed: "تأییدشده", dismissed: "ردشده", follow_up: "در پیگیری", resolved: "حل‌شده" } as const;
const trendLabels = { up: "افزایش", down: "کاهش", flat: "بدون تغییر", unavailable: "بدون دوره مقایسه" } as const;
const coverageSections = [
  { key: "accounting", label: "حسابداری", hint: "طبقه‌بندی اسناد" },
  { key: "bank_cash_flow", label: "جریان نقد بانکی", hint: "تراکنش‌های بانکی" },
  { key: "sales", label: "فروش و وصول", hint: "صورتحساب‌های فروش" },
  { key: "gross_profit", label: "سود ناخالص", hint: "بهای تمام‌شده" },
];

function faDate(value: string) {
  return new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "long", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}
function faDateTime(value: string) { return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function faNumber(value: number, digits = 0) { return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: digits }).format(value); }
function fullMoney(value: string) { try { return new Intl.NumberFormat("fa-IR").format(BigInt(value)); } catch { return faNumber(Number(value)); } }
function compactMoney(value: string) {
  const amount = Number(value);
  const absolute = Math.abs(amount);
  const sign = amount < 0 ? "منفی " : "";
  if (absolute >= 1_000_000_000) return `${sign}${faNumber(absolute / 1_000_000_000, 1)} میلیارد ریال`;
  if (absolute >= 1_000_000) return `${sign}${faNumber(absolute / 1_000_000, 1)} میلیون ریال`;
  return `${sign}${fullMoney(String(absolute))} ریال`;
}
function metricValue(metric: DashboardMetric) {
  if (!metric.available || metric.value == null) return "قابل محاسبه نیست";
  return metric.unit === "ratio" ? new Intl.NumberFormat("fa-IR", { style: "percent", maximumFractionDigits: 1 }).format(Number(metric.value)) : compactMoney(metric.value);
}
function exactMetricValue(metric: DashboardMetric) {
  if (!metric.available || metric.value == null) return undefined;
  return metric.unit === "ratio" ? metricValue(metric) : `${fullMoney(metric.value)} ریال`;
}

export function DashboardWorkspace({ company }: { company: Company }) {
  const [analyses, setAnalyses] = useState<AnalysisRun[]>([]);
  const [analysisId, setAnalysisId] = useState("");
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async (selectedId?: string) => {
    const query = new URLSearchParams({ top_limit: "5" });
    if (selectedId) query.set("analysis_run_id", selectedId);
    return api<DashboardResponse>(`/companies/${company.id}/dashboard?${query.toString()}`);
  }, [company.id]);

  useEffect(() => {
    let ignore = false;
    async function bootstrap() {
      setLoading(true); setError("");
      const [runsResult, dashboardResult] = await Promise.allSettled([
        api<AnalysisRun[]>(`/companies/${company.id}/analysis-runs?limit=30`),
        loadDashboard(),
      ]);
      if (ignore) return;
      if (runsResult.status === "fulfilled") setAnalyses(runsResult.value.filter((item) => item.status === "completed" || item.status === "completed_limited"));
      if (dashboardResult.status === "fulfilled") { setDashboard(dashboardResult.value); setAnalysisId(dashboardResult.value.snapshot.analysis_run_id); }
      else setError(dashboardResult.reason instanceof Error ? dashboardResult.reason.message : "داشبورد مالی هنوز آماده نیست.");
      setLoading(false);
    }
    void bootstrap();
    return () => { ignore = true; };
  }, [company.id, loadDashboard]);

  async function changeSnapshot(value: string) {
    setAnalysisId(value); setSwitching(true); setError("");
    try { setDashboard(await loadDashboard(value)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "snapshot داشبورد دریافت نشد."); }
    finally { setSwitching(false); }
  }

  const metrics = useMemo(() => new Map(dashboard?.metrics.map((item) => [item.metric_code, item]) ?? []), [dashboard]);

  if (loading) return <DashboardSkeleton />;
  if (!dashboard) return <section className="dashboard-error"><span><Icon name="chart" /></span><div><h2>هنوز تصویری برای داشبورد نداریم</h2><p>{error || "برای ساخت این تصویر، ابتدا یک تحلیل مالی تکمیل‌شده لازم است."}</p></div><Link className="primary-button" href={`/companies/${company.id}/analysis`}>رفتن به تحلیل مالی</Link></section>;

  const { snapshot, health, coverage, finding_summary: findingSummary } = dashboard;

  return <div className={`dashboard-workspace${switching ? " is-switching" : ""}`}>
    <section className="dashboard-intro">
      <div><span className="model-kicker"><Icon name="home" />مرکز تصمیم مالی</span><h2>وضعیت مالی قابل اتکا، با محدودیت‌های روشن</h2><p>عددها، یافته‌های مهم و کیفیت داده در یک snapshot ثابت کنار هم دیده می‌شوند؛ بدون پنهان‌کردن نقاط کور.</p></div>
      <label className="dashboard-period"><span>دوره گزارش</span><NativeSelect value={analysisId} onChange={(event) => void changeSnapshot(event.target.value)} disabled={switching}>{analyses.map((item) => <NativeSelectOption key={item.id} value={item.id}>{faDate(item.period_start)} تا {faDate(item.period_end)}</NativeSelectOption>)}</NativeSelect><small>آخرین تکمیل: {faDateTime(snapshot.completed_at)}</small></label>
    </section>

    {error ? <p className="form-error global" role="alert">{error}</p> : null}

    <section className={`dashboard-health health-${health.overall_state}`} aria-labelledby="dashboard-health-title">
      <div className="health-main"><span className="health-state-icon"><Icon name={health.overall_state === "stable" ? "check" : "activity"} /></span><div><small>جمع‌بندی این دوره</small><h3 id="dashboard-health-title">{health.summary_fa}</h3>{health.reasons_fa.length ? <ul>{health.reasons_fa.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}</div></div>
      <div className="health-axes"><div className="health-axis"><span>وضعیت مالی</span><strong>{healthLabels[health.financial_state]}</strong><small>بر پایه شاخص‌ها و یافته‌های باز</small></div><div className="health-axis"><span>کیفیت داده</span><strong>{health.data_quality === "complete" ? "پوشش کامل" : "پوشش محدود"}</strong><small>مستقل از نتیجه مالی</small></div><div className="coverage-score"><span>اتکاپذیری snapshot</span><strong>{faNumber(coverage.overall_score)}<small>٪</small></strong><div><i style={{ width: `${coverage.overall_score}%` }} /></div></div></div>
    </section>

    <section className="dashboard-metrics" aria-labelledby="dashboard-metrics-title"><div className="dashboard-section-heading"><div><span>شاخص‌های اصلی</span><h3 id="dashboard-metrics-title">نبض مالی دوره</h3></div><small>مقایسه فقط در صورت وجود دوره مبنا نمایش داده می‌شود.</small></div><div className="metric-ledger">{mainMetricCodes.map((code) => <DashboardMetricCell key={code} code={code} metric={metrics.get(code)} />)}</div></section>

    <div className="dashboard-main-grid">
      <section className="dashboard-findings" aria-labelledby="dashboard-findings-title"><div className="dashboard-section-heading"><div><span>صف بررسی</span><h3 id="dashboard-findings-title">یافته‌های مهم</h3></div><Link href={`/companies/${company.id}/findings`}>مشاهده همه یافته‌ها <Icon name="chevron" /></Link></div><div className="finding-summary-bar">{(["critical", "high", "medium", "low"] as PriorityBand[]).map((band) => <div key={band}><span><i className={`band-${band}`} />{bandLabels[band]}</span><strong>{faNumber(findingSummary.by_priority[band] ?? 0)}</strong></div>)}</div>{dashboard.top_findings.length ? <div className="dashboard-finding-list">{dashboard.top_findings.map((finding) => <Link key={finding.id} className="dashboard-finding-row" href={`/companies/${company.id}/findings/${finding.id}`}><span className={`priority-band band-${finding.priority_band}`}>{bandLabels[finding.priority_band]}</span><span className="dashboard-finding-score"><b>{faNumber(Number(finding.priority_score))}</b><small>از ۱۰۰</small></span><span><strong>{finding.title_fa}</strong><small>{finding.summary_fa}</small><i>{workflowLabels[finding.workflow_status]}</i></span><Icon name="chevron" /></Link>)}</div> : <div className="dashboard-empty"><Icon name="check" /><div><strong>یافته بازی برای نمایش نیست</strong><p>موتور در محدوده داده‌های این snapshot موردی گزارش نکرده است.</p></div></div>}</section>

      <section className="dashboard-coverage" aria-labelledby="dashboard-coverage-title"><div className="dashboard-section-heading"><div><span>حد اتکا</span><h3 id="dashboard-coverage-title">پوشش داده</h3></div><strong>{faNumber(coverage.overall_score)}٪</strong></div><div className="coverage-section-list">{coverageSections.map(({ key, label, hint }) => { const section = coverage.sections[key]; const score = Math.max(0, Math.min(100, Number(section?.score ?? 0))); const reasons = Array.isArray(section?.reasons) ? section.reasons.filter((item): item is string => typeof item === "string") : []; return <div className="dashboard-coverage-row" key={key}><span className={section?.available ? "ready" : "limited"}>{section?.available ? <Icon name="check" /> : <Icon name="alert" />}</span><div><strong>{label}</strong><small>{reasons[0] ?? hint}</small><div className="coverage-meter"><i style={{ width: `${score}%` }} /></div></div><b>{faNumber(score)}٪</b></div>; })}</div>{coverage.limitations_fa.length ? <details className="coverage-limitations"><summary>{faNumber(coverage.limitations_fa.length)} محدودیت ثبت‌شده <Icon name="chevron" /></summary><ul>{coverage.limitations_fa.map((item) => <li key={item}>{item}</li>)}</ul></details> : null}</section>
    </div>

    <section className="dashboard-drivers" aria-labelledby="dashboard-drivers-title"><div className="dashboard-section-heading"><div><span>تغییرات دوره</span><h3 id="dashboard-drivers-title">محرک‌های اصلی</h3></div><small>فقط روندهای مالی تأییدشده</small></div>{dashboard.main_drivers.length ? <div className="driver-list">{dashboard.main_drivers.map((driver) => <Link key={driver.finding_id} href={`/companies/${company.id}/findings/${driver.finding_id}`}><span className={`priority-band band-${driver.priority_band}`}>{bandLabels[driver.priority_band]}</span><div><strong>{driver.title_fa}</strong><small>{driver.direction ?? "تغییر ثبت‌شده"}</small></div><b>{driver.affected_amount_irr ? compactMoney(driver.affected_amount_irr) : driver.affected_ratio ? new Intl.NumberFormat("fa-IR", { style: "percent", maximumFractionDigits: 1 }).format(Number(driver.affected_ratio)) : "—"}</b></Link>)}</div> : <div className="dashboard-empty"><Icon name="reconcile" /><div><strong>هنوز محرک مقایسه‌ای نداریم</strong><p>برای تشخیص روند، حداقل دو دوره قابل مقایسه و یک یافته مالی تأییدشده لازم است.</p></div><Link className="secondary-button" href={`/companies/${company.id}/analysis`}>مدیریت دوره‌ها</Link></div>}</section>

    <section className="financial-position" aria-labelledby="financial-position-title"><div className="dashboard-section-heading"><div><span>جزئیات تکمیلی</span><h3 id="financial-position-title">وضعیت مالی و عملیات فروش</h3></div></div><div className="position-table">{secondaryMetricCodes.map((code) => { const metric = metrics.get(code); return <div key={code}><span>{metric?.label_fa ?? metricFallbackLabels[code]}</span><strong title={metric ? exactMetricValue(metric) : undefined}>{metric ? metricValue(metric) : "قابل محاسبه نیست"}</strong><small>{metric?.available ? trendLabels[metric.trend] : metric?.unavailable_reason_fa ?? "منبع کافی وجود ندارد"}</small></div>; })}</div></section>

    <section className="dashboard-manifest"><Icon name="shield" /><div><strong>این تصویر تغییرناپذیر و قابل حسابرسی است</strong><p>{faDate(snapshot.period_start)} تا {faDate(snapshot.period_end)} · {snapshot.analysis_status === "completed" ? "پوشش کامل" : "پوشش محدود"}</p></div><span>نسخه قواعد <code dir="ltr">{snapshot.rule_set_version}</code></span></section>
  </div>;
}

function DashboardMetricCell({ code, metric }: { code: string; metric?: DashboardMetric }) {
  const available = Boolean(metric?.available && metric.value != null);
  return <article className={`dashboard-metric-cell${available ? "" : " unavailable"}`}><span className="metric-icon"><Icon name={metricIcons[code] ?? "chart"} /></span><div><span>{metric?.label_fa ?? metricFallbackLabels[code]}</span><strong title={metric ? exactMetricValue(metric) : undefined}>{metric ? metricValue(metric) : "قابل محاسبه نیست"}</strong></div><span className={`metric-trend trend-${metric?.trend ?? "unavailable"}`}><Icon name={metric?.trend === "flat" ? "reconcile" : metric?.trend === "unavailable" || !available ? "alert" : "activity"} />{available ? trendLabels[metric?.trend ?? "unavailable"] : metric?.unavailable_reason_fa ?? "داده کافی نیست"}</span></article>;
}

function DashboardSkeleton() {
  return <div className="dashboard-skeleton" aria-label="در حال دریافت داشبورد مالی"><span /><span /><div>{Array.from({ length: 6 }, (_, index) => <span key={index} />)}</div><div><span /><span /></div></div>;
}
