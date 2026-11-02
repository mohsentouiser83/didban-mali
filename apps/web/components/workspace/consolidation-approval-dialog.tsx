"use client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import {
  ErrorState,
  LoadingState,
  StatusMessage,
} from "@/components/ui/content-states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowHeader,
} from "@/components/ui/table";
import type { useConsolidation } from "@/hooks/use-consolidation";
import { amount, displayDate, persian } from "@/lib/utils";

export function ConsolidationApprovalDialog({
  view,
}: {
  view: ReturnType<typeof useConsolidation>;
}) {
  const checked = view.approvalPreview.data;
  return (
    <Dialog
      open={view.approvalOpen}
      onOpenChange={(open) => {
        if (!open) view.closeApproval();
      }}
      title="تأیید نسخهٔ گزارش"
      footer={
        <>
          <Button
            variant="secondary"
            disabled={view.approvalCommand.busy}
            onClick={view.closeApproval}
          >
            انصراف
          </Button>
          <Button
            busy={view.approvalCommand.busy}
            disabled={
              !checked?.can_approve ||
              !view.workspace.canApprove ||
              view.approvalPreview.loading ||
              !!view.approvalPreview.error
            }
            onClick={view.approve}
          >
            تأیید همین نسخه
          </Button>
        </>
      }
    >
      {view.approvalPreview.loading ? (
        <LoadingState label="در حال دریافت نسخهٔ بررسی" />
      ) : view.approvalPreview.error ? (
        <ErrorState
          message={view.approvalPreview.error.message}
          onRetry={view.approvalPreview.refresh}
        />
      ) : (
        checked && (
          <div className="space-y-4">
            <p className="font-medium">{checked.draft.snapshot.title}</p>
            <p>
              {displayDate(checked.draft.snapshot.period.start)} تا{" "}
              {displayDate(checked.draft.snapshot.period.end)} ·{" "}
              {persian(checked.draft.snapshot.pairs.length)} حذف منتخب ·{" "}
              {checked.draft.snapshot.source_basis === "native_statement"
                ? "دفتر اصلی دیدبان"
                : "دفتر واردشده"}
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>شاخص (ریال)</TableHead>
                  <TableHead>قبل از حذف</TableHead>
                  <TableHead>تعدیل</TableHead>
                  <TableHead>پس از حذف</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checked.draft.snapshot.metrics.map((metric) => (
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
            <StatusMessage>
              تأیید فقط برای حذف‌های منتخب همین نسخه است؛ سند حسابداری یا گواهی
              قانونی ایجاد نمی‌شود.
            </StatusMessage>
            <p dir="ltr" className="break-all font-mono text-xs text-muted">
              {checked.expected_digest}
            </p>
            {!checked.can_approve && (
              <FormMessage error>مجوز تأیید گزارش ندارید.</FormMessage>
            )}
          </div>
        )
      )}
      <FormMessage error>{view.approvalCommand.error?.message}</FormMessage>
    </Dialog>
  );
}
