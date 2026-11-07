"use client";
import { FilesIcon as HeaderIcon } from "@phosphor-icons/react";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { ConfirmDialog } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/field";
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
import { useWorkspace } from "@/hooks/workspace";
import { listItems, type SourceFile } from "@/lib/api";
import { persian } from "@/lib/utils";
import { ArchiveIcon, DownloadSimpleIcon, ClockCounterClockwiseIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { NoCompany, PageHeader, Panel } from "./page-parts";

export function SourcesView() {
  const workspace = useWorkspace();
  const resource = usePagedResource<SourceFile>(
    workspace.companyPath("source-files"),
  );
  const command = useCommand();
  const [archiving, setArchiving] = useState<SourceFile | null>(null);
  if (!workspace.company) return <NoCompany />;
  return (
    <>
      <PageHeader icon={HeaderIcon}
        title="فایل‌ها و مدارک"
        action={
          <ButtonLink href="/uploads" variant="secondary">
            <ClockCounterClockwiseIcon size={18} aria-hidden className="text-primary" />نوبت‌های پردازش
          </ButtonLink>
        }
      />
      <Panel>
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
                  <TableEmptyCell colSpan={4} title="منبعی بارگذاری نشده" />
                )}
              </TableBody>
            </Table>
            <CursorPagination {...resource} />
          </>
        )}
      </Panel>
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
