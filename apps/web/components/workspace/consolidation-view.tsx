"use client";
import { BuildingsIcon } from "@phosphor-icons/react";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  ErrorState,
  LoadingState,
  EmptyState,
  StatusMessage,
} from "@/components/ui/content-states";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableRowHeader,
} from "@/components/ui/table";
import { CursorPagination, Pagination } from "@/components/ui/pagination";
import { FormMessage } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { useConsolidation } from "@/hooks/use-consolidation";
import { useWorkspace } from "@/hooks/workspace";
import { amount, displayDate } from "@/lib/utils";
import { NoCompany, PageHeader, Panel } from "./page-parts";
import { ConsolidationMappingForm } from "./consolidation-mapping-form";
import { ConsolidationPairForm } from "./consolidation-pair-form";
import { ConsolidationApprovalDialog } from "./consolidation-approval-dialog";
export function ConsolidationView() {
  const workspace = useWorkspace();
  return workspace.company ? (
    <Workspace key={`${workspace.user?.id}:${workspace.company.id}`} />
  ) : (
    <NoCompany />
  );
}
function Workspace() {
  const view = useConsolidation();
  return (
    <>
      <PageHeader
        title="حذف‌های درون‌گروهی"
        icon={BuildingsIcon}
        action={
          <ButtonLink href="/reports/companies" variant="secondary">
            مقایسه شرکت‌ها
          </ButtonLink>
        }
      />
      <Panel title="انتخاب نسخهٔ مقایسه">
        {view.history.loading ? (
          <LoadingState />
        ) : view.history.error ? (
          <ErrorState
            message={view.history.error.message}
            onRetry={view.history.refresh}
          />
        ) : view.history.data?.items.length ? (
          <div className="flex flex-wrap gap-2">
            {view.history.data.items.map((item) => (
              <Button
                key={item.id}
                variant="secondary"
                busy={view.command.busy}
                onClick={() => view.selectComparison(item)}
              >
                {item.snapshot.title} · {displayDate(item.snapshot.period.end)}
              </Button>
            ))}
          </div>
        ) : (
          <EmptyState title="ابتدا مقایسهٔ هم‌دوره ذخیره کنید" />
        )}
        <CursorPagination {...view.history} />
        <FormMessage error>
          {!view.comparison ? view.command.error?.message : undefined}
        </FormMessage>
      </Panel>
      {view.comparison && (
        <Panel
          title="طرف‌های متقابل و زوج‌های منبع"
          className="mt-5"
          action={
            view.canManage && (
              <Button variant="secondary" onClick={view.openMapping}>
                ثبت یا بازبینی نگاشت
              </Button>
            )
          }
        >
          <StatusMessage>
            فقط مالکیت ۱۰۰٪ با اظهار کاربر؛ تأیید گزارش، سند حسابداری ایجاد
            نمی‌کند.
          </StatusMessage>
          {view.sources.loading || view.mappings.loading ? (
            <LoadingState />
          ) : view.sources.error || view.mappings.error ? (
            <ErrorState
              message={
                view.sources.error?.message || view.mappings.error?.message
              }
            />
          ) : (
            <>
              <ul className="my-4 space-y-2">
                {view.currentMappings.map((mapping) => (
                  <li
                    key={mapping.id}
                    className="rounded-control border border-border p-3"
                  >
                    <span>
                      {mapping.left_party_id} ↔ {mapping.right_party_id}
                    </span>
                    <p className="text-xs text-muted">
                      {mapping.ownership_declaration.note}
                    </p>
                  </li>
                ))}
              </ul>
              {view.sources.data?.unavailable.map((item) => (
                <StatusMessage key={item.company_id}>
                  {item.reason}
                </StatusMessage>
              ))}
              {view.workspace.canWrite && <ConsolidationPairForm view={view} />}
            </>
          )}
        </Panel>
      )}
      {view.draft && (
        <Panel
          title={view.draft.snapshot.title}
          className="mt-5"
          action={
            <div className="flex flex-wrap gap-2">
              <ButtonLink download href={view.exportHref} variant="secondary">
                Excel همین نسخه
              </ButtonLink>
              {view.canReviewApproval && (
                <Button onClick={view.openApproval}>بررسی و تأیید گزارش</Button>
              )}
            </div>
          }
        >
          <Badge tone={view.draft.approvals?.length ? "success" : "warning"}>
            {view.draft.approvals?.length
              ? "حذف‌های منتخب تأیید شده‌اند"
              : "پیش‌نویس؛ تأییدنشده"}
          </Badge>
          <StatusMessage>
            فقط حذف‌های انتخاب‌شده؛ پوشش همهٔ معاملات و مالکیت مستقل احراز نشده
            است.
          </StatusMessage>
          {!!view.draft.approvals?.length && (
            <ul className="my-3 space-y-1 text-sm text-muted">
              {view.approvalRows.map((approval) => (
                <li key={approval.id}>
                  {approval.actor_name || "کاربر"} · {approval.timeLabel}
                </li>
              ))}
            </ul>
          )}
          <p className="my-3 text-sm">
            {displayDate(view.draft.snapshot.period.start)} تا{" "}
            {displayDate(view.draft.snapshot.period.end)} ·{" "}
            {view.draft.snapshot.source_basis === "native_statement"
              ? "دفتر اصلی دیدبان"
              : "دفتر واردشده"}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>شاخص دفتر</TableHead>
                <TableHead>جمع پیش از حذف پیشنهادی (ریال)</TableHead>
                <TableHead>تعدیل پیشنهادی (ریال)</TableHead>
                <TableHead>پس از حذف پیشنهادی (ریال)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.draft.snapshot.metrics.map((metric) => (
                <TableRow key={metric.metric_key}>
                  <TableRowHeader>{metric.label}</TableRowHeader>
                  <TableCell>{amount(metric.before)}</TableCell>
                  <TableCell>{amount(metric.adjustment)}</TableCell>
                  <TableCell>
                    {amount(metric.after)}
                    {metric.reason && (
                      <p className="text-xs text-muted">{metric.reason}</p>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>مرجع</TableHead>
                  <TableHead>تاریخ</TableHead>
                  <TableHead>مبلغ حذف پیشنهادی (ریال)</TableHead>
                  <TableHead>دلیل بررسی</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.pairRows.map((pair, index) => (
                  <TableRow key={index}>
                    <TableRowHeader>{pair.reference}</TableRowHeader>
                    <TableCell>{displayDate(pair.date)}</TableCell>
                    <TableCell>{amount(pair.amount)}</TableCell>
                    <TableCell>{pair.review_reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              page={view.page}
              total={view.pairTotal}
              onPrevious={view.previous}
              onNext={view.next}
            />
          </div>
        </Panel>
      )}
      <Panel title="پیش‌نویس‌های ذخیره‌شده" className="mt-5">
        {view.drafts.loading ? (
          <LoadingState />
        ) : view.drafts.error ? (
          <ErrorState
            message={view.drafts.error.message}
            onRetry={view.drafts.refresh}
          />
        ) : view.drafts.data?.items.length ? (
          <div className="flex flex-wrap gap-2">
            {view.drafts.data.items.map((item) => (
              <Button
                key={item.id}
                variant="secondary"
                busy={view.command.busy}
                onClick={() => view.viewDraft(item)}
              >
                {item.snapshot.title} · {displayDate(item.created_at)}
              </Button>
            ))}
          </div>
        ) : (
          <EmptyState title="پیش‌نویسی ذخیره نشده" />
        )}
        <CursorPagination {...view.drafts} />
      </Panel>
      <ConsolidationMappingForm view={view} />
      <ConsolidationApprovalDialog view={view} />
    </>
  );
}
