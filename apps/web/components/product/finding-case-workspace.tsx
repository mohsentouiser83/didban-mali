"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api, API_URL } from "@/lib/product-api";
import type { Company, EvidenceItem, EvidenceItemsResponse, Finding, Member, PriorityBand, ReviewTimelineItem, ReviewTimelineResponse } from "@/lib/product-types";

import { Icon } from "./icons";
import { AiFindingExplanationPanel } from "./ai-finding-explanation";
import { FindingReviewPanel } from "./finding-review-panel";

const bandLabels: Record<PriorityBand, string> = { critical: "بحرانی", high: "بالا", medium: "متوسط", low: "پایین" };
const assertionLabels: Record<Finding["assertion_status"], string> = { hypothesis: "فرضیه نیازمند بررسی", deterministic: "نتیجه قطعی قاعده‌ای" };
const workflowLabels: Record<Finding["workflow_status"], string> = { needs_review: "نیازمند بررسی", confirmed: "تأییدشده", dismissed: "ردشده", follow_up: "در پیگیری", resolved: "حل‌شده" };
const evidenceLabels: Record<EvidenceItem["evidence_type"], string> = { rule: "قاعده تشخیص", calculation: "محاسبه", source_record: "رکورد منبع", comparison: "مقایسه دوره", coverage: "پوشش ورودی" };
const factorLabels = { impact: "اثر", materiality: "اهمیت", confidence: "اطمینان", urgency: "فوریت" } as const;
const fieldLabels: Record<string, string> = {
  amount_difference_irr: "اختلاف مبلغ",
  analysis_run_id: "شناسه تحلیل",
  assertion_status: "نوع ادعا",
  bank_transaction_id: "شناسه تراکنش بانکی",
  booking_date: "تاریخ تراکنش",
  claim_code: "کد ادعا",
  confidence_score: "امتیاز اطمینان",
  date_difference_days: "اختلاف روز",
  description: "شرح",
  finding_code: "نوع یافته",
  journal_entry_id: "شناسه سند حسابداری",
  metric_code: "شاخص مالی",
  position: "جایگاه دوره",
  reason_parameters: "پارامترهای دلیل",
  transaction_id: "شناسه تراکنش",
  value_irr: "مبلغ",
};
const idPattern = /(^id$|_id$|^[0-9a-f]{8}-)/i;
const numericPattern = /^-?\d+(\.\d+)?$/;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function faDate(value: string) {
  return new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "long", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function faDateTime(value: string) {
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}

function money(value: string | null) {
  if (value == null) return "موجود نیست";
  try { return new Intl.NumberFormat("fa-IR").format(BigInt(value)); }
  catch { return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(Number(value)); }
}

function percent(value: string | null) {
  if (value == null) return "موجود نیست";
  return `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(Number(value) * 100)}٪`;
}

function displayValue(value: unknown) {
  if (value == null || value === "") return "موجود نیست";
  if (typeof value === "boolean") return value ? "بله" : "خیر";
  if (typeof value === "object") return JSON.stringify(value);
  if (numericPattern.test(String(value))) return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 4 }).format(Number(value));
  return String(value);
}

function shortId(value: string) { return `${value.slice(0, 8)}…${value.slice(-4)}`; }

export function FindingCaseWorkspace({ company, currentUserId, findingId }: { company: Company; currentUserId: string; findingId: string }) {
  const [finding, setFinding] = useState<Finding | null>(null);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewTimelineItem[]>([]);
  const [reviewCursor, setReviewCursor] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true); setError("");
      try {
        const [findingResult, evidenceResult, reviewsResult, membersResult] = await Promise.all([
          api<Finding>(`/companies/${company.id}/findings/${findingId}`),
          api<EvidenceItemsResponse>(`/companies/${company.id}/findings/${findingId}/evidence`),
          api<ReviewTimelineResponse>(`/companies/${company.id}/findings/${findingId}/reviews?limit=50`),
          api<Member[]>(`/companies/${company.id}/members`),
        ]);
        if (!ignore) { setFinding(findingResult); setEvidence(evidenceResult.items); setReviewItems(reviewsResult.items); setReviewCursor(reviewsResult.next_cursor); setMembers(membersResult); }
      } catch (caught) {
        if (!ignore) setError(caught instanceof Error ? caught.message : "پرونده یافته دریافت نشد.");
      } finally { if (!ignore) setLoading(false); }
    }
    void load();
    return () => { ignore = true; };
  }, [company.id, findingId]);

  const reloadReview = useCallback(async () => {
    const [findingResult, reviewsResult] = await Promise.all([
      api<Finding>(`/companies/${company.id}/findings/${findingId}`),
      api<ReviewTimelineResponse>(`/companies/${company.id}/findings/${findingId}/reviews?limit=50`),
    ]);
    setFinding(findingResult); setReviewItems(reviewsResult.items); setReviewCursor(reviewsResult.next_cursor);
  }, [company.id, findingId]);

  const loadMoreReviews = useCallback(async () => {
    if (!reviewCursor) return;
    const result = await api<ReviewTimelineResponse>(`/companies/${company.id}/findings/${findingId}/reviews?limit=50&cursor=${reviewCursor}`);
    setReviewItems((current) => [...current, ...result.items]); setReviewCursor(result.next_cursor);
  }, [company.id, findingId, reviewCursor]);

  const evidenceKinds = useMemo(() => new Set(evidence.map((item) => item.evidence_type)), [evidence]);

  if (loading) return <FindingCaseSkeleton />;
  if (!finding || error) return <section className="finding-case-error"><Icon name="alert" /><div><h2>پرونده یافته در دسترس نیست</h2><p>{error || "این یافته پیدا نشد."}</p></div><Link className="secondary-button" href={`/companies/${company.id}/findings`}>بازگشت به یافته‌ها</Link></section>;

  const factorEntries = (Object.keys(factorLabels) as (keyof typeof factorLabels)[]).map((key) => [key, finding.priority_explanation.factors?.[key]] as const);
  const evidenceComplete = evidenceKinds.has("rule") && evidenceKinds.has("calculation") && (evidenceKinds.has("source_record") || evidenceKinds.has("comparison"));

  return <div className="finding-case-workspace">
    <Link className="case-back" href={`/companies/${company.id}/findings`}><Icon name="arrow" />بازگشت به صف یافته‌ها</Link>

    <section className="finding-case-hero">
      <div className="case-hero-copy">
        <div className="case-badges"><span className={`priority-band band-${finding.priority_band}`}>{bandLabels[finding.priority_band]}</span><span><Icon name={finding.assertion_status === "hypothesis" ? "alert" : "check"} />{assertionLabels[finding.assertion_status]}</span><span>{workflowLabels[finding.workflow_status]}</span></div>
        <h2>{finding.title_fa}</h2>
        <p>{finding.summary_fa}</p>
        <div className={`claim-boundary ${finding.assertion_status}`}><Icon name={finding.assertion_status === "hypothesis" ? "alert" : "shield"} /><p><strong>حد ادعا</strong>{finding.assertion_status === "hypothesis" ? "این مورد نشانهٔ نیازمند بررسی است و به‌تنهایی اثبات نمی‌کند تراکنش واقعاً ثبت نشده است." : "این نتیجه مستقیماً از قاعده و دادهٔ ثبت‌شده به دست آمده است."}</p></div>
      </div>
      <div className="case-score" aria-label={`امتیاز اولویت ${finding.priority_score} از صد`}>
        <div style={{ "--score": `${Math.max(0, Math.min(100, Number(finding.priority_score)))}%` } as React.CSSProperties}><span><strong>{new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(Number(finding.priority_score))}</strong><small>از ۱۰۰</small></span></div>
        <p>اولویت <strong>{bandLabels[finding.priority_band]}</strong></p>
        <span>اطمینان {new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(Number(finding.confidence_score))}٪</span>
      </div>
    </section>

    <section className="case-integrity" aria-label="وضعیت قابلیت حسابرسی"><div><span className={evidenceComplete ? "ready" : "limited"}><Icon name={evidenceComplete ? "check" : "alert"} /></span><p><strong>{evidenceComplete ? "زنجیره شواهد کامل است" : "زنجیره شواهد محدود است"}</strong><small>قاعده، محاسبه و منبع بررسی شدند</small></p></div><div><Icon name="shield" /><p><strong>خروجی تغییرناپذیر</strong><small>نسخه‌های قواعد و مدل اولویت ثبت شده‌اند</small></p></div><div><Icon name="calendar" /><p><strong>{faDate(finding.period_start)} تا {faDate(finding.period_end)}</strong><small>دوره مورد بررسی</small></p></div></section>

    <AiFindingExplanationPanel company={company} findingId={finding.id} />

    <FindingReviewPanel company={company} currentUserId={currentUserId} findingId={finding.id} currentStatus={finding.workflow_status} items={reviewItems} members={members} nextCursor={reviewCursor} onChanged={reloadReview} onLoadMore={loadMoreReviews} />

    <div className="finding-case-layout">
      <main className="case-main">
        <section className="case-priority-panel" aria-labelledby="priority-audit-title">
          <header><div><h3 id="priority-audit-title">دفتر محاسبه اولویت</h3><p>{finding.priority_explanation.summary_fa}</p></div><code dir="ltr">{finding.priority_explanation.formula}</code></header>
          <div className="case-factor-list">{factorEntries.map(([key, factor]) => { const score = Number(factor?.score ?? 0); return <article key={key}><div className="factor-order"><span>{factorLabels[key]}</span><strong>{new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(Number(factor?.weighted_score ?? 0))}</strong></div><div className="factor-meter"><i style={{ width: `${Math.max(0, Math.min(100, score))}%` }} /></div><div className="factor-math"><span>امتیاز {new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(score)}</span><span>وزن {percent(String(factor?.weight ?? 0))}</span></div><ul>{factor?.reasons_fa?.map((reason) => <li key={reason}>{reason}</li>)}</ul></article>; })}</div>
          {finding.priority_explanation.uncertainty_fa ? <p className="priority-uncertainty"><Icon name="alert" />{finding.priority_explanation.uncertainty_fa}</p> : null}
        </section>

        <section className="case-evidence-panel" aria-labelledby="case-evidence-title">
          <header><div><h3 id="case-evidence-title">مسیر شواهد</h3><p>هر مرحله، دادهٔ مرحله قبل را به ادعای نهایی متصل می‌کند.</p></div><span>{new Intl.NumberFormat("fa-IR").format(evidence.length)} قطعه شاهد</span></header>
          <ol className="case-evidence-list">{evidence.map((item) => <EvidenceCaseItem key={item.id} companyId={company.id} item={item} />)}</ol>
        </section>
      </main>

      <aside className="case-sidebar">
        <section><h3>مشخصات پرونده</h3><dl><Fact label="اثر مالی" value={`${money(finding.affected_amount_irr)}${finding.affected_amount_irr ? " ریال" : ""}`} /><Fact label="نسبت اثر به درآمد" value={percent(finding.affected_ratio)} /><Fact label="نوع یافته" value={finding.finding_code} latin /><Fact label="دلیل" value={finding.reason_code} latin /><Fact label="زمان ثبت" value={faDateTime(finding.created_at)} /></dl></section>
        <section><h3>نسخه‌ها و شناسه‌ها</h3><dl><Fact label="مدل اولویت" value={finding.priority_model_version} latin /><Fact label="قاعده یافته" value={finding.rule_version} latin /><Fact label="شناسه یافته" value={finding.id} latin copy /><Fact label="شناسه اجرای تولید" value={finding.generation_run_id} latin copy /></dl></section>
        <section className="case-thresholds"><h3>مرزهای اولویت این اجرا</h3><p>این مرزها همراه یافته ذخیره شده‌اند و تغییر تنظیمات آینده روی این پرونده اثر نمی‌گذارد.</p><div><span>بحرانی از <b>{displayValue(record(finding.priority_config.bands).critical)}</b></span><span>بالا از <b>{displayValue(record(finding.priority_config.bands).high)}</b></span><span>متوسط از <b>{displayValue(record(finding.priority_config.bands).medium)}</b></span></div></section>
      </aside>
    </div>
  </div>;
}

function Fact({ label, value, latin = false, copy = false }: { label: string; value: string; latin?: boolean; copy?: boolean }) {
  const shown = copy ? shortId(value) : value;
  return <div><dt>{label}</dt><dd dir={latin ? "ltr" : undefined} title={copy ? value : undefined}>{shown}</dd></div>;
}

function EvidenceCaseItem({ companyId, item }: { companyId: string; item: EvidenceItem }) {
  const snapshot = record(item.field_snapshot);
  const raw = record(snapshot.raw);
  const normalized = record(snapshot.normalized);
  const sourceFile = record(snapshot.source_file);
  const sourceLocation = record(snapshot.source_location);
  const mainValues = Object.keys(item.calculation).length ? item.calculation : Object.fromEntries(Object.entries(snapshot).filter(([key]) => !["raw", "normalized", "source_file", "source_location"].includes(key)));
  return <li>
    <span className={`case-evidence-marker evidence-kind-${item.evidence_type}`}><Icon name={item.evidence_type === "source_record" ? "file" : item.evidence_type === "rule" ? "target" : "evidence"} /></span>
    <article>
      <header><div><span>مرحله {new Intl.NumberFormat("fa-IR").format(item.ordinal)}</span><h4>{evidenceLabels[item.evidence_type]}</h4></div><code dir="ltr">{item.rule_code ?? item.claim_code}</code></header>
      {Object.keys(mainValues).length ? <KeyValueGrid values={mainValues} /> : null}
      {Object.keys(raw).length || Object.keys(normalized).length ? <div className="source-record-compare">{Object.keys(raw).length ? <DataColumn title="مقدار ثبت‌شده در فایل" values={raw} /> : null}{Object.keys(normalized).length ? <DataColumn title="ارجاع نرمال‌شده" values={normalized} /> : null}</div> : null}
      {item.source_file_id ? <div className="case-source-file"><Icon name="file" /><div><strong>{String(sourceFile.original_name ?? "فایل ورودی")}</strong><small>{sourceLocation.sheet ? `شیت ${String(sourceLocation.sheet)} · ` : ""}{sourceLocation.row_number ? `ردیف ${Number(sourceLocation.row_number).toLocaleString("fa-IR")}` : ""}</small></div><a className="secondary-button" href={`${API_URL}/companies/${companyId}/imports/source-files/${item.source_file_id}/download`}><Icon name="download" />دریافت فایل اصلی</a></div> : null}
      {sourceFile.sha256 ? <p className="source-hash"><span>اثر انگشت فایل</span><code dir="ltr">{String(sourceFile.sha256)}</code></p> : null}
      <footer><span>ثبت شاهد: {faDateTime(item.created_at)}</span><span>نسخه: <code dir="ltr">{item.rule_version}</code></span></footer>
    </article>
  </li>;
}

function DataColumn({ title, values }: { title: string; values: Record<string, unknown> }) {
  return <section><h5>{title}</h5><KeyValueGrid values={values} /></section>;
}

function KeyValueGrid({ values }: { values: Record<string, unknown> }) {
  return <dl className="case-key-values">{Object.entries(values).map(([key, value]) => <div key={key}><dt>{fieldLabels[key] ?? key.replaceAll("_", " ")}</dt><dd dir={idPattern.test(key) || idPattern.test(String(value)) ? "ltr" : undefined}>{displayValue(value)}</dd></div>)}</dl>;
}

function FindingCaseSkeleton() { return <div className="finding-case-skeleton" aria-label="در حال دریافت پرونده یافته"><span /><div><span /><span /></div><span /></div>; }
