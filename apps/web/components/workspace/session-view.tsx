"use client";
import { FolderOpenIcon as HeaderIcon } from "@phosphor-icons/react";
import { StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  StatusMessage,
} from "@/components/ui/content-states";
import { ConfirmDialog } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/field";
import { FilePicker } from "@/components/ui/file-picker";
import { notify } from "@/components/ui/sonner";
import { useResource } from "@/hooks/use-resource";
import { useUpload } from "@/hooks/use-upload";
import { useWorkspace } from "@/hooks/workspace";
import { api, type ProcessingSession } from "@/lib/api";
import { displayDate, persian } from "@/lib/utils";
import { FileXlsIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { NoCompany, PageHeader, Panel } from "./page-parts";
import { QuestionDialog } from "./question-dialog";
const pollSession = (session: ProcessingSession | undefined) =>
  !!session &&
  ["sealed", "processing", "waiting_dependency"].includes(session.state);
export function SessionView({ id }: { id: string }) {
  const workspace = useWorkspace();
  const upload = useUpload();
  const resource = useResource<ProcessingSession>(
    workspace.companyPath(`processing-sessions/${id}`),
    { poll: pollSession },
  );
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const session = resource.data;
  const issue = session?.issues?.find((issue) => !issue.answer);
  async function command(name: "retry" | "cancel") {
    if (!session) return;
    setBusy(true);
    try {
      await api(workspace.companyPath(`processing-sessions/${id}/${name}`)!, {
        method: "POST",
        version: session.version,
        body: {},
      });
      resource.refresh();
      setCancelOpen(false);
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "عملیات انجام نشد.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!workspace.company) return <NoCompany />;
  if (resource.loading) return <LoadingState />;
  if (resource.error)
    return (
      <ErrorState message={resource.error.message} onRetry={resource.refresh} />
    );
  if (!session) return <><PageHeader icon={HeaderIcon} title="پرونده پردازش" /><EmptyState title="پرونده پیدا نشد" /></>;
  return (
    <>
      <PageHeader icon={HeaderIcon}
        title="پرونده پردازش"
        action={
          <ButtonLink href="/uploads" variant="secondary">
            همه نوبت‌ها
          </ButtonLink>
        }
      />
      <Panel
        title={displayDate(session.created_at)}
        action={<StatusBadge status={session.state} />}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span className="text-muted">
            {workspace.periods.find((period) => period.id === session.period_id)
              ?.name || "دوره انتخاب نشده"}
          </span>
          <span className="text-xs text-muted">
            نسخه {persian(session.version)}
          </span>
        </div>
        {session.state === "waiting_input" && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-control bg-warning-soft p-4">
            <span className="text-warning">کل نوبت منتظر پاسخ شماست.</span>
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
        {session.state === "receiving" && workspace.canWrite && (
          <div className="mt-5">
            <FilePicker
              onFiles={(files) => void upload.upload(files, id)}
              disabled={upload.busy}
              busy={upload.busy}
            />
            <FormMessage error>{upload.error}</FormMessage>
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          {session.result_id && (
            <ButtonLink href="/reports">مشاهده گزارش</ButtonLink>
          )}
          {workspace.canWrite &&
            ["failed", "waiting_dependency"].includes(session.state) && (
              <Button
                variant="secondary"
                busy={busy}
                onClick={() => void command("retry")}
              >
                تلاش دوباره
              </Button>
            )}
          {workspace.canWrite &&
            !["completed", "completed_limited", "cancelled"].includes(
              session.state,
            ) && (
              <Button variant="ghost" onClick={() => setCancelOpen(true)}>
                لغو پردازش
              </Button>
            )}
        </div>
      </Panel>
      <Panel title="فایل‌های این نوبت" className="mt-5">
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
                <div className="flex flex-wrap gap-2">
                  <StatusBadge status={file.state} />
                  {file.scan_status === "development_unscanned" && (
                    <StatusBadge status={file.scan_status} />
                  )}
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
        onOpenChange={setCancelOpen}
        busy={busy}
        onConfirm={() => void command("cancel")}
      >
        فایل‌ها و سوابق ثبت‌شده حفظ می‌شوند.
      </ConfirmDialog>
    </>
  );
}
