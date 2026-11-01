"use client";
import { ChartLineUpIcon as HeaderIcon } from "@phosphor-icons/react";
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
import { DownloadSimpleIcon, ShieldCheckIcon } from "@phosphor-icons/react";
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
      <PageHeader icon={HeaderIcon} title="گزارش‌ها" action={
        <ButtonLink href="/employee-reports" variant="soft">
          <HeaderIcon size={18} aria-hidden />گزارش کارمندان
        </ButtonLink>
      } />
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
                  <TableHead>گزارش</TableHead>
                  <TableHead>تاریخ تولید</TableHead>
                  <TableHead>وضعیت تأیید</TableHead>
                  <TableHead>دریافت</TableHead>
                  <TableHead>
                    <span className="sr-only">تأیید</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listItems(resource.data).length ? (
                  listItems(resource.data).map((report) => (
                    <TableRow key={report.id}>
                      <TableRowHeader>
                        <span className="block">{report.title}</span>
                        <Badge tone="primary" className="mt-2">
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
                        <div className="flex items-center gap-1">
                          {(["pdf", "xlsx"] as const).map((format) => (
                            <a
                              key={format}
                              href={`/api/v1${workspace.companyPath(`reports/${report.id}/export`)}?format=${format}`}
                              className="inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-xs text-primary outline-none transition-colors duration-200 ease-interface hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
                            >
                              <DownloadSimpleIcon size={16} aria-hidden />
                              {format.toUpperCase()}
                            </a>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        {workspace.canApprove &&
                          !report.approvals?.some(
                            (approval) =>
                              approval.actor_id === workspace.user?.id,
                          ) && (
                            <Button
                              variant="soft"
                              onClick={() => {
                                setApproving(report);
                                command.clearError();
                              }}
                            >
                              <ShieldCheckIcon size={18} aria-hidden />تأیید نسخه
                            </Button>
                          )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableEmptyCell
                    colSpan={5}
                    title="گزارشی تولید نشده"
                  />
                )}
              </TableBody>
            </Table>
            <CursorPagination {...resource} />
          </>
        )}
      </Panel>
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
