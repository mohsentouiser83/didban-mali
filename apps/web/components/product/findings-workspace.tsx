"use client";

import Link from "next/link";
import { FormEvent, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/product-api";
import type { AnalysisRun, Company, EvidenceItem, EvidenceItemsResponse, Finding, FindingGenerationRun, FindingsResponse, PriorityBand, ReconciliationRun } from "@/lib/product-types";

import { Icon } from "./icons";

type FindingFilter = "all" | "critical_high" | "hypothesis" | "reconciliation" | "financial";
const runStatusLabels: Record<FindingGenerationRun["status"], string> = { queued: "در صف تولید", processing: "در حال تولید", completed: "تکمیل‌شده", completed_limited: "تکمیل با پوشش محدود", failed: "ناموفق" };
const bandLabels: Record<PriorityBand, string> = { critical: "بحرانی", high: "بالا", medium: "متوسط", low: "پایین" };
const workflowLabels: Record<Finding["workflow_status"], string> = { needs_review: "نیازمند بررسی", confirmed: "تأییدشده", dismissed: "ردشده", follow_up: "در پیگیری", resolved: "حل‌شده" };
const evidenceLabels: Record<EvidenceItem["evidence_type"], string> = { rule: "قاعده تشخیص", calculation: "محاسبه", source_record: "رکورد منبع", comparison: "مقایسه دوره", coverage: "پوشش ورودی" };
const factorLabels = { impact: "اثر", materiality: "اهمیت", confidence: "اطمینان", urgency: "فوریت" } as const;
const filters: { id: FindingFilter; label: string }[] = [
  { id: "all", label: "همه یافته‌ها" },
  { id: "critical_high", label: "بحرانی و بالا" },
  { id: "hypothesis", label: "فرضیه‌ها" },
  { id: "reconciliation", label: "تطبیق" },
  { id: "financial", label: "روند مالی" },
];

function faDate(value: string) {
  return new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}
function faDateTime(value: string | null) { return value ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—"; }
function money(value?: string | null) { if (value == null) return "—"; try { return new Intl.NumberFormat("fa-IR").format(BigInt(value)); } catch { return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(Number(value)); } }
function shortId(value?: string | null) { return value ? `${value.slice(0, 8)}…${value.slice(-4)}` : "—"; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function printable(value: unknown) { if (value == null) return "—"; if (typeof value === "boolean") return value ? "بله" : "خیر"; if (typeof value === "object") return JSON.stringify(value); return String(value); }

export function FindingsWorkspace({ company }: { company: Company }) {
  const [analyses, setAnalyses] = useState<AnalysisRun[]>([]);
  const [analysisId, setAnalysisId] = useState("");
  const [reconciliations, setReconciliations] = useState<ReconciliationRun[]>([]);
  const [reconciliationId, setReconciliationId] = useState("");
  const [run, setRun] = useState<FindingGenerationRun | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<FindingFilter>("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [trendPercent, setTrendPercent] = useState(10);
  const [minimumAmount, setMinimumAmount] = useState("1000000");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [evidenceByFinding, setEvidenceByFinding] = useState<Record<string, EvidenceItem[]>>({});
  const [evidenceBusy, setEvidenceBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const canRun = company.role !== "viewer";
  const isRunning = run?.status === "queued" || run?.status === "processing";

  const loadFindings = useCallback(async (runId: string, cursor?: string, append = false) => {
    const suffix = cursor ? `&cursor=${cursor}` : "";
    const result = await api<FindingsResponse>(`/companies/${company.id}/findings?generation_run_id=${runId}&limit=200${suffix}`);
    setFindings((current) => append ? [...current, ...result.items] : result.items);
    setNextCursor(result.next_cursor);
  }, [company.id]);

  const loadForAnalysis = useCallback(async (selectedAnalysisId: string) => {
    const [reconciliationRuns, findingRuns] = await Promise.all([
      api<ReconciliationRun[]>(`/companies/${company.id}/reconciliation-runs?analysis_run_id=${selectedAnalysisId}&limit=30`),
      api<FindingGenerationRun[]>(`/companies/${company.id}/finding-runs?analysis_run_id=${selectedAnalysisId}&limit=20`),
    ]);
    const readyReconciliations = reconciliationRuns.filter((item) => item.status === "completed" || item.status === "completed_limited");
    const latestFindingRun = findingRuns[0] ?? null;
    setReconciliations(readyReconciliations);
    setReconciliationId(latestFindingRun?.reconciliation_run_id ?? readyReconciliations[0]?.id ?? "");
    setRun(latestFindingRun); setFindings([]); setNextCursor(null); setExpanded(new Set()); setEvidenceByFinding({});
    if (latestFindingRun?.status === "completed" || latestFindingRun?.status === "completed_limited") await loadFindings(latestFindingRun.id);
  }, [company.id, loadFindings]);

  useEffect(() => {
    let ignore = false;
    async function bootstrap() {
      setLoading(true); setError("");
      try {
        const allRuns = await api<AnalysisRun[]>(`/companies/${company.id}/analysis-runs?limit=30`);
        const ready = allRuns.filter((item) => item.status === "completed" || item.status === "completed_limited");
        if (ignore) return;
        setAnalyses(ready);
        if (ready[0]) { setAnalysisId(ready[0].id); await loadForAnalysis(ready[0].id); }
      } catch (caught) { if (!ignore) setError(caught instanceof Error ? caught.message : "یافته‌ها دریافت نشدند."); }
      finally { if (!ignore) setLoading(false); }
    }
    void bootstrap();
    return () => { ignore = true; };
  }, [company.id, loadForAnalysis]);

  useEffect(() => {
    if (!run || !isRunning) return;
    const timer = window.setInterval(async () => {
      try {
        const current = await api<FindingGenerationRun>(`/companies/${company.id}/finding-runs/${run.id}`);
        setRun(current);
        if (current.status === "completed" || current.status === "completed_limited") { window.clearInterval(timer); await loadFindings(current.id); setSubmitting(false); }
        if (current.status === "failed") { window.clearInterval(timer); setSubmitting(false); setError(current.failure_message ?? "تولید یافته ناموفق بود."); }
      } catch (caught) { window.clearInterval(timer); setSubmitting(false); setError(caught instanceof Error ? caught.message : "وضعیت تولید یافته دریافت نشد."); }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [company.id, isRunning, loadFindings, run]);

  async function changeAnalysis(value: string) { setAnalysisId(value); setError(""); setLoading(true); try { await loadForAnalysis(value); } catch (caught) { setError(caught instanceof Error ? caught.message : "snapshot یافته‌ها دریافت نشد."); } finally { setLoading(false); } }

  async function startGeneration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!analysisId) { setError("ابتدا یک snapshot تحلیل مالی انتخاب کنید."); return; }
    setSubmitting(true); setFindings([]); setNextCursor(null); setExpanded(new Set()); setEvidenceByFinding({});
    try {
      const created = await api<FindingGenerationRun>(`/companies/${company.id}/analysis-runs/${analysisId}/finding-runs`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ reconciliation_run_id: reconciliationId || null, config_version: "finding-rules-v1", trend_ratio: String(trendPercent / 100), minimum_amount_irr: minimumAmount }) });
      setRun(created);
    } catch (caught) { setSubmitting(false); setError(caught instanceof Error ? caught.message : "تولید یافته آغاز نشد."); }
  }

  async function toggleFinding(findingId: string) {
    const opening = !expanded.has(findingId);
    setExpanded((current) => { const next = new Set(current); if (opening) next.add(findingId); else next.delete(findingId); return next; });
    if (opening && !evidenceByFinding[findingId]) {
      setEvidenceBusy(findingId);
      try {
        const result = await api<EvidenceItemsResponse>(`/companies/${company.id}/findings/${findingId}/evidence`);
        setEvidenceByFinding((current) => ({ ...current, [findingId]: result.items }));
      } catch (caught) { setError(caught instanceof Error ? caught.message : "شواهد یافته دریافت نشد."); }
      finally { setEvidenceBusy(null); }
    }
  }

  async function loadMore() { if (!run || !nextCursor) return; setLoadingMore(true); try { await loadFindings(run.id, nextCursor, true); } catch (caught) { setError(caught instanceof Error ? caught.message : "ادامه یافته‌ها دریافت نشد."); } finally { setLoadingMore(false); } }

  const selectedAnalysis = analyses.find((item) => item.id === analysisId);
  const ordered = useMemo(() => [...findings].sort((left, right) => Number(right.priority_score) - Number(left.priority_score)), [findings]);
  const visibleFindings = useMemo(() => ordered.filter((item) => {
    if (filter === "critical_high" && !["critical", "high"].includes(item.priority_band)) return false;
    if (filter === "hypothesis" && item.assertion_status !== "hypothesis") return false;
    if (filter === "reconciliation" && item.category !== "reconciliation") return false;
    if (filter === "financial" && item.category !== "financial_analysis") return false;
    return !deferredSearch || `${item.title_fa} ${item.summary_fa}`.includes(deferredSearch);
  }), [deferredSearch, filter, ordered]);

  if (loading && !analyses.length) return <FindingsSkeleton />;

  return <div className="findings-workspace">
    <section className="findings-intro"><div><span className="model-kicker"><Icon name="findings" />صف کنترل مالی</span><h2>یافته‌ها را بر اساس اثر و قوت شواهد بررسی کنید</h2><p>موتور فقط الگوهای تعریف‌شده را گزارش می‌کند؛ فرضیه‌ها صریح علامت می‌خورند و هر ادعا به قاعده، محاسبه و منبع وصل است.</p></div>{run ? <div className={`run-state state-${run.status}`}><span className="status-pulse" /><div><small>آخرین اجرای این snapshot</small><strong>{runStatusLabels[run.status]}</strong></div></div> : null}</section>
    {error ? <p className="form-error global" role="alert">{error}</p> : null}

    {!analyses.length ? <section className="reconciliation-prerequisite"><span><Icon name="chart" /></span><div><h3>ابتدا تحلیل مالی را اجرا کنید</h3><p>موتور یافته‌ها به snapshot نهایی تحلیل نیاز دارد.</p></div><Link className="primary-button" href={`/companies/${company.id}/analysis`}>رفتن به تحلیل مالی</Link></section> : <section className="findings-control" aria-labelledby="finding-source-title"><div className="findings-source"><span><Icon name="shield" /></span><label><strong id="finding-source-title">مبنای یافته‌ها</strong><small>snapshot تحلیل</small><select value={analysisId} onChange={(event) => void changeAnalysis(event.target.value)}>{analyses.map((item) => <option key={item.id} value={item.id}>{faDate(item.period_start)} تا {faDate(item.period_end)} · {item.status === "completed" ? "کامل" : "محدود"}</option>)}</select></label><label><strong>تطبیق مرتبط</strong><small>اختیاری برای یافته‌های بانکی</small><select value={reconciliationId} onChange={(event) => { setReconciliationId(event.target.value); setRun(null); setFindings([]); }}><option value="">بدون اجرای تطبیق</option>{reconciliations.map((item) => <option key={item.id} value={item.id}>{faDateTime(item.completed_at)} · {item.status === "completed" ? "کامل" : "محدود"}</option>)}</select></label></div><form onSubmit={(event) => void startGeneration(event)}><button className="primary-button" disabled={!canRun || submitting || isRunning}>{isRunning ? <><span className="button-spinner" />در حال تولید…</> : <><Icon name="target" />تولید یافته جدید</>}</button><details><summary><Icon name="tune" />آستانه‌های موتور</summary><div className="finding-settings"><label>تغییر معنادار <span>درصد</span><input type="number" min="0" max="100" value={trendPercent} onChange={(event) => setTrendPercent(Number(event.target.value))} /></label><label>حداقل مبلغ اثر <span>ریال</span><input type="number" min="0" dir="ltr" value={minimumAmount} onChange={(event) => setMinimumAmount(event.target.value)} /></label><p>اولویت با مدل نسخه‌دار پیش‌فرض و وزن‌های مصوب محاسبه می‌شود.</p></div></details></form>{!canRun ? <div className="analysis-advisory"><Icon name="shield" /><p><strong>دسترسی مشاهده‌گر</strong>مشاهده یافته‌ها مجاز است؛ تولید اجرای جدید به نقش مدیر مالی یا مشاور نیاز دارد.</p></div> : !reconciliationId ? <div className="analysis-advisory warning"><Icon name="alert" /><p><strong>یافته بانکی تولید نمی‌شود</strong>یک اجرای تطبیق انتخاب کنید یا ابتدا <Link href={`/companies/${company.id}/reconciliation`}>تطبیق حساب‌ها</Link> را انجام دهید.</p></div> : null}</section>}

    {isRunning ? <section className="analysis-running" aria-live="polite"><div className="finding-scan"><Icon name="target" /><i /></div><div><strong>{run?.status === "queued" ? "درخواست در صف موتور یافته‌ها است" : "قواعد و شواهد در حال ارزیابی‌اند"}</strong><p>یافته‌ها پس از محاسبه اولویت و ساخت زنجیره شواهد نمایش داده می‌شوند.</p></div></section> : null}

    {run && !isRunning && (run.status === "completed" || run.status === "completed_limited") ? <>
      <FindingsSummary run={run} findings={findings} />
      <section className="findings-queue" aria-labelledby="findings-title"><div className="findings-heading"><div><h3 id="findings-title">صف یافته‌های دوره</h3><p>{selectedAnalysis ? `${faDate(selectedAnalysis.period_start)} تا ${faDate(selectedAnalysis.period_end)}` : "snapshot انتخاب‌شده"} · مرتب‌شده بر اساس اولویت</p></div><label className="finding-search"><span className="sr-only">جستجو در یافته‌ها</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="جستجو در عنوان یا توضیح…" /></label></div><div className="finding-filters" role="tablist" aria-label="فیلتر یافته‌ها">{filters.map((item) => <button key={item.id} role="tab" aria-selected={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div>{visibleFindings.length ? <div className="finding-list">{visibleFindings.map((finding) => <FindingRow key={finding.id} finding={finding} open={expanded.has(finding.id)} busy={evidenceBusy === finding.id} evidence={evidenceByFinding[finding.id]} onToggle={() => void toggleFinding(finding.id)} />)}</div> : <div className="findings-empty"><Icon name={findings.length ? "check" : "shield"} /><div><strong>{findings.length ? "یافته‌ای با این فیلتر وجود ندارد" : "یافته قابل گزارشی تولید نشد"}</strong><p>{findings.length ? "عبارت جستجو یا فیلتر را تغییر دهید." : "موتور در محدوده داده و آستانه‌های این اجرا، موردی از کاتالوگ هشت‌گانه پیدا نکرده است."}</p></div></div>}{nextCursor ? <button className="load-more" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "در حال دریافت…" : "نمایش یافته‌های بیشتر"}</button> : null}</section>
      <section className="reconciliation-manifest"><Icon name="shield" /><div><strong>کاتالوگ محدود و قابل حسابرسی</strong><p>این اجرا فقط از {new Intl.NumberFormat("fa-IR").format(run.counts.catalog_size ?? 8)} نوع مجاز استفاده کرده و خروجی آن تغییرناپذیر است.</p></div><code dir="ltr">{shortId(run.id)}</code></section>
    </> : null}
  </div>;
}

function FindingsSummary({ run, findings }: { run: FindingGenerationRun; findings: Finding[] }) {
  const bands = findings.reduce<Record<PriorityBand, number>>((result, item) => { result[item.priority_band] += 1; return result; }, { critical: 0, high: 0, medium: 0, low: 0 });
  return <section className="findings-summary" aria-label="خلاصه یافته‌ها"><div className="finding-total"><span><Icon name="findings" /></span><div><small>یافته نیازمند توجه</small><strong>{new Intl.NumberFormat("fa-IR").format(run.counts.total ?? findings.length)}</strong></div><p>{new Intl.NumberFormat("fa-IR").format(run.counts.evidence_items ?? 0)} قطعه شاهد ثبت شده</p></div><div className="priority-distribution">{(Object.keys(bands) as PriorityBand[]).map((band) => <div key={band}><span><i className={`band-${band}`} />{bandLabels[band]}</span><strong>{new Intl.NumberFormat("fa-IR").format(bands[band])}</strong></div>)}</div><div className="finding-coverage"><CoverageState label="یافته‌های تطبیق" available={run.coverage.reconciliation_findings?.available} reason={run.coverage.reconciliation_findings?.reason} /><CoverageState label="روندهای مالی" available={run.coverage.financial_trends?.available} reason={run.coverage.financial_trends?.reason} /></div></section>;
}

function CoverageState({ label, available, reason }: { label: string; available?: boolean; reason?: string | null }) { return <div><span className={available ? "ready" : "limited"}>{available ? <Icon name="check" /> : <Icon name="alert" />}</span><div><strong>{label}</strong><small>{available ? "پوشش فعال" : reason ?? "پوشش محدود"}</small></div></div>; }

function FindingRow({ finding, open, busy, evidence, onToggle }: { finding: Finding; open: boolean; busy: boolean; evidence?: EvidenceItem[]; onToggle: () => void }) {
  return <article className={`finding-row finding-${finding.priority_band}`}><button className="finding-overview" onClick={onToggle} aria-expanded={open}><span className={`priority-band band-${finding.priority_band}`}>{bandLabels[finding.priority_band]}</span><span className="priority-score"><b>{new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(Number(finding.priority_score))}</b><small>از ۱۰۰</small></span><span className="finding-copy"><span className="finding-meta"><i>{finding.assertion_status === "hypothesis" ? "فرضیه" : "قطعی"}</i><i>{finding.category === "reconciliation" ? "تطبیق" : "تحلیل مالی"}</i><i>{workflowLabels[finding.workflow_status]}</i></span><strong>{finding.title_fa}</strong><small>{finding.summary_fa}</small></span><span className="finding-impact"><small>اثر مالی</small><b dir="ltr">{money(finding.affected_amount_irr)}</b>{finding.affected_amount_irr ? <i>ریال</i> : null}</span><span className="finding-confidence"><small>اطمینان</small><b>{new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(Number(finding.confidence_score))}٪</b></span><span className="finding-expand"><Icon name="chevron" /><i>{open ? "بستن" : "بررسی"}</i></span></button>{open ? <div className="finding-detail"><PriorityBreakdown finding={finding} /><EvidenceTrail busy={busy} items={evidence} /></div> : null}</article>;
}

function PriorityBreakdown({ finding }: { finding: Finding }) {
  const factors = finding.priority_explanation.factors ?? {};
  return <section className="priority-breakdown"><div><h4>چرا این اولویت؟</h4><p>{finding.priority_explanation.summary_fa ?? "امتیاز از ترکیب اثر، اهمیت، اطمینان و فوریت ساخته شده است."}</p></div><div className="factor-list">{(Object.keys(factorLabels) as (keyof typeof factorLabels)[]).map((key) => { const factor = factors[key]; const score = Number(factor?.score ?? 0); return <div key={key}><span><strong>{factorLabels[key]}</strong><small>{new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(score)} × {Number(factor?.weight ?? 0).toLocaleString("fa-IR")}</small></span><div><i style={{ width: `${Math.max(0, Math.min(100, score))}%` }} /></div><b>{Number(factor?.weighted_score ?? 0).toLocaleString("fa-IR")}</b></div>; })}</div>{finding.priority_explanation.uncertainty_fa ? <p className="priority-uncertainty"><Icon name="alert" />{finding.priority_explanation.uncertainty_fa}</p> : null}</section>;
}

function EvidenceTrail({ busy, items }: { busy: boolean; items?: EvidenceItem[] }) {
  return <section className="evidence-trail"><div><h4>زنجیره شواهد</h4><span>{items ? `${new Intl.NumberFormat("fa-IR").format(items.length)} مورد` : "در حال دریافت"}</span></div>{busy ? <div className="evidence-loading"><i /><i /><i /></div> : items?.length ? <ol>{items.map((item) => <EvidenceCard key={item.id} item={item} />)}</ol> : <p className="evidence-empty">شاهدی برای این یافته ثبت نشده است.</p>}</section>;
}

function EvidenceCard({ item }: { item: EvidenceItem }) {
  const sourceFile = record(item.field_snapshot.source_file);
  const sourceLocation = record(item.field_snapshot.source_location);
  const normalized = record(item.field_snapshot.normalized);
  const values = Object.keys(item.calculation).length ? item.calculation : normalized;
  const entries = Object.entries(values).slice(0, 5);
  return <li><span className={`evidence-kind evidence-kind-${item.evidence_type}`}><Icon name={item.evidence_type === "source_record" ? "file" : item.evidence_type === "rule" ? "target" : "evidence"} /></span><div className="evidence-card"><div><strong>{evidenceLabels[item.evidence_type]}</strong><code dir="ltr">{item.rule_code ?? item.claim_code}</code></div>{sourceFile.original_name ? <p className="evidence-file"><Icon name="file" />{String(sourceFile.original_name)}{sourceLocation.row_number ? ` · ردیف ${Number(sourceLocation.row_number).toLocaleString("fa-IR")}` : ""}</p> : null}{entries.length ? <dl>{entries.map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd dir={typeof value === "number" || /^-?\d/.test(String(value)) ? "ltr" : undefined}>{printable(value)}</dd></div>)}</dl> : <p className="evidence-reference">شناسه منبع: <code dir="ltr">{shortId(item.source_entity_id ?? item.source_row_id)}</code></p>}<small>نسخه قاعده: <code dir="ltr">{item.rule_version}</code></small></div></li>;
}

function FindingsSkeleton() { return <div className="findings-skeleton" aria-label="در حال دریافت یافته‌ها"><span /><span /><div><span /><span /></div><span /></div>; }
