"use client";
import { UploadSimpleIcon as HeaderIcon } from "@phosphor-icons/react";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ConditionalRegion } from "@/components/ui/conditional-region";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Field, FormMessage } from "@/components/ui/field";
import { FilePicker } from "@/components/ui/file-picker";
import { CursorPagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowHeader,
} from "@/components/ui/table";
import { usePagedResource } from "@/hooks/use-paged-resource";
import { useUpload } from "@/hooks/use-upload";
import { listItems, type ProcessingSession } from "@/lib/api";
import { displayDate, persian } from "@/lib/utils";
import {
  ArrowUpLeftIcon,
  CalendarBlankIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  ClockIcon,
  FileTextIcon,
  FilesIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { NoCompany, PageHeader, Panel } from "./page-parts";

export function UploadsView() {
  const upload = useUpload();
  const sessions = usePagedResource<ProcessingSession>(
    upload.companyPath("processing-sessions"),
  );
  if (!upload.company) return <NoCompany />;
  return (
    <>
      <PageHeader icon={HeaderIcon}
        title="اسناد و پردازش"
        action={
          <ButtonLink href="/sources" variant="secondary">
            <FilesIcon size={18} className="text-primary" aria-hidden />
            منابع و اصل اسناد
          </ButtonLink>
        }
      />
      {upload.canWrite && (
        <Panel title="اسناد را اضافه کنید">
          <div className="mb-5 max-w-sm">
            <Field id="upload-period" label="دوره مالی" icon={CalendarBlankIcon}>
              <Select
                id="upload-period"
                value={upload.periodId || "ask"}
                onValueChange={(id) =>
                  upload.setPeriodId(id === "ask" ? "" : id)
                }
                options={[
                  { value: "ask", label: "انتخاب هنگام پردازش" },
                  ...upload.periods.map((period) => ({
                    value: period.id,
                    label: period.name,
                  })),
                ]}
              />
            </Field>
          </div>
          <FilePicker
            onFiles={(files) => void upload.upload(files)}
            disabled={upload.busy}
            busy={upload.busy}
          />
          <ConditionalRegion
            show={upload.files.length > 0}
            role="status"
            className="mt-4 divide-y divide-border"
          >
            {upload.files.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between gap-3 py-3"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <FileTextIcon size={18} className="shrink-0 text-primary" aria-hidden />
                  <span className="truncate">{file.name}</span>
                </span>
                <span
                  key={file.state}
                  className="grid size-6 shrink-0 place-items-center motion-safe:animate-fade-in"
                >
                  {file.state === "uploaded" ? (
                    <CheckCircleIcon
                      size={20}
                      className="shrink-0 text-success"
                      aria-label="دریافت شد"
                    />
                  ) : file.state === "uploading" ? (
                    <CircleNotchIcon
                      size={20}
                      className="shrink-0 animate-spin text-primary motion-reduce:animate-none"
                      aria-label="در حال انتقال"
                    />
                  ) : file.state === "failed" ? (
                    <WarningCircleIcon
                      size={20}
                      className="text-danger"
                      aria-label="ناموفق"
                    />
                  ) : (
                    <ClockIcon
                      size={20}
                      className="text-primary"
                      aria-label="در انتظار"
                    />
                  )}
                </span>
              </div>
            ))}
          </ConditionalRegion>
          <FormMessage error>{upload.error}</FormMessage>
          <ConditionalRegion show={Boolean(upload.error && upload.sessionId)}>
            <ButtonLink
              href={`/uploads/${upload.sessionId}`}
              variant="secondary"
              className="mt-3"
            >
              <ArrowUpLeftIcon size={18} className="text-primary" aria-hidden />
              بازکردن پرونده
            </ButtonLink>
          </ConditionalRegion>
        </Panel>
      )}
      <Panel title="نوبت‌های پردازش" className="mt-5">
        {sessions.loading ? (
          <LoadingState />
        ) : sessions.error ? (
          <ErrorState
            message={sessions.error.message}
            onRetry={sessions.refresh}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>نوبت</TableHead>
                  <TableHead>تاریخ</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>دوره</TableHead>
                  <TableHead>
                    <span className="sr-only">بازکردن</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listItems(sessions.data).length ? (
                  listItems(sessions.data).map((session, index) => (
                    <TableRow key={session.id}>
                      <TableRowHeader>
                        پردازش {persian(index + 1)}
                      </TableRowHeader>
                      <TableCell className="whitespace-nowrap">
                        {displayDate(session.created_at)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={session.state} />
                      </TableCell>
                      <TableCell>
                        {upload.periods.find(
                          (period) => period.id === session.period_id,
                        )?.name || "انتخاب نشده"}
                      </TableCell>
                      <TableCell>
                        <ButtonLink
                          href={`/uploads/${session.id}`}
                          variant="ghost"
                          className="size-11 p-0 text-primary"
                        >
                          <ArrowUpLeftIcon size={20} aria-hidden />
                          <span className="sr-only">بازکردن پرونده</span>
                        </ButtonLink>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableEmptyCell colSpan={5} title="نوبت پردازشی ثبت نشده" />
                )}
              </TableBody>
            </Table>
            <CursorPagination {...sessions} />
          </>
        )}
      </Panel>
    </>
  );
}
