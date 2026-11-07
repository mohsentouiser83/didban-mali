"use client";
import { UploadSimpleIcon as HeaderIcon } from "@phosphor-icons/react";
import { StatusBadge } from "@/components/ui/badge";
import { useState } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Button, ButtonLink } from "@/components/ui/button";
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
import { useWorkspace } from "@/hooks/workspace";
import { useUploadWorkspace } from "@/hooks/use-upload-workspace";
import { displayDate, persian } from "@/lib/utils";
import {
  ArrowUpLeftIcon,
  CalendarBlankIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  ClockIcon,
  FileTextIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { NoCompany, PageHeader, Panel } from "./page-parts";

function UploadsWorkspace() {
  const upload = useUploadWorkspace();
  const [open, setOpen] = useState(false);
  const sessions = upload.sessions;
  if (!upload.company) return <NoCompany />;
  return (
    <>
      <PageHeader
        icon={HeaderIcon}
        title="اسناد و پردازش"
        action={
          upload.canWrite && (
            <Button onClick={() => setOpen(true)}>بارگذاری جدید</Button>
          )
        }
      />
      {upload.canWrite && (
        <Drawer
          title="بارگذاری جدید"
          open={open}
          onOpenChange={(value) => {
            if (!upload.busy) setOpen(value);
          }}
        >
          <div className="mb-5 max-w-sm">
            <Field
              id="upload-period"
              label="دوره مالی"
              icon={CalendarBlankIcon}
            >
              <Select
                id="upload-period"
                value={upload.periodId || "ask"}
                disabled={upload.busy}
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
                  <FileTextIcon
                    size={18}
                    className="shrink-0 text-primary"
                    aria-hidden
                  />
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
        </Drawer>
      )}
      <Panel>
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
                {upload.sessionRows.length ? (
                  upload.sessionRows.map((session) => (
                    <TableRow key={session.id}>
                      <TableRowHeader>
                        پردازش {persian(session.position)}
                      </TableRowHeader>
                      <TableCell className="whitespace-nowrap">
                        {displayDate(session.created_at)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={session.state} />
                      </TableCell>
                      <TableCell>{session.periodName}</TableCell>
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

export function UploadsView() {
  const workspace = useWorkspace();
  return (
    <UploadsWorkspace key={`${workspace.user?.id}:${workspace.company?.id}`} />
  );
}
