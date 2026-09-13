"use client";

import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { API_URL, api } from "@/lib/product-api";
import type { AnalysisRun, Company, ReportSnapshot, ReportStatus } from "@/lib/product-types";

import { Icon } from "./icons";

const statusLabels: Record<ReportStatus, string> = { queued: "در صف تولید", processing: "در حال ساخت PDF", completed: "آماده دریافت", failed: "تولید ناموفق" };
const stageLabels: Record<string, string> = { queued: "در انتظار پردازش", rendering_pdf: "صفحه‌آرایی PDF فارسی", completed: "نسخه نهایی محفوظ شد", failed: "تولید متوقف شد" };
const reportSections = ["وضعیت کلی", "مرور مالی", "یافته‌های مهم", "محرک‌های اصلی", "پوشش داده", "یادداشت‌های مشاور", "وضعیت بررسی", "ضمیمه همه یافته‌ها"];

function faDate(value: string) { return new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "long", day: "numeric" }).format(new Date(`${value}T12:00:00`)); }
function faDateTime(value: string | null) { return value ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "long", timeStyle: "short" }).format(new Date(value)) : "—"; }
function faNumber(value: number) { return new Intl.NumberFormat("fa-IR").format(value); }
function fileSize(value: number | null) { if (value == null) return "—"; if (value >= 1_048_576) return `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(value / 1_048_576)} مگابایت`; return `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(value / 1024)} کیلوبایت`; }
function shortHash(value: string | null) { return value ? `${value.slice(0, 12)}…${value.slice(-8)}` : "—"; }

export function ReportsWorkspace({ company }: { company: Company }) {
  const [analyses, setAnalyses] = useState<AnalysisRun[]>([]);
  const [analysisId, setAnalysisId] = useState("");
  const [reports, setReports] = useState<ReportSnapshot[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [title, setTitle] = useState("گزارش بررسی مالی");
  const [advisorNote, setAdvisorNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const canCreate = company.role !== "viewer";
  const selectedReport = useMemo(() => reports.find((item) => item.id === selectedId) ?? reports[0] ?? null, [reports, selectedId]);
  const selectedAnalysis = analyses.find((item) => item.id === analysisId);

  useEffect(() => {
    let ignore = false;
    async function bootstrap() {
      setLoading(true); setError("");
      try {
        const [analysisResult, reportResult] = await Promise.all([
          api<AnalysisRun[]>(`/companies/${company.id}/analysis-runs?limit=30`),
          api<ReportSnapshot[]>(`/companies/${company.id}/reports?limit=30`),
        ]);
        if (ignore) return;
        const ready = analysisResult.filter((item) => item.status === "completed" || item.status === "completed_limited");
        setAnalyses(ready); setAnalysisId(ready[0]?.id ?? ""); setReports(reportResult); setSelectedId(reportResult[0]?.id ?? "");
      } catch (caught) { if (!ignore) setError(caught instanceof Error ? caught.message : "اطلاعات گزارش‌ها دریافت نشد."); }
      finally { if (!ignore) setLoading(false); }
    }
    void bootstrap();
    return () => { ignore = true; };
  }, [company.id]);

  useEffect(() => {
    if (!selectedReport || !["queued", "processing"].includes(selectedReport.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const current = await api<ReportSnapshot>(`/companies/${company.id}/reports/${selectedReport.id}`);
        setReports((items) => items.map((item) => item.id === current.id ? current : item));
        if (current.status === "completed" || current.status === "failed") { window.clearInterval(timer); setSubmitting(false); if (current.status === "failed") setError(current.failure_message ?? "تولید گزارش ناموفق بود."); }
      } catch (caught) { window.clearInterval(timer); setSubmitting(false); setError(caught instanceof Error ? caught.message : "وضعیت گزارش دریافت نشد."); }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [company.id, selectedReport]);

  async function createReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!analysisId) { setError("ابتدا یک تحلیل تکمیل‌شده انتخاب کنید."); return; }
    setSubmitting(true);
    try {
      const created = await api<ReportSnapshot>(`/companies/${company.id}/reports`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ analysis_run_id: analysisId, title_fa: title, advisor_note: advisorNote.trim() || null }) });
      setReports((items) => [created, ...items.filter((item) => item.id !== created.id)]); setSelectedId(created.id);
    } catch (caught) { setSubmitting(false); setError(caught instanceof Error ? caught.message : "درخواست گزارش ثبت نشد."); }
  }

  if (loading) return <ReportsSkeleton />;

  return <div className="reports-workspace">
    <section className="reports-intro"><div><span className="model-kicker"><Icon name="file" />سند مدیریتی ثابت</span><h2>گزارشی که با داده و تصمیم‌های همین لحظه قفل می‌شود</h2><p>هر نسخه از یک snapshot تکمیل‌شده ساخته می‌شود؛ گزارش‌های بعدی جای نسخه‌های قبلی را نمی‌گیرند.</p></div>{selectedReport ? <div className={`report-head-status status-${selectedReport.status}`}><span><Icon name={selectedReport.status === "completed" ? "check" : selectedReport.status === "failed" ? "alert" : "activity"} /></span><div><small>گزارش انتخاب‌شده</small><strong>{statusLabels[selectedReport.status]}</strong></div></div> : null}</section>
    {error ? <p className="form-error global" role="alert">{error}</p> : null}

    {!analyses.length ? <section className="report-prerequisite"><Icon name="chart" /><div><h3>برای گزارش، یک تحلیل تکمیل‌شده لازم است</h3><p>ابتدا دوره مالی را محاسبه کنید تا اعداد و یافته‌ها در یک snapshot ثابت قرار بگیرند.</p></div><Link className="primary-button" href={`/companies/${company.id}/analysis`}>رفتن به تحلیل مالی</Link></section> : <div className="report-studio">
      <form className="report-composer" onSubmit={(event) => void createReport(event)}><header><div><span>نسخه جدید</span><h3>تنظیم گزارش</h3></div><Icon name="tune" /></header><fieldset disabled={!canCreate || submitting}><label>مبنای گزارش<NativeSelect value={analysisId} onChange={(event) => setAnalysisId(event.target.value)}>{analyses.map((item) => <NativeSelectOption key={item.id} value={item.id}>{faDate(item.period_start)} تا {faDate(item.period_end)} · {item.status === "completed" ? "کامل" : "پوشش محدود"}</NativeSelectOption>)}</NativeSelect></label><label>عنوان گزارش<Input value={title} onChange={(event) => setTitle(event.target.value)} minLength={1} maxLength={200} required /></label><label>یادداشت ویژه این نسخه <span>اختیاری</span><Textarea value={advisorNote} onChange={(event) => setAdvisorNote(event.target.value)} maxLength={4000} rows={5} placeholder="جمع‌بندی یا نکته‌ای که باید در نسخه PDF این گزارش بماند…" /></label><div className="report-compose-meta"><span>{faNumber(advisorNote.length)} / ۴۰۰۰ نویسه</span><strong>{selectedAnalysis ? `${faDate(selectedAnalysis.period_start)} تا ${faDate(selectedAnalysis.period_end)}` : ""}</strong></div><Button className="primary-button" disabled={!canCreate || submitting || !title.trim()}>{submitting ? <><span className="button-spinner" />در حال ساخت گزارش…</> : <><Icon name="file" />ساخت نسخه PDF</>}</Button></fieldset>{!canCreate ? <div className="report-role-note"><Icon name="shield" /><p><strong>دسترسی مشاهده‌گر</strong>مشاهده و دریافت گزارش‌های موجود مجاز است؛ ساخت نسخه جدید به نقش بالاتر نیاز دارد.</p></div> : null}</form>

      <section className="report-blueprint" aria-labelledby="report-blueprint-title"><header><div><span>ساختار ثابت</span><h3 id="report-blueprint-title">محتوای نسخه PDF</h3></div><span className="paper-badge">A4 · فارسی · RTL</span></header><ol>{reportSections.map((section, index) => <li key={section}><span>{new Intl.NumberFormat("fa-IR", { minimumIntegerDigits: 2 }).format(index + 1)}</span><strong>{section}</strong>{index === reportSections.length - 1 ? <small>شامل یافته‌های کم‌اولویت، ردشده و حل‌شده</small> : null}</li>)}</ol><footer><Icon name="shield" /><p><strong>قابل حسابرسی و تغییرناپذیر</strong>اعداد از داشبورد ساخت‌یافته می‌آیند و فایل با SHA-256 ثبت می‌شود.</p></footer></section>
    </div>}

    {selectedReport ? <ReportResult companyId={company.id} report={selectedReport} /> : analyses.length ? <section className="reports-empty"><Icon name="file" /><div><h3>هنوز گزارشی ساخته نشده است</h3><p>عنوان و دوره را کنترل کنید و نخستین نسخه PDF را بسازید.</p></div></section> : null}

    {reports.length ? <section className="report-archive" aria-labelledby="report-archive-title"><header><div><h3 id="report-archive-title">آرشیو نسخه‌ها</h3><p>هر ردیف یک snapshot مستقل و تغییرناپذیر است.</p></div><span>{faNumber(reports.length)} نسخه اخیر</span></header><div className="report-list">{reports.map((report) => <Button key={report.id} className={report.id === selectedReport?.id ? "selected" : ""} onClick={() => setSelectedId(report.id)}><span className={`report-list-icon status-${report.status}`}><Icon name={report.status === "completed" ? "check" : report.status === "failed" ? "alert" : "file"} /></span><span><strong>{report.title_fa}</strong><small>{faDate(report.period_start)} تا {faDate(report.period_end)}</small></span><span><strong>{statusLabels[report.status]}</strong><small>{faDateTime(report.created_at)}</small></span><Icon name="chevron" /></Button>)}</div></section> : null}
  </div>;
}

function ReportResult({ companyId, report }: { companyId: string; report: ReportSnapshot }) {
  const payload = report.payload;
  const availableMetrics = payload.financial_overview.filter((item) => item.available).length;
  return <section className={`report-result status-${report.status}`} aria-labelledby="report-result-title"><header><div><span className="report-document-icon"><Icon name="file" /></span><div><small>نسخه انتخاب‌شده</small><h3 id="report-result-title">{report.title_fa}</h3><p>{faDate(report.period_start)} تا {faDate(report.period_end)} · ساخته‌شده در {faDateTime(report.created_at)}</p></div></div>{report.download_ready ? <a className="primary-button" href={`${API_URL}/companies/${companyId}/reports/${report.id}/download`}><Icon name="download" />دریافت PDF</a> : null}</header>{report.status === "queued" || report.status === "processing" ? <div className="report-progress" aria-live="polite"><div><span>{stageLabels[report.stage] ?? report.stage}</span><strong>{faNumber(report.progress)}٪</strong></div><div><i style={{ width: `${report.progress}%` }} /></div><p>snapshot ثبت شده است؛ ترک صفحه روند تولید را متوقف نمی‌کند.</p></div> : report.status === "failed" ? <div className="report-failed"><Icon name="alert" /><p><strong>ساخت این نسخه کامل نشد</strong>{report.failure_message ?? "خطای ثبت‌شده را بررسی و نسخه تازه‌ای ایجاد کنید."}</p></div> : <><div className="report-snapshot-summary"><div><span>وضعیت مالی</span><strong>{payload.overall_status.summary_fa}</strong></div><div><span>شاخص قابل محاسبه</span><strong>{faNumber(availableMetrics)} از {faNumber(payload.financial_overview.length)}</strong></div><div><span>یافته مهم</span><strong>{faNumber(payload.top_findings.length)}</strong></div><div><span>کل یافته در ضمیمه</span><strong>{faNumber(payload.all_findings.length)}</strong></div><div><span>یادداشت مشاور</span><strong>{faNumber(payload.advisor_notes.length + (payload.advisor_note ? 1 : 0))}</strong></div><div><span>پوشش داده</span><strong>{faNumber(payload.data_coverage.overall_score)}٪</strong></div></div><div className="report-artifact-meta"><div><span>حجم فایل</span><strong>{fileSize(report.pdf_size_bytes)}</strong></div><div><span>اثر انگشت فایل</span><code dir="ltr" title={report.pdf_sha256 ?? undefined}>{shortHash(report.pdf_sha256)}</code></div><div><span>زمان تکمیل</span><strong>{faDateTime(report.completed_at)}</strong></div><div><span>نسخه ساختار</span><code dir="ltr">{payload.schema_version}</code></div></div></>}</section>;
}

function ReportsSkeleton() { return <div className="reports-skeleton" aria-label="در حال دریافت گزارش‌ها"><span /><div><span /><span /></div><span /></div>; }
