"use client";

import { AppIcon } from "@/components/ui/app-icon";
import { Spinner } from "@/components/ui/states";
import Link from "next/link";
import { FileSpreadsheet, ArrowUpLeft, FolderOpen } from "lucide-react";
import { PageHeader } from "@/features/companies/company-view";
import { FilePicker } from "@/components/ui/file-picker";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { count } from "./presentation";

export function BatchProgress({
  completed,
  total,
  name,
}: {
  completed: number;
  total: number;
  name: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center gap-3 rounded-control border border-primary/15 bg-accent/50 p-4"
    >
      <Spinner />
      <p className="min-w-0 flex-1 break-words">{name}</p>
      <span className="text-xs text-primary">
        {count(completed)} از {count(total)} فایل دریافت شد
      </span>
    </div>
  );
}
export type UploadListItem = {
  id: string;
  created: string;
  prepared: string;
  status: string;
  tone: "warning" | "success" | "neutral";
};
export function UploadListView({
  companyId,
  company,
  sessions,
  canOperate,
  onFiles,
  busy,
  error,
  progress,
  onRetry,
  more,
  onMore,
  moreBusy,
}: {
  companyId: string;
  company: string;
  sessions: UploadListItem[];
  canOperate: boolean;
  onFiles: (files: File[]) => void;
  busy: boolean;
  error?: string;
  progress?: { completed: number; total: number; name: string };
  onRetry?: () => void;
  more: boolean;
  onMore: () => void;
  moreBusy: boolean;
}) {
  return (
    <section className="space-y-5 motion-safe:animate-reveal">
      <PageHeader
        icon="UploadCloud"
        title="بارگذاری و پردازش"
        description={company}
      />
      {canOperate ? (
        <FilePicker
          onFiles={onFiles}
          disabled={busy}
          label={busy ? "در حال دریافت…" : "انتخاب فایل‌ها"}
        />
      ) : null}
      {busy && progress ? <BatchProgress {...progress} /> : null}
      <FormMessage>{error}</FormMessage>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry} disabled={busy}>
          <AppIcon name="RefreshCw" />
          تلاش دوباره
        </Button>
      ) : null}
      {sessions.length ? (
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 font-heading text-lg font-medium">
            <AppIcon name="UploadCloud" className="text-primary" />
            بسته‌های بارگذاری
          </h2>
          {sessions.map((session) => (
            <Link
              key={session.id}
              href={`/companies/${companyId}/uploads/${session.id}`}
              prefetch={false}
              className="flex flex-wrap items-center gap-4 rounded-panel border border-border bg-surface p-5 shadow-panel transition-colors duration-200 hover:border-primary/30 focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none"
            >
              <span className="flex size-11 items-center justify-center rounded-control bg-background text-primary">
                <FileSpreadsheet size={22} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">بسته {session.created}</p>
                <p className="mt-1 text-xs text-muted">
                  {session.prepared} فایل آماده
                </p>
              </div>
              <Badge tone={session.tone}>{session.status}</Badge>
              <ArrowUpLeft size={17} className="text-muted" aria-hidden />
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="UploadCloud"
          title="بسته‌ای بارگذاری نشده"
          description={
            canOperate
              ? undefined
              : "بسته‌های شرکت پس از بارگذاری در این بخش دیده می‌شوند."
          }
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {more ? (
          <Button variant="secondary" disabled={moreBusy} onClick={onMore}>
            <AppIcon name="ChevronsDown" />
            بسته‌های بیشتر
          </Button>
        ) : null}
        <Button variant="ghost" asChild>
          <Link href={`/companies/${companyId}/periods`}>
            <FolderOpen size={17} aria-hidden />
            دوره‌های مالی
          </Link>
        </Button>
      </div>
    </section>
  );
}
