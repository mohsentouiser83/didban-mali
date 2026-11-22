"use client";
import {
  ChartLineUpIcon as HeaderIcon,
  DownloadSimpleIcon,
  FilePdfIcon,
  PlusIcon,
  ShieldCheckIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
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
import { listItems, type Report } from "@/lib/api";
import { displayDate, persian } from "@/lib/utils";
import { useState } from "react";
import { NoCompany, PageHeader, Panel } from "./page-parts";

export function ReportsView() {
  const workspace = useWorkspace();
  const resource = usePagedResource<Report>(workspace.companyPath("reports"));
  const command = useCommand();
  const [approving, setApproving] = useState<Report | null>(null);

  if (!workspace.company) return <NoCompany />;

  return (
    <>
      <PageHeader
        icon={HeaderIcon}
        title="گزارش‌ها"
        action={
          <ButtonLink href="/reports/studio" variant="primary" className="gap-1.5">
            <PlusIcon size={18} />
            ساخت گزارش
          </ButtonLink>
        }
      />

      <div className="space-y-6">
        <Panel title="صورت‌های مالی و گزارش‌های رسمی">
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
                    <TableHead>گزارش</TableHead>
                    <TableHead>تاریخ تولید</TableHead>
                    <TableHead>وضعیت تأیید</TableHead>
                    <TableHead>عملیات و دریافت</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listItems(resource.data).length ? (
                    listItems(resource.data).map((report) => (
                      <TableRow key={report.id}>
                        <TableRowHeader>
                          <span className="block font-medium">{report.title}</span>
                          <Badge tone="primary" className="mt-2 text-xs">
                            تولیدشده سامانه
                          </Badge>
                        </TableRowHeader>
                        <TableCell className="whitespace-nowrap">
                          {displayDate(report.created_at)}
                        </TableCell>
                        <TableCell>
                          {report.approvals?.length ? (
                            <Badge tone="success">تأیید مالی ثبت‌شده</Badge>
                          ) : (
                            <Badge>تأیید نشده</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            {/* 1. تبدیل به داشبورد */}
                            {workspace.canWrite && (
                              <Button
                                variant="soft"
                                disabled={command.busy}
                                onClick={() => {
                                  void command.run(
                                    workspace.companyPath(
                                      `report-studio/reports/${report.id}/set-dashboard`,
                                    ),
                                    { method: "POST" },
                                    () => resource.refresh(),
                                    "این گزارش رسمی به‌عنوان داشبورد اصلی شرکت تنظیم شد.",
                                  );
                                }}
                                className="gap-1.5 text-xs text-primary"
                                title="تنظیم این صورت مالی به‌عنوان داشبورد صفحه نخست شرکت"
                              >
                                <SquaresFourIcon size={15} />
                                تبدیل به داشبورد
                              </Button>
                            )}

                            {/* 2. خروجی PDF */}
                            <a
                              href={`/api/v1${workspace.companyPath(
                                `reports/${report.id}/export`,
                              )}?format=pdf`}
                              download
                              className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-border bg-surface px-3 text-xs text-foreground outline-none transition-colors duration-200 hover:bg-canvas hover:text-primary focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
                              title="دریافت خروجی PDF رسمی"
                            >
                              <FilePdfIcon size={16} className="text-primary" />
                              خروجی PDF
                            </a>

                            {/* 3. دریافت XLSX */}
                            <a
                              href={`/api/v1${workspace.companyPath(
                                `reports/${report.id}/export`,
                              )}?format=xlsx`}
                              download
                              className="inline-flex min-h-9 items-center gap-1.5 rounded-control px-2.5 text-xs text-muted hover:text-foreground"
                              title="دریافت اکسل"
                            >
                              <DownloadSimpleIcon size={14} />
                              XLSX
                            </a>

                            {/* 4. تأیید نسخه */}
                            {workspace.canApprove &&
                              !report.approvals?.some(
                                (approval) =>
                                  approval.actor_id === workspace.user?.id,
                              ) && (
                                <Button
                                  variant="ghost"
                                  onClick={() => {
                                    setApproving(report);
                                    command.clearError();
                                  }}
                                  className="text-xs"
                                >
                                  <ShieldCheckIcon size={16} aria-hidden />
                                  تأیید نسخه
                                </Button>
                              )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableEmptyCell colSpan={4} title="هنوز گزارشی تولید نشده است" />
                  )}
                </TableBody>
              </Table>
              <CursorPagination {...resource} />
            </>
          )}
        </Panel>
      </div>

      <ConfirmDialog
        title="تأیید مالی این نسخه؟"
        open={!!approving}
        onOpenChange={(open) => {
          if (!open) setApproving(null);
        }}
        busy={command.busy}
        onConfirm={() => {
          if (approving)
            void command.run(
              workspace.companyPath(`reports/${approving.id}/approvals`),
              {
                body: { expected_version: approving.version },
                version: approving.version,
              },
              () => {
                setApproving(null);
                resource.refresh();
              },
              "تأیید این نسخه ثبت شد.",
            );
        }}
      >
        <p>
          {approving?.title} · نسخه {persian(approving?.version || 1)}
        </p>
        <FormMessage error>{command.error?.message}</FormMessage>
      </ConfirmDialog>
    </>
  );
}
