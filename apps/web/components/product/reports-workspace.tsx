"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  BarChart3,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Fingerprint,
  HardDrive,
  Layers,
  Lock,
  Plus,
  Printer,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
} from "@/components/ui/icons";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { StatusChip, toPersianDigits } from "@/components/ui/financial";

import { API_URL, api } from "@/lib/product-api";
import type {
  AnalysisRun,
  Company,
  ReportSnapshot,
  ReportStatus,
} from "@/lib/product-types";

const statusLabels: Record<ReportStatus, string> = {
  queued: "در صف تولید",
  processing: "در حال صفحه‌آرایی PDF",
  completed: "آماده دریافت",
  failed: "تولید ناموفق",
};

const stageLabels: Record<string, string> = {
  queued: "در انتظار پردازش",
  rendering_pdf: "صفحه‌آرایی و ساخت فونت فارسی PDF",
  completed: "نسخه نهایی قفل و محفوظ شد",
  failed: "تولید متوقف شد",
};

const reportSections = [
  "وضعیت کلی سلامت مالی و خلاصه اجرایی",
  "مرور مالی و سرمایه در گردش (Runway, DSO, DPO, CCC)",
  "یافته‌های بااولویت و شواهد حسابرسی",
  "محرک‌های اصلی سودآوری و بهای تمام‌شده",
  "پوشش داده و مرزهای اتکاپذیری",
  "یادداشت‌ها و راهبردهای مشاور مالی",
  "وضعیت بررسی‌های انسانی و تصمیم‌گیری‌ها",
  "ضمیمه کامل شواهد و جزئیات یافته‌ها",
];

function faDate(value: string) {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(`${value}T12:00:00`));
  } catch {
    return value;
  }
}

function faDateTime(value: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function fileSize(value: number | null) {
  if (value == null) return "—";
  if (value >= 1_048_576) {
    return `${toPersianDigits((value / 1_048_576).toFixed(1))} مگابایت`;
  }
  return `${toPersianDigits(Math.round(value / 1024))} کیلوبایت`;
}

function shortHash(value: string | null) {
  return value ? `${value.slice(0, 10)}…${value.slice(-8)}` : "—";
}

export function ReportsWorkspace({ company }: { company: Company }) {
  const [analyses, setAnalyses] = useState<AnalysisRun[]>([]);
  const [analysisId, setAnalysisId] = useState("");
  const [reports, setReports] = useState<ReportSnapshot[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [title, setTitle] = useState("گزارش تحلیلی هیئت مدیره و خزانه‌داری");
  const [advisorNote, setAdvisorNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canCreate = company.role !== "viewer";
  const selectedReport = useMemo(
    () => reports.find((item) => item.id === selectedId) ?? reports[0] ?? null,
    [reports, selectedId],
  );
  const selectedAnalysis = analyses.find((item) => item.id === analysisId);

  useEffect(() => {
    let ignore = false;
    async function bootstrap() {
      setLoading(true);
      setError("");
      try {
        const [analysisResult, reportResult] = await Promise.all([
          api<AnalysisRun[]>(`/companies/${company.id}/analysis-runs?limit=30`),
          api<ReportSnapshot[]>(`/companies/${company.id}/reports?limit=30`),
        ]);
        if (ignore) return;
        const ready = analysisResult.filter(
          (item) =>
            item.status === "completed" || item.status === "completed_limited",
        );
        setAnalyses(ready);
        setAnalysisId(ready[0]?.id ?? "");
        setReports(reportResult);
        setSelectedId(reportResult[0]?.id ?? "");
      } catch (caught) {
        if (!ignore) {
          setError(
            caught instanceof Error
              ? caught.message
              : "اطلاعات گزارش‌ها دریافت نشد.",
          );
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void bootstrap();
    return () => {
      ignore = true;
    };
  }, [company.id]);

  useEffect(() => {
    if (
      !selectedReport ||
      !["queued", "processing"].includes(selectedReport.status)
    )
      return;
    const timer = window.setInterval(async () => {
      try {
        const current = await api<ReportSnapshot>(
          `/companies/${company.id}/reports/${selectedReport.id}`,
        );
        setReports((items) =>
          items.map((item) => (item.id === current.id ? current : item)),
        );
        if (current.status === "completed" || current.status === "failed") {
          window.clearInterval(timer);
          setSubmitting(false);
          if (current.status === "completed") {
            toast.success("نسخه PDF گزارش با موفقیت تولید و آماده دریافت شد.");
          }
          if (current.status === "failed") {
            setError(current.failure_message ?? "تولید گزارش ناموفق بود.");
          }
        }
      } catch (caught) {
        window.clearInterval(timer);
        setSubmitting(false);
        setError(
          caught instanceof Error ? caught.message : "وضعیت گزارش دریافت نشد.",
        );
      }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [company.id, selectedReport]);

  async function createReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!analysisId) {
      setError("ابتدا یک تحلیل تکمیل‌شده را به عنوان مبنا انتخاب کنید.");
      return;
    }
    setSubmitting(true);
    try {
      const created = await api<ReportSnapshot>(
        `/companies/${company.id}/reports`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({
            analysis_run_id: analysisId,
            title_fa: title,
            advisor_note: advisorNote.trim() || null,
          }),
        },
      );
      setReports((items) => [
        created,
        ...items.filter((item) => item.id !== created.id),
      ]);
      setSelectedId(created.id);
      toast.info("فرآیند تولید گزارش PDF در صف پردازش قرار گرفت.");
    } catch (caught) {
      setSubmitting(false);
      setError(
        caught instanceof Error ? caught.message : "درخواست گزارش ثبت نشد.",
      );
    }
  }

  if (loading) return <ReportsSkeleton />;

  return (
    <div className="pp-page pp-reports space-y-6 pb-12" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[var(--ds-border)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-bold tracking-normal text-[var(--ds-card-fg)]">
              گزارش‌ها، آمادهٔ بررسی و ارائه
            </h1>
            <Badge
              variant="outline"
              className="bg-primary/5 text-primary border-primary/20 text-xs"
            >
              گزارش‌های مستند با شناسه رهگیری
            </Badge>
          </div>
        </div>

        {selectedReport && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-[var(--ds-muted-fg)] bg-[var(--ds-muted-bg)] px-3 py-1.5 rounded-lg border border-[var(--ds-border)]">
              <Lock className="size-3.5 text-primary" />
              <span>وضعیت سند:</span>
              <span className="font-semibold text-[var(--ds-card-fg)]">
                {statusLabels[selectedReport.status]}
              </span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="text-xs">
          {error}
        </Alert>
      )}

      {/* Prerequisite check */}
      {!analyses.length ? (
        <Card className="border-dashed border-[var(--ds-border)] p-8 text-center">
          <CardContent className="flex flex-col items-center justify-center space-y-3 pt-6">
            <BarChart3 className="size-10 text-muted-foreground" />
            <h3 className="font-bold text-base text-foreground">
              برای ساخت گزارش، ابتدا یک تحلیل مالی محاسبه‌شده لازم است
            </h3>
            <p className="text-xs text-muted-foreground max-w-md">
              ابتدا دوره مالی را در بخش تحلیل مالی اجرا کنید تا داده‌ها و
              یافته‌ها در قالب یک تصویر ساخت‌یافته (Snapshot) ثبت شوند.
            </p>
            <Button asChild className="mt-2">
              <Link href={`/companies/${company.id}/reports/analysis`}>
                رفتن به بخش تحلیل مالی
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Form Composer (7 cols) */}
          <Card className="pp-report-composer lg:col-span-7 border-[var(--ds-border)] bg-[var(--ds-card)] shadow-xs">
            <CardHeader className="pb-3 border-b border-[var(--ds-border)]">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Plus className="size-4 text-primary" />
                    ساخت گزارش جدید
                  </CardTitle>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-4">
              <form onSubmit={createReport} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground block">
                    دوره مالی مبنای گزارش
                  </label>
                  <Select
                    value={analysisId}
                    onValueChange={setAnalysisId}
                    dir="rtl"
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="انتخاب دوره مالی..." />
                    </SelectTrigger>
                    <SelectContent>
                      {analyses.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {faDate(item.period_start)} تا{" "}
                          {faDate(item.period_end)} ·{" "}
                          {item.status === "completed"
                            ? "داده کامل"
                            : "پوشش محدود"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground block">
                    عنوان رسمی گزارش
                  </label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    maxLength={200}
                    placeholder="مثال: گزارش تحلیلی هیئت مدیره - دوره ۶ ماهه اول"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground block">
                      یادداشت تفسیری مشاور و توصیه‌ها (اختیاری)
                    </label>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {toPersianDigits(advisorNote.length)} / ۴۰۰۰
                    </span>
                  </div>
                  <Textarea
                    value={advisorNote}
                    onChange={(e) => setAdvisorNote(e.target.value)}
                    rows={4}
                    maxLength={4000}
                    placeholder="جمع‌بندی تحلیلی، نقاط قوت و ضعف عملکرد مالی، یا توصیه‌هایی که باید در نسخه چاپی هیئت مدیره درج شود..."
                  />
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={!canCreate || submitting || !title.trim()}
                    className="w-full gap-2"
                  >
                    {submitting ? (
                      <>
                        <RefreshCcw className="size-4 animate-spin" />
                        در حال ثبت و ارسال به صف تولید PDF…
                      </>
                    ) : (
                      <>
                        <FileText className="size-4" />
                        تولید و قفل سند PDF هیئت مدیره
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Right Column: PDF Structure Blueprint (5 cols) */}
          <Card className="pp-report-outline lg:col-span-5 border-[var(--ds-border)] bg-[var(--ds-card)] shadow-xs">
            <CardHeader className="pb-3 border-b border-[var(--ds-border)]">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <FileCheck2 className="size-4 text-primary" />
                    در این گزارش
                  </CardTitle>
                </div>
                <Badge
                  variant="outline"
                  className="text-[11px] bg-primary/5 text-primary border-primary/20"
                >
                  A4 · فارسی · RTL
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="pt-4 space-y-2.5">
              {reportSections.map((sec, idx) => (
                <div
                  key={sec}
                  className="flex items-center gap-2.5 text-xs p-2 rounded-lg bg-[var(--ds-muted-bg)]/40 border border-[var(--ds-border)]/50"
                >
                  <span className="size-5 rounded-full bg-primary/10 text-primary flex items-center justify-center font-mono font-bold text-[10px] shrink-0">
                    {toPersianDigits(idx + 1)}
                  </span>
                  <span className="font-medium text-foreground">{sec}</span>
                </div>
              ))}
            </CardContent>

            <CardFooter className="pt-2 pb-4 text-[11px] text-muted-foreground border-t border-[var(--ds-border)] flex items-center gap-2">
              <ShieldCheck className="size-4 text-ds-success shrink-0" />
              <span>
                سند با شناسه SHA-256 رمزنگاری شده و داده‌های آن تغییرناپذیر است.
              </span>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* Selected Report Result Viewer */}
      {selectedReport && (
        <Card className="border-[var(--ds-border)] bg-[var(--ds-card)] shadow-xs">
          <CardHeader className="pb-4 border-b border-[var(--ds-border)]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-[var(--ds-card-radius)] bg-primary/10 text-primary shrink-0 mt-0.5">
                  <FileText className="size-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-bold text-foreground">
                      {selectedReport.title_fa}
                    </CardTitle>
                    <Badge variant="outline" className="text-xs">
                      {statusLabels[selectedReport.status]}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    دوره تحلیلی: {faDate(selectedReport.period_start)} تا{" "}
                    {faDate(selectedReport.period_end)} | زمان ثبت:{" "}
                    {faDateTime(selectedReport.created_at)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => window.print()}
                  className="gap-2"
                  title="چاپ نسخه رسمی یا ذخیره با فرمت PDF"
                >
                  <Printer className="size-3.5" />
                  <span>چاپ رسمی (Print / PDF)</span>
                </Button>
                {selectedReport.download_ready && (
                  <Button asChild size="sm" className="gap-2">
                    <a
                      href={`${API_URL}/companies/${company.id}/reports/${selectedReport.id}/download`}
                    >
                      <Download className="size-3.5" />
                      دریافت فایل چاپی PDF
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-5 space-y-5">
            {/* Progress bar if generating */}
            {(selectedReport.status === "queued" ||
              selectedReport.status === "processing") && (
              <div className="p-4 rounded-[var(--ds-card-radius)] border border-[var(--ds-border)] bg-muted/30 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground flex items-center gap-2">
                    <RefreshCcw className="size-3.5 animate-spin text-primary" />
                    {stageLabels[selectedReport.stage] ?? selectedReport.stage}
                  </span>
                  <span className="font-mono font-bold">
                    {toPersianDigits(selectedReport.progress)}٪
                  </span>
                </div>
                <Progress value={selectedReport.progress} className="h-2" />
                <p className="text-[11px] text-muted-foreground">
                  عملیات در سرور انجام می‌شود؛ بستن این صفحه فرآیند ساخت را
                  متوقف نمی‌کند.
                </p>
              </div>
            )}

            {/* Completed Snapshot Stats */}
            {selectedReport.status === "completed" && (
              <div className="space-y-4">
                {/* 6 Metric Quick Stats */}
                <div className="pp-metric-strip pp-metric-strip-six grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="p-3 rounded-lg bg-muted/40 border border-[var(--ds-border)]">
                    <span className="text-[11px] text-muted-foreground block">
                      وضعیت سلامت
                    </span>
                    <strong className="text-xs font-bold text-foreground block mt-1">
                      {selectedReport.payload.overall_status.summary_fa}
                    </strong>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40 border border-[var(--ds-border)]">
                    <span className="text-[11px] text-muted-foreground block">
                      شاخص‌های محاسباتی
                    </span>
                    <strong className="text-xs font-bold text-foreground block mt-1">
                      {toPersianDigits(
                        selectedReport.payload.financial_overview.filter(
                          (m) => m.available,
                        ).length,
                      )}{" "}
                      از{" "}
                      {toPersianDigits(
                        selectedReport.payload.financial_overview.length,
                      )}
                    </strong>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40 border border-[var(--ds-border)]">
                    <span className="text-[11px] text-muted-foreground block">
                      یافته‌های بااولویت
                    </span>
                    <strong className="text-xs font-bold text-foreground block mt-1">
                      {toPersianDigits(
                        selectedReport.payload.top_findings.length,
                      )}{" "}
                      یافته
                    </strong>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40 border border-[var(--ds-border)]">
                    <span className="text-[11px] text-muted-foreground block">
                      کل یافته‌ها در ضمیمه
                    </span>
                    <strong className="text-xs font-bold text-foreground block mt-1">
                      {toPersianDigits(
                        selectedReport.payload.all_findings.length,
                      )}{" "}
                      ردیف
                    </strong>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40 border border-[var(--ds-border)]">
                    <span className="text-[11px] text-muted-foreground block">
                      یادداشت‌های مشاور
                    </span>
                    <strong className="text-xs font-bold text-foreground block mt-1">
                      {toPersianDigits(
                        selectedReport.payload.advisor_notes.length +
                          (selectedReport.payload.advisor_note ? 1 : 0),
                      )}
                    </strong>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40 border border-[var(--ds-border)]">
                    <span className="text-[11px] text-muted-foreground block">
                      پوشش داده
                    </span>
                    <strong className="text-xs font-bold text-foreground block mt-1">
                      {toPersianDigits(
                        Math.round(
                          selectedReport.payload.data_coverage.overall_score,
                        ),
                      )}
                      ٪
                    </strong>
                  </div>
                </div>

                {/* Audit & Security Meta */}
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs p-3 rounded-lg bg-[var(--ds-muted-bg)]/40 border border-[var(--ds-border)]">
                  <div className="flex items-center gap-2">
                    <HardDrive className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">حجم فایل PDF:</span>
                    <span className="font-semibold text-foreground font-mono">
                      {fileSize(selectedReport.pdf_size_bytes)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Fingerprint className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      اثر انگشت SHA-256:
                    </span>
                    <code className="font-mono text-[11px] bg-background px-2 py-0.5 rounded border">
                      {shortHash(selectedReport.pdf_sha256)}
                    </code>
                  </div>

                  <div className="flex items-center gap-2">
                    <Clock className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">تکمیل سند:</span>
                    <span className="font-semibold text-foreground">
                      {faDateTime(selectedReport.completed_at)}
                    </span>
                  </div>
                </div>

                {/* OFFICIAL IRANIAN PRINT LETTERHEAD & STATEMENT SHEET */}
                <div className="rounded-[var(--ds-card-radius)] border border-[var(--ds-border)] p-6 bg-card space-y-6 print:border-none print:p-0 print:m-0 print:space-y-6">
                  {/* Official Corporate Letterhead */}
                  <div className="border-b-2 border-primary/40 pb-4 flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                          <Building2 className="size-5" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-foreground">
                            {company.legal_name || "دیدبان مالی"}
                          </h3>
                          <span className="text-xs text-muted-foreground">
                            صورت‌های نظارتی و گزارش مدیریتی
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground pt-1">
                        شناسه ملی: {toPersianDigits(company.national_id ?? "—")}{" "}
                        | واحد سنجش:{" "}
                        {company.currency === "IRR"
                          ? "ریال ایران"
                          : company.currency}
                      </p>
                    </div>

                    <div className="text-left text-xs space-y-1 text-muted-foreground font-mono">
                      <div>
                        شماره سند:{" "}
                        <span className="font-bold text-foreground">
                          {selectedReport.id.slice(0, 8)}
                        </span>
                      </div>
                      <div>
                        تاریخ گزارش:{" "}
                        <span className="font-bold text-foreground">
                          {faDate(selectedReport.created_at.slice(0, 10))}
                        </span>
                      </div>
                      <div>
                        دوره مالی:{" "}
                        <span className="font-bold text-foreground">
                          {faDate(selectedReport.period_start)} تا{" "}
                          {faDate(selectedReport.period_end)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Statement Title */}
                  <div className="text-center py-1 space-y-1">
                    <h2 className="text-base sm:text-lg font-bold text-foreground tracking-normal">
                      {selectedReport.title_fa}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      خلاصه اجرایی شاخص‌های کلیدی، وضعیت سلامت خزانه و ارزیابی
                      ریسک‌های بااهمیت
                    </p>
                  </div>

                  {/* Key Financial Metrics Table */}
                  <div className="rounded-lg border border-border overflow-hidden print-avoid-break">
                    <table className="w-full text-xs text-right divide-y divide-border">
                      <thead className="bg-muted/50 font-bold text-muted-foreground">
                        <tr>
                          <th className="p-2.5">عنوان شاخص مالی</th>
                          <th className="p-2.5 text-left">مقدار محاسبه‌شده</th>
                          <th className="p-2.5">تحلیل و وضعیت نظارتی</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        <tr>
                          <td className="p-2.5 font-medium">سلامت کلان مالی</td>
                          <td className="p-2.5 text-left font-bold text-foreground">
                            {selectedReport.payload.overall_status.summary_fa}
                          </td>
                          <td className="p-2.5 text-muted-foreground">
                            پوشش اتکاپذیری داده:{" "}
                            {toPersianDigits(
                              Math.round(
                                selectedReport.payload.data_coverage
                                  .overall_score,
                              ),
                            )}
                            ٪
                          </td>
                        </tr>
                        {selectedReport.payload.financial_overview
                          .slice(0, 5)
                          .map((metric) => (
                            <tr key={metric.metric_code}>
                              <td className="p-2.5 font-medium">
                                {metric.label_fa}
                              </td>
                              <td
                                className="p-2.5 text-left font-mono font-bold text-foreground"
                                dir="ltr"
                              >
                                {metric.value != null
                                  ? toPersianDigits(
                                      Number(metric.value).toLocaleString(
                                        "fa-IR",
                                      ),
                                    )
                                  : "—"}
                              </td>
                              <td className="p-2.5 text-muted-foreground">
                                {metric.available
                                  ? "محاسبه‌شده و معتبر"
                                  : metric.unavailable_reason_fa ||
                                    "عدم کفایت داده"}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Advisor Interpretation */}
                  {(selectedReport.advisor_note ||
                    selectedReport.payload.advisor_note?.body) && (
                    <div className="p-3.5 rounded-lg bg-muted/40 border border-border text-xs space-y-1.5 print-avoid-break">
                      <span className="font-bold text-foreground block">
                        جمع‌بندی و توصیه‌های راهبردی مشاور مالی:
                      </span>
                      <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {selectedReport.advisor_note ||
                          selectedReport.payload.advisor_note?.body}
                      </p>
                    </div>
                  )}

                  {/* Official 3-Party Signatures Row */}
                  <div className="pt-6 border-t border-border grid grid-cols-3 gap-4 text-center text-xs print-avoid-break">
                    <div className="space-y-14">
                      <span className="font-bold text-foreground block">
                        مدیر / مشاور ارشد مالی
                      </span>
                      <div className="text-[11px] text-muted-foreground border-t border-dashed border-border pt-1">
                        امضاء و مهر واحد مالی
                      </div>
                    </div>
                    <div className="space-y-14">
                      <span className="font-bold text-foreground block">
                        حسابرس و بازرس قانونی
                      </span>
                      <div className="text-[11px] text-muted-foreground border-t border-dashed border-border pt-1">
                        امضاء و تاییدیه انطباق
                      </div>
                    </div>
                    <div className="space-y-14">
                      <span className="font-bold text-foreground block">
                        مدیرعامل / هیئت مدیره
                      </span>
                      <div className="text-[11px] text-muted-foreground border-t border-dashed border-border pt-1">
                        تصویب و ابلاغ نهایی
                      </div>
                    </div>
                  </div>

                  {/* Official Legal Footer */}
                  <div className="text-center text-[10px] text-muted-foreground pt-4 border-t border-border/40 font-mono">
                    این سند رسمی با رعایت الزامات گزارشگری استاندارد توسط سامانه
                    هوشمند «دیدبان مالی» تهیه گردیده است.
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Report Archive List */}
      {reports.length > 0 && (
        <Card className="pp-report-archive border-[var(--ds-border)] bg-[var(--ds-card)] shadow-xs">
          <CardHeader className="pb-3 border-b border-[var(--ds-border)]">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Layers className="size-4 text-primary" />
                  آرشیو گزارش‌های صادرشده
                </CardTitle>
              </div>
              <Badge variant="outline" className="text-xs">
                {toPersianDigits(reports.length)} نسخه بایگانی‌شده
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="pt-3">
            <div className="divide-y divide-[var(--ds-border)]">
              {reports.map((report) => {
                const isSelected = report.id === selectedReport?.id;
                return (
                  <Button
                    variant="surface"
                    size="auto"
                    motion="none"
                    key={report.id}
                    type="button"
                    onClick={() => setSelectedId(report.id)}
                    className={`w-full flex items-center justify-between gap-4 py-3 px-3 rounded-lg transition-colors text-right ${
                      isSelected
                        ? "bg-primary/5 border border-primary/20"
                        : "hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${
                          report.status === "completed"
                            ? "bg-ds-success/10 text-ds-success"
                            : report.status === "failed"
                              ? "bg-ds-danger/10 text-ds-danger"
                              : "bg-ds-warning/10 text-ds-warning"
                        }`}
                      >
                        <FileText className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <strong className="text-xs font-bold text-foreground block truncate">
                          {report.title_fa}
                        </strong>
                        <span className="text-[11px] text-muted-foreground block mt-0.5">
                          {faDate(report.period_start)} تا{" "}
                          {faDate(report.period_end)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-left hidden sm:block">
                        <span className="text-xs font-semibold text-foreground block">
                          {statusLabels[report.status]}
                        </span>
                        <span className="text-[10px] text-muted-foreground block">
                          {faDateTime(report.created_at)}
                        </span>
                      </div>
                      <ChevronLeft className="size-4 text-muted-foreground" />
                    </div>
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ReportsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" dir="rtl">
      <div className="h-10 w-48 bg-muted rounded" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 h-64 bg-muted rounded-[var(--ds-card-radius)]" />
        <div className="lg:col-span-5 h-64 bg-muted rounded-[var(--ds-card-radius)]" />
      </div>
      <div className="h-48 bg-muted rounded-[var(--ds-card-radius)]" />
    </div>
  );
}
