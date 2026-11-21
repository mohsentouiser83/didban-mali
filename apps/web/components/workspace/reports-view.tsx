"use client";
import {
  BookmarkSimpleIcon,
  ChartLineUpIcon as HeaderIcon,
  ChartLineUpIcon,
  DownloadSimpleIcon,
  FilesIcon,
  PlusIcon,
  ShieldCheckIcon,
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
import { Tabs } from "@/components/ui/tabs";
import { useCommand } from "@/hooks/use-command";
import { usePagedResource } from "@/hooks/use-paged-resource";
import { useReportBuilder } from "@/hooks/use-report-builder";
import { useWorkspace } from "@/hooks/workspace";
import { listItems, type Report } from "@/lib/api";
import { displayDate, persian } from "@/lib/utils";
import { useState } from "react";
import { NoCompany, PageHeader, Panel } from "./page-parts";

export function ReportsView() {
  const workspace = useWorkspace();
  const resource = usePagedResource<Report>(workspace.companyPath("reports"));
  const builder = useReportBuilder();
  const command = useCommand();
  const [approving, setApproving] = useState<Report | null>(null);
  const [tab, setTab] = useState<"system" | "definitions" | "runs">("system");

  if (!workspace.company) return <NoCompany />;

  return (
    <>
      <PageHeader
        icon={HeaderIcon}
        title="گزارش‌ها و صورت‌های مالی"
        action={
          <ButtonLink href="/reports/studio" variant="primary" className="gap-1.5">
            <PlusIcon size={18} />
            گزارش جدید
          </ButtonLink>
        }
      />

      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { id: "system", label: "صورت‌های مالی سیستم", icon: FilesIcon },
            { id: "definitions", label: "قالب‌های ذخیره‌شده گزارش‌ساز", icon: ChartLineUpIcon },
            { id: "runs", label: "اجراهای ثابت ذخیره‌شده", icon: BookmarkSimpleIcon },
          ]}
        />
      </div>

      {tab === "system" && (
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
                                <ShieldCheckIcon size={18} aria-hidden />
                                تأیید نسخه
                              </Button>
                            )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableEmptyCell colSpan={5} title="هنوز گزارشی تولید نشده است" />
                  )}
                </TableBody>
              </Table>
              <CursorPagination {...resource} />
            </>
          )}
        </Panel>
      )}

      {tab === "definitions" && (
        <Panel
          title="قالب‌های گزارش ذخیره‌شده"
          action={
            <ButtonLink href="/reports/studio" variant="secondary" className="gap-1.5">
              <PlusIcon size={16} />
              طراحی قالب جدید
            </ButtonLink>
          }
        >
          {builder.definitions.loading ? (
            <LoadingState label="دریافت گزارش‌های ذخیره‌شده" />
          ) : builder.definitions.error ? (
            <ErrorState
              message={builder.definitions.error.message}
              onRetry={builder.definitions.refresh}
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>عنوان قالب گزارش</TableHead>
                    <TableHead>نسخه</TableHead>
                    <TableHead>عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listItems(builder.definitions.data).length ? (
                    listItems(builder.definitions.data).map((item) => (
                      <TableRow key={item.id}>
                        <TableRowHeader>{item.name}</TableRowHeader>
                        <TableCell>{persian(item.version)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <ButtonLink
                              href="/reports/studio"
                              variant="ghost"
                            >
                              باز کردن در گزارش جدید
                            </ButtonLink>
                            {workspace.canWrite && (
                              <Button
                                variant="soft"
                                disabled={builder.command.busy}
                                onClick={() => builder.rerun(item)}
                              >
                                اجرای دوباره
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableEmptyCell
                      colSpan={3}
                      title="قالب گزارش ذخیره‌شده‌ای موجود نیست"
                      action={
                        <ButtonLink href="/reports/studio">
                          ایجاد اولین گزارش جدید
                        </ButtonLink>
                      }
                    />
                  )}
                </TableBody>
              </Table>
              <CursorPagination {...builder.definitions} />
            </>
          )}
        </Panel>
      )}

      {tab === "runs" && (
        <Panel title="اجراهای ثابت و ثبت‌شده گزارش">
          {builder.runs.loading ? (
            <LoadingState label="دریافت اجراهای گزارش" />
          ) : builder.runs.error ? (
            <ErrorState
              message={builder.runs.error.message}
              onRetry={builder.runs.refresh}
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>عنوان گزارش</TableHead>
                    <TableHead>تاریخ اجرا</TableHead>
                    <TableHead>تعداد ردیف‌ها</TableHead>
                    <TableHead>مشاهده</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listItems(builder.runs.data).length ? (
                    listItems(builder.runs.data).map((item) => (
                      <TableRow key={item.id}>
                        <TableRowHeader>{item.title}</TableRowHeader>
                        <TableCell>{displayDate(item.created_at)}</TableCell>
                        <TableCell>{persian(item.row_count || 0)}</TableCell>
                        <TableCell>
                          <ButtonLink
                            href="/reports/studio"
                            variant="ghost"
                          >
                            مشاهده در استودیو گزارش
                          </ButtonLink>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableEmptyCell colSpan={4} title="اجرای ذخیره‌شده‌ای موجود نیست" />
                  )}
                </TableBody>
              </Table>
              <CursorPagination {...builder.runs} />
            </>
          )}
        </Panel>
      )}

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
