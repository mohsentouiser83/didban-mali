"use client";
import { FilesIcon as HeaderIcon, PlusIcon } from "@phosphor-icons/react";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { ConfirmDialog } from "@/components/ui/dialog";
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
import { useCommand } from "@/hooks/use-command";
import { usePagedResource } from "@/hooks/use-paged-resource";
import { useUpload } from "@/hooks/use-upload";
import { useWorkspace } from "@/hooks/workspace";
import { listItems, type SourceFile } from "@/lib/api";
import { persian } from "@/lib/utils";
import { ArchiveIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { NoCompany, PageHeader, Panel } from "./page-parts";
import { BotIntakesPanel } from "./bot-intakes-panel";
import { DocumentSpreadsheetsPanel } from "./document-spreadsheets-panel";

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
        title="اسناد"
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
                  <TableHead>فایل</TableHead>
                  <TableHead>ردیف</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listItems(resource.data).length ? (
                  listItems(resource.data).map((file) => (
                    <TableRow key={file.id}>
                      <TableRowHeader>
                        <p className="max-w-80 break-all">{file.name}</p>
                      </TableRowHeader>
                      <TableCell>{persian(file.row_count)}</TableCell>
                      <TableCell>
                        {file.archived ? (
                          <Badge>بایگانی</Badge>
                        ) : (
                          <StatusBadge status={file.state} />
                        )}
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
                  <TableEmptyCell colSpan={4} title="هنوز فایلی بارگذاری نشده است" />
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
          title="بارگذاری جدید اسناد و مدارک"
          open={openUpload}
          onOpenChange={(value) => {
            if (!upload.busy) setOpenUpload(value);
          }}
        >
          <div className="space-y-4">
            <Field id="source-upload-period" label="دوره مالی (اختیاری)">
              <Select
                id="source-upload-period"
                value={workspace.periodId || ""}
                onValueChange={(value) => workspace.setPeriodId(value || "")}
                placeholder="انتخاب دوره مالی..."
                options={workspace.periods.map((p) => ({
                  value: p.id,
                  label: p.name,
                }))}
              />
            </Field>
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
          اثر مالی و اصل سند در گزارش‌ها حفظ می‌شود.
        </p>
        <FormMessage error>{command.error?.message}</FormMessage>
      </ConfirmDialog>
    </>
  );
}
