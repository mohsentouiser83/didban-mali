"use client";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ProductCard } from "./product-card";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api, API_URL } from "@/lib/product-api";
import type { Company, EvidenceItem, EvidenceItemsResponse, Finding, Member, PriorityBand, ReviewTimelineItem, ReviewTimelineResponse } from "@/lib/product-types";

import { Icon } from "./icons";
import { AiFindingExplanationPanel } from "./ai-finding-explanation";
import { FindingReviewPanel } from "./finding-review-panel";

const bandLabels: Record<PriorityBand, string> = { critical: "بحرانی", high: "بالا", medium: "متوسط", low: "پایین" };

const bandBadgeClasses: Record<PriorityBand, string> = {
  critical: "bg-destructive/10 text-destructive border-destructive/20",
  high: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  medium: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20",
  low: "bg-muted text-muted-foreground border-border",
};

const assertionLabels: Record<Finding["assertion_status"], string> = {
  hypothesis: "فرضیه نیازمند بررسی",
  deterministic: "نتیجه قطعی قاعده‌ای",
};

const workflowLabels: Record<Finding["workflow_status"], string> = {
  needs_review: "نیازمند بررسی",
  confirmed: "تأییدشده",
  dismissed: "ردشده",
  follow_up: "در پیگیری",
  resolved: "حل‌شده",
};

const evidenceLabels: Record<EvidenceItem["evidence_type"], string> = {
  rule: "قاعده تشخیص",
  calculation: "محاسبه",
  source_record: "رکورد منبع",
  comparison: "مقایسه دوره",
  coverage: "پوشش ورودی",
};

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
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
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

function shortId(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export function FindingCaseWorkspace({
  company,
  currentUserId,
  findingId,
}: {
  company: Company;
  currentUserId: string;
  findingId: string;
}) {
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
      setLoading(true);
      setError("");
      try {
        const [findingResult, evidenceResult, reviewsResult, membersResult] = await Promise.all([
          api<Finding>(`/companies/${company.id}/findings/${findingId}`),
          api<EvidenceItemsResponse>(`/companies/${company.id}/findings/${findingId}/evidence`),
          api<ReviewTimelineResponse>(`/companies/${company.id}/findings/${findingId}/reviews?limit=50`),
          api<Member[]>(`/companies/${company.id}/members`),
        ]);
        if (!ignore) {
          setFinding(findingResult);
          setEvidence(evidenceResult.items);
          setReviewItems(reviewsResult.items);
          setReviewCursor(reviewsResult.next_cursor);
          setMembers(membersResult);
        }
      } catch (caught) {
        if (!ignore) setError(caught instanceof Error ? caught.message : "پرونده یافته دریافت نشد.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void load();
    return () => { ignore = true; };
  }, [company.id, findingId]);

  const reloadReview = useCallback(async () => {
    const [findingResult, reviewsResult] = await Promise.all([
      api<Finding>(`/companies/${company.id}/findings/${findingId}`),
      api<ReviewTimelineResponse>(`/companies/${company.id}/findings/${findingId}/reviews?limit=50`),
    ]);
    setFinding(findingResult);
    setReviewItems(reviewsResult.items);
    setReviewCursor(reviewsResult.next_cursor);
  }, [company.id, findingId]);

  const loadMoreReviews = useCallback(async () => {
    if (!reviewCursor) return;
    const result = await api<ReviewTimelineResponse>(
      `/companies/${company.id}/findings/${findingId}/reviews?limit=50&cursor=${reviewCursor}`
    );
    setReviewItems((current) => [...current, ...result.items]);
    setReviewCursor(result.next_cursor);
  }, [company.id, findingId, reviewCursor]);

  const evidenceKinds = useMemo(() => new Set(evidence.map((item) => item.evidence_type)), [evidence]);

  if (loading) return <FindingCaseSkeleton />;
  if (!finding || error) {
    return (
      <section className="finding-case-error py-12 text-center flex flex-col items-center justify-center space-y-3">
        <Icon name="alert" className="size-8 text-destructive" />
        <div>
          <h2 className="text-base font-bold text-foreground">پرونده یافته در دسترس نیست</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{error || "این یافته پیدا نشد."}</p>
        </div>
        <Button asChild variant="outline" size="sm" className="mt-2">
          <Link href={`/companies/${company.id}/findings`}>بازگشت به یافته‌ها</Link>
        </Button>
      </section>
    );
  }

  const factorEntries = (Object.keys(factorLabels) as (keyof typeof factorLabels)[]).map(
    (key) => [key, finding.priority_explanation.factors?.[key]] as const
  );
  const evidenceComplete =
    evidenceKinds.has("rule") &&
    evidenceKinds.has("calculation") &&
    (evidenceKinds.has("source_record") || evidenceKinds.has("comparison"));

  return (
    <div className="finding-case-workspace space-y-6">
      <Link
        className="case-back inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        href={`/companies/${company.id}/findings`}
      >
        <Icon name="arrow" className="size-3.5" />
        بازگشت به صف یافته‌ها
      </Link>

      {/* Hero Header */}
      <section className="finding-case-hero p-6 sm:p-8 rounded-2xl border border-border bg-card shadow-sm grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-6 items-center">
        <div className="case-hero-copy space-y-3">
          <div className="case-badges flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className={`priority-band ${bandBadgeClasses[finding.priority_band]}`}>
              {bandLabels[finding.priority_band]}
            </Badge>
            <span className="inline-flex items-center gap-1 text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-lg">
              <Icon name={finding.assertion_status === "hypothesis" ? "alert" : "check"} className="size-3.5 text-primary" />
              {assertionLabels[finding.assertion_status]}
            </span>
            <span className="text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-lg">
              {workflowLabels[finding.workflow_status]}
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">{finding.title_fa}</h2>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{finding.summary_fa}</p>

          <div className="claim-boundary flex items-start gap-2.5 p-3 rounded-xl bg-muted/40 border border-border text-xs text-muted-foreground">
            <Icon name={finding.assertion_status === "hypothesis" ? "alert" : "shield"} className="size-4 text-primary shrink-0 mt-0.5" />
            <p>
              <strong className="font-bold text-foreground">حد ادعا: </strong>
              {finding.assertion_status === "hypothesis"
                ? "این مورد نشانهٔ نیازمند بررسی است و به‌تنهایی اثبات نمی‌کند تراکنش واقعاً ثبت نشده است."
                : "این نتیجه مستقیماً از قاعده و دادهٔ ثبت‌شده به دست آمده است."}
            </p>
          </div>
        </div>

        <div className="case-score flex flex-col items-center justify-center p-4 rounded-xl bg-muted/30 border border-border text-center space-y-1">
          <div className="text-3xl font-extrabold font-mono text-foreground">
            {new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(Number(finding.priority_score))}
            <small className="text-xs text-muted-foreground font-normal mr-1">/ ۱۰۰</small>
          </div>
          <p className="text-xs text-muted-foreground">
            اولویت <strong className="text-foreground">{bandLabels[finding.priority_band]}</strong>
          </p>
          <span className="text-[11px] text-muted-foreground">
            اطمینان {new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(Number(finding.confidence_score))}٪
          </span>
        </div>
      </section>

      {/* Integrity Bar */}
      <ProductCard className="case-integrity p-4 rounded-xl border border-border bg-card grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-muted-foreground" aria-label="وضعیت قابلیت حسابرسی">
        <div className="flex items-center gap-2.5">
          <span className={`size-7 rounded-lg flex items-center justify-center shrink-0 ${evidenceComplete ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>
            <Icon name={evidenceComplete ? "check" : "alert"} className="size-3.5" />
          </span>
          <div>
            <strong className="block text-foreground">{evidenceComplete ? "زنجیره شواهد کامل است" : "زنجیره شواهد محدود است"}</strong>
            <small className="block text-[11px]">قاعده، محاسبه و منبع بررسی شدند</small>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Icon name="shield" className="size-5 text-primary shrink-0" />
          <div>
            <strong className="block text-foreground">خروجی تغییرناپذیر</strong>
            <small className="block text-[11px]">نسخه‌های قواعد و مدل اولویت ثبت شده‌اند</small>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Icon name="calendar" className="size-5 text-primary shrink-0" />
          <div>
            <strong className="block text-foreground">{faDate(finding.period_start)} تا {faDate(finding.period_end)}</strong>
            <small className="block text-[11px]">دوره مورد بررسی</small>
          </div>
        </div>
      </ProductCard>

      <AiFindingExplanationPanel company={company} findingId={finding.id} />

      <FindingReviewPanel
        company={company}
        currentUserId={currentUserId}
        findingId={finding.id}
        currentStatus={finding.workflow_status}
        items={reviewItems}
        members={members}
        nextCursor={reviewCursor}
        onChanged={reloadReview}
        onLoadMore={loadMoreReviews}
      />

      <div className="finding-case-layout grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <main className="case-main space-y-6">
          {/* Priority Audit */}
          <ProductCard className="case-priority-panel p-6 rounded-2xl border border-border bg-card space-y-4" aria-labelledby="priority-audit-title">
            <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border/60 pb-3">
              <div>
                <h3 id="priority-audit-title" className="text-base font-bold text-foreground">تحلیل عوامل و فرمول اولویت‌بندی</h3>
              </div>
              <code dir="ltr" className="px-2 py-1 rounded bg-muted text-xs font-mono self-start sm:self-center">
                {finding.priority_explanation.formula}
              </code>
            </header>

            <div className="case-factor-list space-y-3">
              {factorEntries.map(([key, factor]) => {
                const score = Number(factor?.score ?? 0);
                return (
                  <article key={key} className="p-3 rounded-xl border border-border/60 bg-muted/20 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-foreground">{factorLabels[key]}</span>
                      <strong className="font-mono text-primary">
                        {new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(Number(factor?.weighted_score ?? 0))}
                      </strong>
                    </div>
                    <Progress className="h-1.5" value={Math.max(0, Math.min(100, score))} />
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>امتیاز: {new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(score)}</span>
                      <span>وزن: {percent(String(factor?.weight ?? 0))}</span>
                    </div>
                    {factor?.reasons_fa?.length ? (
                      <ul className="text-[11px] text-muted-foreground space-y-0.5 border-t border-border/40 pt-1.5 list-disc list-inside">
                        {factor.reasons_fa.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                );
              })}
            </div>

            {finding.priority_explanation.uncertainty_fa && (
              <p className="priority-uncertainty flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs">
                <Icon name="alert" className="size-4 shrink-0 text-amber-600" />
                {finding.priority_explanation.uncertainty_fa}
              </p>
            )}
          </ProductCard>

          {/* Evidence Path */}
          <ProductCard className="case-evidence-panel p-6 rounded-2xl border border-border bg-card space-y-4" aria-labelledby="case-evidence-title">
            <header className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <h3 id="case-evidence-title" className="text-base font-bold text-foreground">زنجیره شواهد و مستندات</h3>
              </div>
              <span className="text-xs font-mono text-muted-foreground">
                {new Intl.NumberFormat("fa-IR").format(evidence.length)} قطعه شاهد
              </span>
            </header>

            <ol className="case-evidence-list space-y-3">
              {evidence.map((item) => (
                <EvidenceCaseItem key={item.id} companyId={company.id} item={item} />
              ))}
            </ol>
          </ProductCard>
        </main>

        <aside className="case-sidebar space-y-6">
          <section className="p-6 rounded-2xl border border-border bg-card space-y-3">
            <h3 className="text-sm font-bold text-foreground border-b border-border/60 pb-2">مشخصات پرونده</h3>
            <dl className="divide-y divide-border/60 text-xs">
              <Fact label="اثر مالی" value={`${money(finding.affected_amount_irr)}${finding.affected_amount_irr ? " ریال" : ""}`} />
              <Fact label="نسبت اثر به درآمد" value={percent(finding.affected_ratio)} />
              <Fact label="نوع یافته" value={finding.finding_code} latin />
              <Fact label="دلیل" value={finding.reason_code} latin />
              <Fact label="زمان ثبت" value={faDateTime(finding.created_at)} />
            </dl>
          </section>

          <section className="p-6 rounded-2xl border border-border bg-card space-y-3">
            <h3 className="text-sm font-bold text-foreground border-b border-border/60 pb-2">نسخه‌ها و شناسه‌ها</h3>
            <dl className="divide-y divide-border/60 text-xs">
              <Fact label="مدل اولویت" value={finding.priority_model_version} latin />
              <Fact label="قاعده یافته" value={finding.rule_version} latin />
              <Fact label="شناسه یافته" value={finding.id} latin copy />
              <Fact label="شناسه اجرای تولید" value={finding.generation_run_id} latin copy />
            </dl>
          </section>

          <ProductCard className="case-thresholds p-4 rounded-xl border border-border bg-muted/20 space-y-2 text-xs">
            <h3 className="font-bold text-foreground">مرزهای اولویت این اجرا</h3>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              این مرزها همراه یافته ذخیره شده‌اند و تغییر تنظیمات آینده روی این پرونده اثر نمی‌گذارد.
            </p>
            <div className="flex flex-col gap-1 text-[11px] pt-1">
              <span>بحرانی از: <b className="font-mono text-foreground">{displayValue(record(finding.priority_config.bands).critical)}</b></span>
              <span>بالا از: <b className="font-mono text-foreground">{displayValue(record(finding.priority_config.bands).high)}</b></span>
              <span>متوسط از: <b className="font-mono text-foreground">{displayValue(record(finding.priority_config.bands).medium)}</b></span>
            </div>
          </ProductCard>
        </aside>
      </div>
    </div>
  );
}

function Fact({ label, value, latin = false, copy = false }: { label: string; value: string; latin?: boolean; copy?: boolean }) {
  const shown = copy ? shortId(value) : value;
  return (
    <div className="flex items-center justify-between py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd dir={latin ? "ltr" : undefined} title={copy ? value : undefined} className="font-mono font-medium text-foreground text-end">
        {shown}
      </dd>
    </div>
  );
}

function EvidenceCaseItem({ companyId, item }: { companyId: string; item: EvidenceItem }) {
  const snapshot = record(item.field_snapshot);
  const raw = record(snapshot.raw);
  const normalized = record(snapshot.normalized);
  const sourceFile = record(snapshot.source_file);
  const sourceLocation = record(snapshot.source_location);
  const mainValues = Object.keys(item.calculation).length
    ? item.calculation
    : Object.fromEntries(
        Object.entries(snapshot).filter(([key]) => !["raw", "normalized", "source_file", "source_location"].includes(key))
      );

  return (
    <li className="flex items-start gap-3 p-4 rounded-xl border border-border/60 bg-muted/20 text-xs">
      <span className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
        <Icon name={item.evidence_type === "source_record" ? "file" : item.evidence_type === "rule" ? "target" : "evidence"} className="size-4" />
      </span>

      <article className="flex-1 space-y-3 min-w-0">
        <header className="flex items-center justify-between border-b border-border/40 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-mono">مرحله {new Intl.NumberFormat("fa-IR").format(item.ordinal)}</span>
            <h4 className="font-bold text-foreground">{evidenceLabels[item.evidence_type]}</h4>
          </div>
          <code dir="ltr" className="px-2 py-0.5 rounded bg-muted text-[11px] font-mono">
            {item.rule_code ?? item.claim_code}
          </code>
        </header>

        {Object.keys(mainValues).length ? <KeyValueGrid values={mainValues} /> : null}

        {Object.keys(raw).length || Object.keys(normalized).length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/40">
            {Object.keys(raw).length ? <DataColumn title="مقدار ثبت‌شده در فایل" values={raw} /> : null}
            {Object.keys(normalized).length ? <DataColumn title="ارجاع نرمال‌شده" values={normalized} /> : null}
          </div>
        ) : null}

        {item.source_file_id ? (
          <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-card border border-border/60">
            <div className="flex items-center gap-2 min-w-0">
              <Icon name="file" className="size-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <strong className="block truncate text-foreground">{String(sourceFile.original_name ?? "فایل ورودی")}</strong>
                <small className="block text-[10px] text-muted-foreground">
                  {sourceLocation.sheet ? `شیت ${String(sourceLocation.sheet)} · ` : ""}
                  {sourceLocation.row_number ? `ردیف ${Number(sourceLocation.row_number).toLocaleString("fa-IR")}` : ""}
                </small>
              </div>
            </div>
            <Button asChild variant="outline" size="sm" className="h-7 text-xs gap-1">
              <a href={`${API_URL}/companies/${companyId}/imports/source-files/${item.source_file_id}/download`}>
                <Icon name="download" className="size-3" />
                دریافت فایل
              </a>
            </Button>
          </div>
        ) : null}

        {sourceFile.sha256 ? (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 font-mono">
            <span>اثر انگشت فایل:</span>
            <code dir="ltr">{String(sourceFile.sha256).slice(0, 16)}…</code>
          </p>
        ) : null}

        <footer className="flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/40 pt-2">
          <span>ثبت شاهد: {faDateTime(item.created_at)}</span>
          <span>نسخه: <code dir="ltr">{item.rule_version}</code></span>
        </footer>
      </article>
    </li>
  );
}

function DataColumn({ title, values }: { title: string; values: Record<string, unknown> }) {
  return (
    <section className="space-y-1.5">
      <h5 className="font-bold text-foreground text-[11px]">{title}</h5>
      <KeyValueGrid values={values} />
    </section>
  );
}

function KeyValueGrid({ values }: { values: Record<string, unknown> }) {
  return (
    <dl className="divide-y divide-border/40 text-[11px]">
      {Object.entries(values).map(([key, value]) => (
        <div key={key} className="flex items-center justify-between py-1">
          <dt className="text-muted-foreground">{fieldLabels[key] ?? key.replaceAll("_", " ")}</dt>
          <dd dir={idPattern.test(key) || idPattern.test(String(value)) ? "ltr" : undefined} className="font-mono text-foreground font-medium text-end">
            {displayValue(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function FindingCaseSkeleton() {
  return (
    <div className="finding-case-skeleton space-y-4" aria-label="در حال دریافت پرونده یافته">
      <Skeleton className="h-32 w-full rounded-2xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    </div>
  );
}
