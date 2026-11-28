"use client";
import { TableRowAction, TableRowActions } from "@/components/ui/table-row-actions";
import {
  BankIcon,
  BooksIcon,
  ChartLineUpIcon,
  ChartLineUpIcon as HeaderIcon,
  DownloadSimpleIcon,
  FilePdfIcon,
  FileTextIcon,
  PlusIcon,
  ReceiptIcon,
  ShieldCheckIcon,
  SquaresFourIcon,
  UsersThreeIcon,
  WalletIcon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
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
import { useReportArchive } from "@/hooks/use-report-archive";
import { displayDate, persian } from "@/lib/utils";
import { NoCompany, PageHeader, Panel } from "./page-parts";

export function ReportsView() {
  const archive = useReportArchive();
  const { workspace, resource, command, approving } = archive;

  if (!workspace.company) return <NoCompany />;

  return (
    <>
      <PageHeader
        icon={HeaderIcon}
        title="گزارش‌ها و دفاتر مالی"
        action={
          <ButtonLink href="/reports/studio" variant="primary" className="gap-1.5">
            <PlusIcon size={18} />
            ساخت گزارش سفارشی
          </ButtonLink>
        }
      />

      {/* Directory of Core Financial & Legal Reports */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: "صورت‌های مالی اساسی",
            href: "/reports/native",
            icon: ChartLineUpIcon,
            color: "text-primary",
          },
          {
            title: "دفاتر الکترونیک قانونی",
            href: "/accounting/electronic-ledgers",
            icon: BooksIcon,
            color: "text-info",
          },
          {
            title: "دفتر روزنامه اسناد",
            href: "/reports/journals",
            icon: FileTextIcon,
            color: "text-foreground",
          },
          {
            title: "گزارش سامانه مؤدیان",
            href: "/moadian/reports",
            icon: ReceiptIcon,
            color: "text-warning",
          },
          {
            title: "چک‌های صیادی و ضمانتی",
            href: "/settlements/cheques",
            icon: BankIcon,
            color: "text-success",
          },
          {
            title: "جریان نقدینگی دوره",
            href: "/cashflow",
            icon: WalletIcon,
            color: "text-primary",
          },
          {
            title: "پیش‌بینی ۳۰روزه نقدینگی",
            href: "/cashflow/forecast",
            icon: WalletIcon,
            color: "text-info",
          },
          {
            title: "حقوق و دستمزد و کارکرد",
            href: "/payroll",
            icon: UsersThreeIcon,
            color: "text-muted",
          },
          {
            title: "مرکز حساب‌ها (ابعاد)",
            href: "/reports/dimensions",
            icon: SquaresFourIcon,
            color: "text-secondary",
          },
        ].map((item) => {
          const IconComponent = item.icon;
          return (
            <ButtonLink
              key={item.href}
              href={item.href}
              variant="secondary"
              className="group flex flex-col items-start h-auto p-4 rounded-2xl border border-border bg-surface text-right shadow-xs hover:border-primary/40 hover:bg-canvas transition-all"
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="font-medium text-foreground text-sm group-hover:text-primary transition-colors">
                  {item.title}
                </span>
                <div className="size-8 rounded-xl bg-canvas flex items-center justify-center border border-border/60">
                  <IconComponent size={18} className={item.color} />
                </div>
              </div>
            </ButtonLink>
          );
        })}
      </div>

      <div className="space-y-6">
        <Panel title="آرشیو گزارش‌های تولیدشده و استودیو">
          {archive.loading ? (
            <LoadingState />
          ) : archive.error ? (
            <ErrorState
              message={archive.error.message}
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>گزارش</TableHead>
                    <TableHead>نوع</TableHead>
                    <TableHead>دوره</TableHead>
                    <TableHead>مبنا</TableHead>
                    <TableHead>تاریخ</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {archive.definitions.map((definition) => (
                    <TableRow key={definition.id}
                      className="cursor-pointer hover:bg-canvas"
                      onClick={() => archive.openDefinition(definition.id)}>
                      <TableRowHeader>
                        <ButtonLink href={`/reports/studio?definition=${encodeURIComponent(definition.id)}`}
                          variant="ghost" onClick={(event) => event.stopPropagation()}>
                          {definition.name}
                        </ButtonLink>
                      </TableRowHeader>
                      <TableCell>{definition.system_key ? "قالب سامانه" : "تعریف سفارشی"}</TableCell>
                      <TableCell>{workspace.periods.find((period) => period.id === definition.spec?.global_filters?.period_id)?.name ?? "هنگام اجرا"}</TableCell>
                      <TableCell>{definition.spec?.global_filters?.basis === "ledger" ? "دفتر" :
                        definition.spec?.global_filters?.basis === "invoice" ? "فاکتور" :
                        definition.spec?.global_filters?.basis === "bank" ? "بانک" : "طبق تعریف گزارش"}</TableCell>
                      <TableCell className="whitespace-nowrap">{definition.created_at ? displayDate(definition.created_at) : "—"}</TableCell>
                      <TableCell><Badge tone={definition.system_key ? "primary" : "neutral"}>
                        تعریف گزارش
                      </Badge></TableCell>
                      <TableCell>
                        <TableRowActions label={`عملیات ${definition.name}`}>
                          <TableRowAction
                            kind={workspace.canWrite ? "edit" : "view"}
                            onClick={() => archive.openDefinition(definition.id)}
                          >
                            {workspace.canWrite ? "ویرایش" : "مشاهده"}
                          </TableRowAction>
                        </TableRowActions>
                      </TableCell>
                    </TableRow>
                  ))}
                  {archive.reports.length ? (
                    archive.reports.map((report) => (
                      <TableRow key={report.id}>
                        <TableRowHeader>
                          <span className="block font-medium">{report.title}</span>
                        </TableRowHeader>
                        <TableCell>گزارش ثابت</TableCell>
                        <TableCell>{report.period_name ?? "—"}</TableCell>
                        <TableCell>نتیجهٔ پردازش</TableCell>
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
                          <TableRowActions label={`عملیات ${report.title}`}>
                            {/* 1. تبدیل به داشبورد */}
                            {workspace.canWrite && (["fixed", "live"] as const).map((mode) => (
                              <TableRowAction
                                key={mode}
                                disabled={command.busy}
                                onClick={() => archive.setDashboard(report, mode)}
                                icon={<SquaresFourIcon size={15} />}
                              >
                                {mode === "fixed" ? "تبدیل به داشبورد" : "تنظیم به‌عنوان داشبورد زنده"}
                              </TableRowAction>
                            ))}

                            {/* 2. خروجی PDF */}
                            <TableRowAction
                              href={`/api/v1${workspace.companyPath(`reports/${report.id}/export`)}?format=pdf`}
                              download
                              title="دریافت خروجی PDF رسمی"
                              icon={<FilePdfIcon size={16} className="text-primary" />}
                            >
                              خروجی PDF
                            </TableRowAction>

                            {/* 3. دریافت XLSX */}
                            <TableRowAction
                              href={`/api/v1${workspace.companyPath(`reports/${report.id}/export`)}?format=xlsx`}
                              download
                              title="دریافت اکسل"
                              icon={<DownloadSimpleIcon size={14} />}
                            >
                              XLSX
                            </TableRowAction>

                            {/* 4. تأیید نسخه */}
                            {workspace.canApprove &&
                              !report.approvals?.some(
                                (approval) =>
                                  approval.actor_id === workspace.user?.id,
                              ) && (
                                <TableRowAction
                                  onClick={() => {
                                      archive.requestApproval(report);
                                  }}
                                  icon={<ShieldCheckIcon size={16} aria-hidden />}
                                >
                                  تأیید نسخه
                                </TableRowAction>
                              )}
                          </TableRowActions>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : !archive.definitions.length ? (
                    <TableEmptyCell colSpan={7} title="هنوز گزارشی تولید نشده است" />
                  ) : null}
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
        onOpenChange={(open) => { if (!open) archive.closeApproval(); }}
        busy={command.busy}
        onConfirm={archive.confirmApproval}
      >
        <p>
          {approving?.title} · نسخه {persian(approving?.version || 1)}
        </p>
        <FormMessage error>{command.error?.message}</FormMessage>
      </ConfirmDialog>
    </>
  );
}
