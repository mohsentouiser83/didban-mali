"use client";
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
            desc: "ترازنامه، سود و زیان و تراز آزمایشی",
            href: "/reports/native",
            icon: ChartLineUpIcon,
            color: "text-primary",
          },
          {
            title: "دفاتر الکترونیک قانونی",
            desc: "دفتر کل و معین با شماره‌گذاری روزانه",
            href: "/accounting/electronic-ledgers",
            icon: BooksIcon,
            color: "text-info",
          },
          {
            title: "دفتر روزنامه اسناد",
            desc: "فهرست و ریز آرتیکل‌های ثبتی",
            href: "/reports/journals",
            icon: FileTextIcon,
            color: "text-foreground",
          },
          {
            title: "گزارش سامانه مؤدیان",
            desc: "کارنامه ارسال و استعلام صورتحساب‌ها",
            href: "/moadian/reports",
            icon: ReceiptIcon,
            color: "text-warning",
          },
          {
            title: "چک‌های صیادی و ضمانتی",
            desc: "دریافتنی، پرداختنی و ضمانت نزد دیگران",
            href: "/settlements/cheques",
            icon: BankIcon,
            color: "text-success",
          },
          {
            title: "جریان نقدینگی و پیش‌بینی",
            desc: "پیش‌بینی ۳۰ روزه و سناریوسازی وجه نقد",
            href: "/cashflow/forecast",
            icon: WalletIcon,
            color: "text-primary",
          },
          {
            title: "حقوق و دستمزد و کارکرد",
            desc: "فیش‌های حقوقی و لیست بیمه و مالیات",
            href: "/payroll",
            icon: UsersThreeIcon,
            color: "text-muted",
          },
          {
            title: "مرکز حساب‌ها (ابعاد)",
            desc: "گزارشگری بر اساس پروژه‌ها و مراکز هزینه",
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
              className="group flex flex-col items-start justify-between h-auto p-4 rounded-2xl border border-border bg-surface text-right shadow-xs hover:border-primary/40 hover:bg-canvas transition-all"
            >
              <div className="flex w-full items-center justify-between mb-2">
                <span className="font-medium text-foreground text-sm group-hover:text-primary transition-colors">
                  {item.title}
                </span>
                <div className="size-8 rounded-xl bg-canvas flex items-center justify-center border border-border/60">
                  <IconComponent size={18} className={item.color} />
                </div>
              </div>
              <p className="text-xs text-muted leading-relaxed">{item.desc}</p>
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
              onRetry={archive.refresh}
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
                    <TableHead sortable={false} pinnable={false} filterable={false}>عملیات و دریافت</TableHead>
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
                      <TableCell><Button variant="ghost" onClick={(event) => {
                        event.stopPropagation(); archive.openDefinition(definition.id);
                      }}>{workspace.canWrite ? "ویرایش" : "مشاهده"}</Button></TableCell>
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
                          <div className="flex flex-wrap items-center gap-2">
                            {/* 1. تبدیل به داشبورد */}
                            {workspace.canWrite && (["fixed", "live"] as const).map((mode) => (
                              <Button
                                key={mode}
                                variant={mode === "fixed" ? "soft" : "ghost"}
                                disabled={command.busy}
                                onClick={() => archive.setDashboard(report, mode)}
                                className="gap-1.5 text-xs"
                              >
                                <SquaresFourIcon size={15} />
                                {mode === "fixed" ? "تبدیل به داشبورد" : "تنظیم به‌عنوان داشبورد زنده"}
                              </Button>
                            ))}

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
                                    archive.requestApproval(report);
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
