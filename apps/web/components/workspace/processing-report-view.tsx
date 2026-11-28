"use client";
import { DownloadSimpleIcon, FileXlsIcon, FolderOpenIcon as HeaderIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  StatusMessage,
} from "@/components/ui/content-states";
import { ConfirmDialog } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/field";
import { useProcessingReport } from "@/hooks/use-processing-report";
import { displayDate, persian } from "@/lib/utils";
import { NoCompany, PageHeader, Panel } from "./page-parts";
import { QuestionDialog } from "./question-dialog";

export function ProcessingReportView({ id }: { id: string }) {
  const report = useProcessingReport(id);
  const { workspace, resource, session, issue } = report;
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const scope = `${workspace.user?.id}:${workspace.company?.id}:${id}`;
  const cancelOpen = cancelTarget === scope;
  if (!workspace.company) return <NoCompany />;
  if (resource.loading) return <LoadingState />;
  if (resource.error)
    return (
      <ErrorState message={resource.error.message} />
    );
  if (!session) {
    return (
      <>
        <PageHeader icon={HeaderIcon} title="گزارش پردازش فایل" />
        <EmptyState title="فایل یا گزارش پردازش پیدا نشد" />
      </>
    );
  }
  return (
    <>
      <PageHeader icon={HeaderIcon} title="گزارش پردازش فایل" />
      <Panel
        title={displayDate(session.created_at)}
        action={session.state === "receiving" ? <Badge>بارگذاری ناتمام</Badge> : <StatusBadge status={session.state} />}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span className="text-muted">
            {report.periodName || "دوره انتخاب نشده"}
          </span>
          <span className="text-xs text-muted">
            نسخه {persian(session.version)}
          </span>
        </div>
        {session.state === "waiting_input" && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-control bg-warning-soft p-4">
            <span className="text-warning">پردازش منتظر پاسخ شماست.</span>
            {issue && workspace.canWrite && (
              <QuestionDialog
                key={issue.id}
                issue={issue}
                session={session}
                onDone={resource.refresh}
              />
            )}
          </div>
        )}
        {session.error_message && (
          <div className="mt-5">
            <StatusMessage tone="danger">{session.error_message}</StatusMessage>
          </div>
        )}
        {session.state === "waiting_dependency" && (
          <div className="mt-5">
            <StatusMessage>
              سرویس پردازش در دسترس نیست؛ نتیجه هنوز نهایی نشده است.
            </StatusMessage>
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          <ButtonLink href="/settings/documents" variant="secondary">
            فایل‌ها و مدارک شرکت
          </ButtonLink>
          {session.result_id && (
            <ButtonLink href="/reports">مشاهده گزارش</ButtonLink>
          )}
          {report.canRetry && (
            <Button
              variant="secondary"
              busy={report.busy}
              onClick={() => report.run("retry")}
            >
              اجرای دوبارهٔ پردازش
            </Button>
          )}
          {report.canCancel && (
            <Button
              variant="ghost"
              onClick={() => {
                report.clearError();
                setCancelTarget(scope);
              }}
            >
              لغو پردازش
            </Button>
          )}
        </div>
        {!cancelOpen && <FormMessage error>{report.error}</FormMessage>}
      </Panel>
      <Panel title="فایل‌های گزارش" className="mt-5">
        <div className="divide-y divide-border">
          {session.files?.length ? (
            session.files.map((file) => (
              <div
                key={file.id}
                className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <FileXlsIcon
                    size={23}
                    className="shrink-0 text-primary"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="break-all">{file.name}</p>
                    <p className="mt-1 text-xs text-muted">
                      {persian(file.row_count)} ردیف
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={file.state} />
                  {file.scan_status === "development_unscanned" && (
                    <StatusBadge status={file.scan_status} />
                  )}
                  <ButtonLink
                    download
                    variant="ghost"
                    href={`/api/v1${workspace.companyPath(`source-files/${file.id}/download`)}`}
                    className="text-xs text-primary"
                    aria-label={`دریافت ${file.name}`}
                  >
                    <DownloadSimpleIcon size={16} aria-hidden />
                    دریافت فایل
                  </ButtonLink>
                </div>
              </div>
            ))
          ) : (
            <EmptyState compact title="فایلی دریافت نشده" />
          )}
        </div>
      </Panel>
      <ConfirmDialog
        title="پردازش لغو شود؟"
        open={cancelOpen}
        onOpenChange={(open) => setCancelTarget(open ? scope : null)}
        busy={report.busy}
        onConfirm={() => report.run("cancel", () => setCancelTarget(null))}
      >
        فایل‌ها و سوابق ثبت‌شده حفظ می‌شوند.
        <FormMessage error>{report.error}</FormMessage>
      </ConfirmDialog>
    </>
  );
}
