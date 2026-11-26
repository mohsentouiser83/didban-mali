"use client";
import { FilesIcon as HeaderIcon, PlusIcon, ArchiveIcon, DownloadSimpleIcon, ArrowUpLeftIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState, LoadingState, StatusMessage } from "@/components/ui/content-states";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { FormMessage } from "@/components/ui/field";
import { FilePicker } from "@/components/ui/file-picker";
import { CursorPagination } from "@/components/ui/pagination";
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
import { useCommand } from "@/hooks/use-command";
import { usePagedResource } from "@/hooks/use-paged-resource";
import { useUpload } from "@/hooks/use-upload";
import { useWorkspace } from "@/hooks/workspace";
import { listItems, type SourceFile } from "@/lib/api";
import { displayDate, persian } from "@/lib/utils";
import { BotIntakesPanel } from "./bot-intakes-panel";
import { DocumentSpreadsheetsPanel } from "./document-spreadsheets-panel";
import { NoCompany, PageHeader, Panel } from "./page-parts";

export function SourcesView() {
  const workspace = useWorkspace();
  return workspace.company ? (
    <CompanyDocuments key={`${workspace.user?.id}:${workspace.company.id}`} />
  ) : <NoCompany />;
}

function CompanyDocuments() {
  const workspace = useWorkspace();
  const upload = useUpload();
  const [openUpload, setOpenUpload] = useState(false);
  const resource = usePagedResource<SourceFile>(
    workspace.companyPath("source-files"),
  );
  const command = useCommand();
  const [archiving, setArchiving] = useState<SourceFile | null>(null);
  if (!workspace.company) return <NoCompany />;

  return (
    <>
      <PageHeader
        icon={HeaderIcon}
        title="فایل‌ها و مدارک"
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/uploads" variant="secondary">نوبت‌های پردازش</ButtonLink>
            {workspace.canWrite && (
              <Button onClick={() => setOpenUpload(true)}>
                <PlusIcon size={18} aria-hidden />
                بارگذاری جدید
              </Button>
            )}
          </div>
        }
      />
      <Panel title="فایل‌های پردازش">
        {resource.loading ? (
          <LoadingState />
        ) : resource.error ? (
          <ErrorState
            message={resource.error.message}
            onRetry={resource.refresh}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>نام فایل</TableHead>
                  <TableHead numeric>تعداد ردیف</TableHead>
                  <TableHead>دورهٔ مالی</TableHead>
                  <TableHead>تاریخ</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>نوبت پردازش</TableHead>
                  <TableHead>عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listItems(resource.data).length ? (
                  listItems(resource.data).map((file) => (
                    <TableRow key={file.id}>
                      <TableRowHeader>
                        <p className="max-w-72 break-all">{file.name}</p>
                      </TableRowHeader>
                      <TableCell numeric>{persian(file.row_count)}</TableCell>
                      <TableCell>{file.period_name || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {file.created_at ? displayDate(file.created_at) : "—"}
                      </TableCell>
                      <TableCell>
                        {file.archived ? (
                          <Badge>بایگانی</Badge>
                        ) : (
                          <StatusBadge status={file.state} />
                        )}
                      </TableCell>
                      <TableCell>
                        {file.session_id ? (
                          <ButtonLink
                            href={`/uploads/${file.session_id}`}
                            variant="ghost"
                            className="text-xs text-primary"
                          >
                            مشاهده نوبت
                            <ArrowUpLeftIcon size={14} aria-hidden />
                          </ButtonLink>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <a
                            href={`/api/v1${workspace.companyPath(`source-files/${file.id}/download`)}`}
                            className="grid size-11 place-items-center rounded-control text-primary outline-none transition-colors duration-200 ease-interface hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
                            aria-label={`دریافت ${file.name}`}
                          >
                            <DownloadSimpleIcon size={20} aria-hidden />
                          </a>
                          {workspace.canWrite && !file.archived && (
                            <Button
                              variant="ghost"
                              className="size-11 p-0"
                              aria-label={`بایگانی ${file.name}`}
                              onClick={() => {
                                setArchiving(file);
                                command.clearError();
                              }}
                            >
                              <ArchiveIcon size={20} className="text-primary" aria-hidden />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableEmptyCell colSpan={7} title="هنوز فایلی بارگذاری نشده است" />
                )}
              </TableBody>
            </Table>
            <CursorPagination {...resource} />
          </>
        )}
      </Panel>
      <div className="mt-5">
        <DocumentSpreadsheetsPanel />
      </div>
      <section id="bot-documents">
        <BotIntakesPanel />
      </section>
      {workspace.canWrite && (
        <Drawer
          title="بارگذاری جدید فایل‌ها و مدارک"
          open={openUpload}
          onOpenChange={(value) => {
            if (!upload.busy) setOpenUpload(value);
          }}
        >
          <div className="space-y-4">
            <StatusMessage tone="primary">
              <div className="space-y-1 text-xs">
                <div>
                  دورهٔ هدف:{" "}
                  <span className="font-medium text-foreground">
                    {workspace.periods.find((period) => period.id === workspace.periodId)?.name || "انتخاب‌نشده در هدر (بدون تخصیص دوره)"}
                  </span>
                </div>
                <div>
                  فرمت‌های مجاز: CSV، XLSX، XLS (حداکثر ۱۰ فایل و حدود ۲۰٬۰۰۰ ردیف در هر نوبت)
                </div>
              </div>
            </StatusMessage>
            <FilePicker
              onFiles={async (files) => {
                await upload.upload(files);
                resource.refresh();
              }}
              busy={upload.busy}
            />
            {upload.files.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted">فایل‌های ارسالی:</p>
                {upload.files.map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-border p-2.5 text-xs"
                  >
                    <span className="font-medium text-foreground">{file.name}</span>
                    <Badge
                      tone={
                        file.state === "uploaded"
                          ? "success"
                          : file.state === "failed"
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {file.state === "uploading"
                        ? "در حال ارسال..."
                        : file.state === "uploaded"
                          ? "ارسال شد"
                          : file.state === "failed"
                            ? "خطا در ارسال"
                            : "در صف ارسال"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
            {upload.error && <FormMessage error>{upload.error}</FormMessage>}
          </div>
        </Drawer>
      )}
      <ConfirmDialog
        title="منبع بایگانی شود؟"
        open={!!archiving}
        onOpenChange={(open) => {
          if (!open) setArchiving(null);
        }}
        busy={command.busy}
        onConfirm={() => {
          if (archiving)
            void command.run(
              workspace.companyPath(`source-files/${archiving.id}/archive`),
              {
                version: archiving.version,
                body: { expected_version: archiving.version },
              },
              () => {
                setArchiving(null);
                resource.refresh();
              },
              "منبع بایگانی شد.",
            );
        }}
      >
        <p>{archiving?.name}</p>
        <p className="mt-2 text-sm text-muted">
          اثر مالی و اصل فایل در گزارش‌ها حفظ می‌شود.
        </p>
        <FormMessage error>{command.error?.message}</FormMessage>
      </ConfirmDialog>
    </>
  );
}
