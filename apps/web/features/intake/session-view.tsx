"use client";

import { AppIcon } from "@/components/ui/app-icon";
import { Spinner } from "@/components/ui/states";
import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  FileSpreadsheet,
  ArrowUpLeft,
  MessageCircle,
  Check,
  Clock3,
  XCircle,
} from "lucide-react";
import type { Schema } from "@didban/api-client";
import { PageHeader } from "@/features/companies/company-view";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, ConfirmDialog } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Field, FormMessage } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { FilePicker } from "@/components/ui/file-picker";
import { StatusMessage } from "@/components/ui/states";
import { BatchProgress } from "./uploads-view";
import {
  ProcessingProgress,
  type ProcessingStage,
} from "@/components/ui/processing-progress";

export type FileDisplay = {
  id: string;
  name: string;
  size: string;
  status: string;
  rows?: string;
  error?: string;
  busy: boolean;
  prepared: boolean;
  rejected: boolean;
  href?: string;
  summary?: string;
};
export function SessionView({
  companyId,
  review,
  title,
  state,
  files,
  processingStages,
  completed,
  canOperate,
  receiving,
  canCancel,
  canRetry,
  prepared,
  dependency,
  onFiles,
  onSeal,
  onCancel,
  onRetry,
  onQuestion,
  question,
  commandBusy,
  error,
  uploadBusy,
  progress,
  onUploadRetry,
  onInterpret,
  interpretLabel = "ادامه تفسیر فایل‌ها",
  onCalculate,
  financialFinished,
  analysisFinished,
  onAnalyze,
  resultHref,
  reportHref,
  purpose = "upload",
}: {
  review?: ReactNode;
  onCalculate?: () => void;
  onAnalyze?: () => void;
  analysisFinished: boolean;
  financialFinished: boolean;
  resultHref?: string;
  reportHref?: string;
  purpose?: "upload" | "forecast";
  onInterpret?: () => void;
  interpretLabel?: string;
  companyId: string;
  title: string;
  state: string;
  files: FileDisplay[];
  processingStages: ProcessingStage[];
  completed: string;
  canOperate: boolean;
  receiving: boolean;
  canCancel: boolean;
  canRetry: boolean;
  prepared: boolean;
  dependency?: string;
  onFiles: (files: File[]) => void;
  onSeal: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onQuestion: () => void;
  question: boolean;
  commandBusy: boolean;
  error?: string;
  uploadBusy: boolean;
  progress?: { completed: number; total: number; name: string };
  onUploadRetry?: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <section className="space-y-5 motion-safe:animate-reveal">
      <PageHeader
        icon="TrendingUp"
        title={purpose === "forecast" ? "بازبینی پیش‌بینی" : "پرونده بارگذاری"}
        description={title}
        action={
          <Button asChild variant="ghost">
            <Link href={`/companies/${companyId}/uploads`}>
              همه بسته‌ها
              <ArrowUpLeft size={16} aria-hidden />
            </Link>
          </Button>
        }
      />
      <div className="rounded-summary border border-primary/10 bg-linear-to-l from-accent to-surface p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-surface text-primary">
              <FileSpreadsheet size={24} aria-hidden />
            </span>
            <div>
              <h2 className="font-heading text-lg font-medium">{state}</h2>
              <p className="mt-1 text-xs text-muted">{completed}</p>
            </div>
          </div>
          {question ? (
            <Button onClick={onQuestion} variant="secondary">
              <MessageCircle size={17} aria-hidden />
              مشاهده سؤال
            </Button>
          ) : null}
        </div>
        {dependency ? (
          <p className="mt-5 text-warning" role="status">
            {dependency}
          </p>
        ) : null}
        {financialFinished && resultHref ? (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {reportHref ? (
              <Button asChild>
                <Link href={reportHref}>
                  <AppIcon name="ClipboardList" />
                  گزارش و خروجی‌ها
                </Link>
              </Button>
            ) : null}
            <Button asChild>
              <Link href={resultHref}>
                مشاهده نتایج مالی
                <ArrowUpLeft size={16} aria-hidden />
              </Link>
            </Button>
            {analysisFinished ? (
              <Button asChild variant="secondary">
                <Link href={`/companies/${companyId}/cashflow/forecast`}>
                  <AppIcon name="TrendingUp" />
                  پیش‌بینی نقدینگی
                </Link>
              </Button>
            ) : onAnalyze && canOperate ? (
              <Button
                variant="secondary"
                disabled={commandBusy}
                onClick={onAnalyze}
              >
                <AppIcon name="Activity" />
                ادامه تحلیل حوزه‌های مالی
              </Button>
            ) : null}
          </div>
        ) : prepared && !review ? (
          <p className="mt-5 text-sm text-muted">
            داده‌های استاندارد آماده محاسبات مالی هستند.
          </p>
        ) : null}
      </div>
      {review}
      <ProcessingProgress stages={processingStages} />
      {receiving && canOperate ? (
        <FilePicker
          onFiles={onFiles}
          disabled={uploadBusy}
          label="تکمیل فایل‌های بسته"
        />
      ) : null}
      {uploadBusy && progress ? <BatchProgress {...progress} /> : null}
      <FormMessage>{error}</FormMessage>
      {onUploadRetry ? (
        <Button
          variant="secondary"
          onClick={onUploadRetry}
          disabled={uploadBusy}
        >
          <AppIcon name="RefreshCw" />
          تلاش دوباره دریافت
        </Button>
      ) : null}
      <div className="space-y-3">
        {files.map((file) => (
          <article
            key={file.id}
            className="flex flex-wrap items-start gap-4 rounded-panel border border-border bg-surface p-5 shadow-panel"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-background text-primary">
              {file.prepared ? (
                <Check size={21} aria-hidden />
              ) : file.rejected ? (
                <XCircle size={21} className="text-danger" aria-hidden />
              ) : file.busy ? (
                <Spinner />
              ) : (
                <Clock3 size={21} aria-hidden />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="break-words font-medium">
                {file.href ? (
                  <Link
                    href={file.href}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {file.name}
                  </Link>
                ) : (
                  file.name
                )}
              </h3>
              <p className="mt-1 text-xs text-muted">
                {file.size}
                {file.rows ? ` · ${file.rows} ردیف خوانده‌شده` : ""}
              </p>
              {file.summary ? (
                <p className="mt-2 text-xs text-muted">{file.summary}</p>
              ) : null}
              {file.error ? (
                <p className="mt-2 text-danger">{file.error}</p>
              ) : null}
            </div>
            <Badge
              tone={
                file.rejected
                  ? "warning"
                  : file.prepared
                    ? "success"
                    : "neutral"
              }
            >
              {file.status}
            </Badge>
          </article>
        ))}
      </div>
      {canOperate ? (
        <div className="flex flex-wrap justify-end gap-3">
          {onInterpret ? (
            <Button onClick={onInterpret} disabled={commandBusy}>
              {interpretLabel}
            </Button>
          ) : null}
          {onCalculate ? (
            <Button onClick={onCalculate} disabled={commandBusy}>
              محاسبه نتایج مالی
            </Button>
          ) : null}
          {receiving && files.length > 0 ? (
            <Button onClick={onSeal} disabled={commandBusy || uploadBusy}>
              <AppIcon name="Activity" />
              ادامه آماده‌سازی همین فایل‌ها
            </Button>
          ) : null}
          {canRetry ? (
            <Button
              onClick={onRetry}
              variant="secondary"
              disabled={commandBusy}
            >
              <AppIcon name="RefreshCw" />
              تلاش دوباره پردازش
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              onClick={() => setConfirm(true)}
              variant="ghost"
              disabled={commandBusy || uploadBusy}
            >
              لغو بسته
            </Button>
          ) : null}
        </div>
      ) : null}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="پردازش بسته لغو شود؟"
        description="فایل‌های دریافت‌شده و سوابق حفظ می‌شوند."
        busy={commandBusy}
        onConfirm={() => {
          onCancel();
          setConfirm(false);
        }}
      />
      {!canOperate && question ? (
        <StatusMessage>
          برای پاسخ به سؤال، دسترسی عملیاتی لازم است.
        </StatusMessage>
      ) : null}
    </section>
  );
}
export function QuestionDialog({
  issue,
  open,
  onOpenChange,
  onSubmit,
  busy,
  error,
  canAnswer,
  options,
  label,
  mappingHref,
  periodsHref,
}: {
  options: { value: string; label: string }[];
  label: string;
  mappingHref?: string;
  periodsHref?: string;
  issue: Schema<"ProcessingIssue">;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  error?: string;
  canAnswer: boolean;
}) {
  const [value, setValue] = useState("");
  return (
    <Dialog
      icon="MessageCircle"
      open={open}
      onOpenChange={onOpenChange}
      title="برای ادامه، پاسخ شما لازم است"
      description={issue.question_fa}
      busy={busy}
    >
      <Form onSubmit={onSubmit} className="space-y-5">
        {mappingHref ? (
          <Button asChild variant="secondary" disabled={!canAnswer}>
            <Link href={mappingHref}>
              <AppIcon name="SlidersHorizontal" />
              تنظیم ستون‌ها
            </Link>
          </Button>
        ) : (
          <Field icon="UploadCloud" id="question-value" label={label}>
            <Select
              id="question-value"
              name="value"
              value={value}
              onValueChange={setValue}
              disabled={!canAnswer}
              options={options}
            />
          </Field>
        )}
        {periodsHref ? (
          <Button asChild variant="ghost">
            <Link href={periodsHref}>
              <AppIcon name="CalendarRange" />
              مدیریت دوره‌های مالی
            </Link>
          </Button>
        ) : null}
        <StatusMessage>تا دریافت پاسخ، کل بسته متوقف می‌ماند.</StatusMessage>
        <FormMessage>{error}</FormMessage>
        {!mappingHref ? (
          <Button
            className="w-full"
            type="submit"
            disabled={busy || !canAnswer || !value}
          >
            <AppIcon name="Save" />
            {busy ? "در حال ثبت…" : "ثبت پاسخ و ادامه"}
          </Button>
        ) : null}
      </Form>
    </Dialog>
  );
}
