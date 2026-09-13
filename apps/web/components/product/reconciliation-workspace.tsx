"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/product-api";
import type { AnalysisRun, Company, MatchStatus, ReconciliationMatch, ReconciliationMatchesResponse, ReconciliationRun } from "@/lib/product-types";

import { Icon } from "./icons";
import { AiSemanticRanking } from "./ai-semantic-ranking";

type MatchFilter = "all" | "matched" | "review" | "mismatch" | "duplicate" | "unresolved";

const runStatusLabels: Record<ReconciliationRun["status"], string> = { queued: "در صف تطبیق", processing: "در حال تطبیق", completed: "تکمیل‌شده", completed_limited: "تکمیل با ورودی محدود", failed: "ناموفق" };
const matchStatusLabels: Record<MatchStatus, string> = { auto_matched: "تطبیق قطعی", potential_match: "نیازمند بررسی", amount_mismatch: "مغایرت مبلغ", date_mismatch: "مغایرت تاریخ", duplicate_high: "تکراری قطعی", duplicate_possible: "تکراری احتمالی", unresolved: "بدون متناظر" };
const filters: { id: MatchFilter; label: string; statuses?: MatchStatus[] }[] = [
  { id: "all", label: "همه" },
  { id: "matched", label: "تطبیق قطعی", statuses: ["auto_matched"] },
  { id: "review", label: "نیازمند بررسی", statuses: ["potential_match"] },
  { id: "mismatch", label: "مغایرت", statuses: ["amount_mismatch", "date_mismatch"] },
  { id: "duplicate", label: "تکراری", statuses: ["duplicate_high", "duplicate_possible"] },
  { id: "unresolved", label: "بدون متناظر", statuses: ["unresolved"] },
];

function faDate(value: string) {
  return new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function faDateTime(value: string | null) {
  return value ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
}

function money(value?: string | null) {
  if (value == null) return "—";
  try { return new Intl.NumberFormat("fa-IR").format(BigInt(value)); }
  catch { return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(Number(value)); }
}

function shortId(value?: string | null) { return value ? `${value.slice(0, 8)}…${value.slice(-4)}` : "—"; }

export function ReconciliationWorkspace({ company }: { company: Company }) {
  const [analyses, setAnalyses] = useState<AnalysisRun[]>([]);
  const [analysisId, setAnalysisId] = useState("");
  const [run, setRun] = useState<ReconciliationRun | null>(null);
  const [matches, setMatches] = useState<ReconciliationMatch[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<MatchFilter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [ruleDays, setRuleDays] = useState(3);
  const [reviewDays, setReviewDays] = useState(10);
  const [fuzzyThreshold, setFuzzyThreshold] = useState(70);
  const [ambiguityMargin, setAmbiguityMargin] = useState(5);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const canRun = company.role !== "viewer";
  const isRunning = run?.status === "queued" || run?.status === "processing";

  const loadMatches = useCallback(async (runId: string, cursor?: string, append = false) => {
    const suffix = cursor ? `&cursor=${cursor}` : "";
    const result = await api<ReconciliationMatchesResponse>(`/companies/${company.id}/reconciliation-runs/${runId}/matches?limit=200${suffix}`);
    setMatches((current) => append ? [...current, ...result.items] : result.items);
    setNextCursor(result.next_cursor);
  }, [company.id]);

  const loadRunForAnalysis = useCallback(async (selectedAnalysisId: string) => {
    const runs = await api<ReconciliationRun[]>(`/companies/${company.id}/reconciliation-runs?analysis_run_id=${selectedAnalysisId}&limit=1`);
    const latest = runs[0] ?? null;
    setRun(latest); setMatches([]); setNextCursor(null);
    if (latest?.status === "completed" || latest?.status === "completed_limited") await loadMatches(latest.id);
  }, [company.id, loadMatches]);

  useEffect(() => {
    let ignore = false;
    async function bootstrap() {
      setLoading(true); setError("");
      try {
        const allRuns = await api<AnalysisRun[]>(`/companies/${company.id}/analysis-runs?limit=30`);
        const ready = allRuns.filter((item) => item.status === "completed" || item.status === "completed_limited");
        if (ignore) return;
        setAnalyses(ready);
        const latest = ready[0];
        if (latest) { setAnalysisId(latest.id); await loadRunForAnalysis(latest.id); }
      } catch (caught) { if (!ignore) setError(caught instanceof Error ? caught.message : "اطلاعات تطبیق دریافت نشد."); }
      finally { if (!ignore) setLoading(false); }
    }
    void bootstrap();
    return () => { ignore = true; };
  }, [company.id, loadRunForAnalysis]);

  useEffect(() => {
    if (!run || !isRunning) return;
    const timer = window.setInterval(async () => {
      try {
        const current = await api<ReconciliationRun>(`/companies/${company.id}/reconciliation-runs/${run.id}`);
        setRun(current);
        if (current.status === "completed" || current.status === "completed_limited") { window.clearInterval(timer); await loadMatches(current.id); setSubmitting(false); }
        if (current.status === "failed") { window.clearInterval(timer); setSubmitting(false); setError(current.failure_message ?? "اجرای تطبیق ناموفق بود."); }
      } catch (caught) { window.clearInterval(timer); setSubmitting(false); setError(caught instanceof Error ? caught.message : "وضعیت تطبیق دریافت نشد."); }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [company.id, isRunning, loadMatches, run]);

  async function changeAnalysis(value: string) {
    setAnalysisId(value); setError(""); setLoading(true);
    try { await loadRunForAnalysis(value); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "اجرای تطبیق دریافت نشد."); }
    finally { setLoading(false); }
  }

  async function startReconciliation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!analysisId) { setError("ابتدا یک snapshot تحلیل مالی انتخاب کنید."); return; }
    if (reviewDays < ruleDays) { setError("بازه بررسی نباید از بازه تطبیق قاعده‌ای کوچک‌تر باشد."); return; }
    setSubmitting(true); setMatches([]); setNextCursor(null);
    try {
      const created = await api<ReconciliationRun>(`/companies/${company.id}/analysis-runs/${analysisId}/reconciliation-runs`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ config_version: "reconciliation-v1", rule_business_days: ruleDays, review_calendar_days: reviewDays, fuzzy_threshold: String(fuzzyThreshold), ambiguity_margin: String(ambiguityMargin) }) });
      setRun(created);
    } catch (caught) { setSubmitting(false); setError(caught instanceof Error ? caught.message : "تطبیق آغاز نشد."); }
  }

  async function loadMore() {
    if (!run || !nextCursor) return;
    setLoadingMore(true);
    try { await loadMatches(run.id, nextCursor, true); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "ادامه نتایج دریافت نشد."); }
    finally { setLoadingMore(false); }
  }

  function toggleEvidence(id: string) {
    setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  const selectedAnalysis = analyses.find((item) => item.id === analysisId);
  const activeFilter = filters.find((item) => item.id === filter);
  const visibleMatches = useMemo(() => activeFilter?.statuses ? matches.filter((item) => activeFilter.statuses?.includes(item.status)) : matches, [activeFilter, matches]);

  if (loading && !analyses.length) return <ReconciliationSkeleton />;

  return <div className="reconciliation-workspace">
    <section className="reconciliation-intro"><div><span className="model-kicker"><Icon name="reconcile" />موتور تطبیق قطعی</span><h2>رد بانکی را با ثبت حسابداری، رو‌به‌روی هم ببینید</h2><p>تطبیق خودکار فقط برای جفت یکتا انجام می‌شود؛ موارد مبهم و مغایرت‌ها با شواهد دوطرفه در صف بررسی می‌مانند.</p></div>{run ? <div className={`run-state state-${run.status}`}><span className="status-pulse" /><div><small>آخرین اجرای این snapshot</small><strong>{runStatusLabels[run.status]}</strong></div></div> : null}</section>

    {error ? <p className="form-error global" role="alert">{error}</p> : null}

    {!analyses.length ? <section className="reconciliation-prerequisite"><span><Icon name="chart" /></span><div><h3>ابتدا یک تحلیل مالی آماده کنید</h3><p>تطبیق روی snapshot ثابت تحلیل اجرا می‌شود تا ورودی‌ها در طول بررسی تغییر نکنند.</p></div><Link className="primary-button" href={`/companies/${company.id}/analysis`}>رفتن به تحلیل مالی</Link></section> : <section className="reconciliation-control" aria-labelledby="reconciliation-control-title"><div className="reconciliation-control-main"><div className="snapshot-select"><span><Icon name="shield" /></span><label htmlFor="analysis-snapshot"><strong id="reconciliation-control-title">مبنای تطبیق</strong><small>snapshot تحلیل مالی</small><select id="analysis-snapshot" value={analysisId} onChange={(event) => void changeAnalysis(event.target.value)}>{analyses.map((item) => <option key={item.id} value={item.id}>{faDate(item.period_start)} تا {faDate(item.period_end)} · {item.status === "completed" ? "کامل" : "محدود"}</option>)}</select></label></div><form onSubmit={(event) => void startReconciliation(event)}><button className="primary-button" disabled={!canRun || submitting || isRunning}>{isRunning ? <><span className="button-spinner" />در حال تطبیق…</> : <><Icon name="reconcile" />اجرای تطبیق جدید</>}</button><details><summary><Icon name="tune" />تنظیمات موتور</summary><div className="reconciliation-settings"><label>بازه تطبیق قاعده‌ای <span>روز کاری</span><input type="number" min="0" max="10" value={ruleDays} onChange={(event) => setRuleDays(Number(event.target.value))} /></label><label>بازه بررسی <span>روز تقویمی</span><input type="number" min="1" max="31" value={reviewDays} onChange={(event) => setReviewDays(Number(event.target.value))} /></label><label>حد شباهت متن <span>از ۱۰۰</span><input type="number" min="50" max="100" value={fuzzyThreshold} onChange={(event) => setFuzzyThreshold(Number(event.target.value))} /></label><label>حاشیه ابهام <span>امتیاز</span><input type="number" min="0" max="20" value={ambiguityMargin} onChange={(event) => setAmbiguityMargin(Number(event.target.value))} /></label></div></details></form></div>{!canRun ? <div className="analysis-advisory"><Icon name="shield" /><p><strong>دسترسی مشاهده‌گر</strong>مشاهده نتایج مجاز است؛ اجرای تطبیق جدید به نقش مدیر مالی یا مشاور نیاز دارد.</p></div> : selectedAnalysis?.coverage.bank_cash_flow?.available ? null : <div className="analysis-advisory warning"><Icon name="alert" /><p><strong>داده بانکی این snapshot کامل نیست</strong>تطبیق اجرا می‌شود اما احتمالاً نتیجه محدود خواهد بود. <Link href={`/companies/${company.id}/imports`}>ورود گردش بانکی</Link></p></div>}</section>}

    {isRunning ? <section className="analysis-running" aria-live="polite"><div className="reconcile-motion"><span><Icon name="bank" /></span><i /><span><Icon name="file" /></span></div><div><strong>{run?.status === "queued" ? "اجرای تطبیق در صف است" : "کاندیدها در حال مقایسه‌اند"}</strong><p>مبلغ، تاریخ، مرجع و شباهت شرح برای هر جفت محاسبه می‌شود.</p></div></section> : null}

    {run && !isRunning && (run.status === "completed" || run.status === "completed_limited") ? <>
      <ReconciliationSummary run={run} />
      <AiSemanticRanking company={company} runId={run.id} candidates={matches.filter((item) => item.status === "potential_match")} />
      <section className="matches-panel" aria-labelledby="matches-title"><div className="matches-heading"><div><h3 id="matches-title">نتایج تطبیق</h3><p>هر نتیجه به ردیف بانکی و سند حسابداری منبع متصل است.</p></div><span>تکمیل: {faDateTime(run.completed_at)}</span></div><div className="match-filters" role="tablist" aria-label="فیلتر نتایج">{filters.map((item) => { const count = item.statuses ? matches.filter((match) => item.statuses?.includes(match.status)).length : matches.length; return <button key={item.id} role="tab" aria-selected={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}<span>{new Intl.NumberFormat("fa-IR").format(count)}</span></button>; })}</div>{visibleMatches.length ? <div className="match-list">{visibleMatches.map((match) => <MatchRow key={match.id} match={match} open={expanded.has(match.id)} onToggle={() => toggleEvidence(match.id)} />)}</div> : <div className="matches-empty"><Icon name="check" /><div><strong>{matches.length ? "موردی در این فیلتر نیست" : "موردی برای مقایسه پیدا نشد"}</strong><p>{matches.length ? "فیلتر دیگری را انتخاب کنید." : "در این snapshot تراکنش بانکی یا آرتیکل دارایی قابل تطبیق وجود ندارد؛ پوشش ورودی‌ها را بررسی کنید."}</p></div>{!matches.length ? <Link className="secondary-button" href={`/companies/${company.id}/imports`}>بررسی ورودی‌ها</Link> : null}</div>}{nextCursor ? <button className="load-more" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "در حال دریافت…" : "نمایش نتایج بیشتر"}</button> : null}</section>
      <section className="reconciliation-manifest"><Icon name="shield" /><div><strong>نتایج این اجرا تغییرناپذیرند</strong><p>تنظیمات {run.config_version} روی snapshot انتخاب‌شده اجرا شده است؛ تصمیم انسانی در فاز یافته‌ها ثبت می‌شود.</p></div><code dir="ltr">{shortId(run.id)}</code></section>
    </> : null}
  </div>;
}

function ReconciliationSummary({ run }: { run: ReconciliationRun }) {
  const counts = run.counts;
  const review = (counts.potential_matches ?? 0) + (counts.amount_mismatches ?? 0) + (counts.date_mismatches ?? 0) + (counts.duplicates ?? 0);
  return <section className="reconciliation-summary" aria-label="خلاصه تطبیق"><div className="source-total"><span><Icon name="bank" /></span><small>تراکنش بانکی</small><strong>{new Intl.NumberFormat("fa-IR").format(counts.bank_transactions ?? 0)}</strong></div><div className="reconciliation-flow"><i /><div><span className="summary-auto">{new Intl.NumberFormat("fa-IR").format(counts.auto_matched ?? 0)} قطعی</span><span className="summary-review">{new Intl.NumberFormat("fa-IR").format(review)} نیازمند بررسی</span><span>{new Intl.NumberFormat("fa-IR").format(counts.unresolved ?? 0)} بدون متناظر</span></div><i /></div><div className="source-total"><span><Icon name="file" /></span><small>سند حسابداری</small><strong>{new Intl.NumberFormat("fa-IR").format(counts.accounting_entries ?? 0)}</strong></div></section>;
}

function MatchRow({ match, open, onToggle }: { match: ReconciliationMatch; open: boolean; onToggle: () => void }) {
  const bank = match.evidence.bank;
  const accounting = match.evidence.accounting;
  return <article className={`match-row match-${match.status}`}><div className="match-overview"><span className={`match-badge badge-${match.status}`}>{matchStatusLabels[match.status]}</span><div className="match-side"><small>بانک</small><strong>{bank?.description ?? (match.bank_transaction_id ? "تراکنش بانکی" : "بدون رکورد بانکی")}</strong><span>{bank?.date ? faDate(bank.date) : "—"} · <b dir="ltr">{money(bank?.amount_irr)}</b> ریال</span></div><div className="match-connector"><b>{new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(Number(match.score))}</b><span>امتیاز</span><i /></div><div className="match-side"><small>حسابداری</small><strong>{accounting?.description ?? (match.journal_entry_id ? "سند حسابداری" : "بدون سند متناظر")}</strong><span>{accounting?.date ? faDate(accounting.date) : "—"} · <b dir="ltr">{money(accounting?.amount_irr)}</b> ریال</span></div><button className="evidence-toggle" onClick={onToggle} aria-expanded={open}><Icon name="chevron" /><span>{open ? "بستن شواهد" : "مشاهده شواهد"}</span></button></div>{open ? <div className="match-evidence"><div className="evidence-features"><Feature label="مبلغ یکسان" value={match.features.amount_equal} /><Feature label="مرجع یکسان" value={match.features.reference_equal} /><Feature label="فاصله روز کاری" value={match.features.business_days} /><Feature label="شباهت شرح" value={match.features.description_similarity ? `${Number(match.features.description_similarity).toLocaleString("fa-IR", { maximumFractionDigits: 0 })}٪` : undefined} /></div><div className="evidence-sources"><div><span>ردیف منبع بانک</span><code dir="ltr">{shortId(bank?.source_row_id ?? match.evidence.source_row_id)}</code><small>{bank?.reference ? `مرجع ${bank.reference}` : "مرجع ثبت نشده"}</small></div><div><span>ردیف منبع حسابداری</span><code dir="ltr">{shortId(accounting?.source_row_id ?? match.evidence.source_row_id)}</code><small>{accounting?.reference ? `مرجع ${accounting.reference}` : "مرجع ثبت نشده"}</small></div></div><div className="evidence-rule"><span>قاعده</span><code dir="ltr">{match.rule_code}</code>{match.amount_difference_irr != null ? <small>اختلاف مبلغ: {money(match.amount_difference_irr)} ریال · اختلاف تاریخ: {new Intl.NumberFormat("fa-IR").format(match.date_difference_days ?? 0)} روز</small> : null}</div></div> : null}</article>;
}

function Feature({ label, value }: { label: string; value: boolean | number | string | undefined }) {
  const shown = typeof value === "boolean" ? (value ? "بله" : "خیر") : value ?? "—";
  return <span><small>{label}</small><strong>{shown}</strong></span>;
}

function ReconciliationSkeleton() {
  return <div className="reconciliation-skeleton" aria-label="در حال دریافت تطبیق"><span /><span /><div><span /><span /><span /></div><span /></div>;
}
