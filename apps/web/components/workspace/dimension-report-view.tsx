"use client";
import { ChartBarIcon } from "@phosphor-icons/react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
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
  TableEmptyCell,
} from "@/components/ui/table";
import { Pagination, CursorPagination } from "@/components/ui/pagination";
import { useDimensionReporting } from "@/hooks/use-dimensions";
import { useWorkspace } from "@/hooks/workspace";
import { dimensionKinds } from "@/lib/dimensions";
import { amount, displayDate, persian } from "@/lib/utils";
import { NoCompany, PageHeader, Panel, PeriodFilter } from "./page-parts";
import { DimensionAllocationForm } from "./dimension-allocation-form";
export function DimensionReportView() {
  const workspace = useWorkspace();
  return workspace.company ? (
    <Workspace key={workspace.company.id} />
  ) : (
    <NoCompany />
  );
}
function Workspace() {
  const view = useDimensionReporting();
  return (
    <>
      <PageHeader
        title="درآمد و هزینه به تفکیک ابعاد"
        icon={ChartBarIcon}
        action={
          <ButtonLink href="/settings/dimensions" variant="secondary">
            مدیریت ابعاد
          </ButtonLink>
        }
      />
      <PeriodFilter />
      <Panel>
        <Field id="dimension-source" label="منبع گزارش">
          <Select
            id="dimension-source"
            value={view.source}
            onValueChange={(value) =>
              view.setSource(value as typeof view.source)
            }
            options={[
              { value: "imported_manifest", label: "دادهٔ واردشده" },
              { value: "native_statement", label: "دفتر اصلی دیدبان" },
            ]}
          />
        </Field>
        <Field id="report-dimension-kind" label="مبنای تفکیک">
          <Select
            id="report-dimension-kind"
            value={view.kind}
            options={dimensionKinds}
            onValueChange={view.setKind}
          />
        </Field>
        {view.loading ? (
          <LoadingState label="در حال محاسبه ابعاد" />
        ) : view.error ? (
          <ErrorState message={view.error.message} onRetry={view.retry} />
        ) : !view.snapshot ? (
          <EmptyState title="گزارشی برای این دوره موجود نیست" />
        ) : (
          <>
            <p className="my-3 text-xs text-muted">
              {view.snapshot.source === "native_statement"
                ? "دفتر اصلی دیدبان"
                : "دادهٔ واردشده"}{" "}
              · تا {displayDate(view.snapshot.period.end)}
            </p>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              {view.saved ? (
                <>
                  <ButtonLink
                    download
                    href={view.exportHref("pdf")}
                    variant="secondary"
                  >
                    PDF
                  </ButtonLink>
                  <ButtonLink
                    download
                    href={view.exportHref("xlsx")}
                    variant="secondary"
                  >
                    Excel
                  </ButtonLink>
                  <span>
                    نسخهٔ ثابت · {view.saved.snapshot.period.name} ·{" "}
                    {displayDate(view.saved.created_at)}
                  </span>
                  <Button
                    variant="secondary"
                    onClick={() => view.selectSaved(null)}
                  >
                    گزارش جاری
                  </Button>
                </>
              ) : (
                view.workspace.canWrite && (
                  <Button onClick={view.saveReport} busy={view.command.busy}>
                    ذخیره نسخه گزارش
                  </Button>
                )
              )}
            </div>
            {view.snapshot.reason && (
              <StatusMessage>{view.snapshot.reason}</StatusMessage>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>بُعد</TableHead>
                  <TableHead>درآمد تخصیص‌یافته (ریال)</TableHead>
                  <TableHead>هزینه تخصیص‌یافته (ریال)</TableHead>
                  <TableHead>خالص تخصیص‌یافته (ریال)</TableHead>
                  <TableHead>سود کامل (ریال)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.bucketRows.map((bucket) => (
                  <TableRow key={bucket.id}>
                    <TableRowHeader>{bucket.name}</TableRowHeader>
                    <TableCell>{amount(bucket.revenue)}</TableCell>
                    <TableCell>{amount(bucket.expense)}</TableCell>
                    <TableCell>{amount(bucket.assigned_net)}</TableCell>
                    <TableCell>{amount(bucket.profit)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableRowHeader>
                    تخصیص‌نیافته ({persian(view.snapshot.unassigned.line_count)}{" "}
                    ردیف)
                  </TableRowHeader>
                  <TableCell>
                    {amount(view.snapshot.unassigned.revenue)}
                  </TableCell>
                  <TableCell>
                    {amount(view.snapshot.unassigned.expense)}
                  </TableCell>
                  <TableCell>—</TableCell>
                  <TableCell>—</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <Pagination
              page={view.bucketPage}
              total={view.bucketTotal}
              onPrevious={view.previousBucket}
              onNext={view.nextBucket}
            />
          </>
        )}
        <FormMessage error>{view.command.error?.message}</FormMessage>
      </Panel>
      {view.snapshot && (
        <Panel title="ردیف‌های منبع" className="mt-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>حساب</TableHead>
                <TableHead>تاریخ</TableHead>
                <TableHead>مبلغ (ریال)</TableHead>
                <TableHead>تخصیص</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.rows.length ? (
                view.rows.map((line) => (
                  <TableRow key={line.id}>
                    <TableRowHeader>{line.account}</TableRowHeader>
                    <TableCell>{displayDate(line.date)}</TableCell>
                    <TableCell>{amount(line.amount)}</TableCell>
                    <TableCell>
                      {!view.saved && view.workspace.canWrite ? (
                        <Button
                          variant="secondary"
                          onClick={() => view.open(line)}
                        >
                          {line.allocation ? "بازبینی تخصیص" : "تعیین بُعد"}
                        </Button>
                      ) : line.allocation ? (
                        "تخصیص‌یافته"
                      ) : (
                        "تخصیص‌نیافته"
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableEmptyCell
                  colSpan={4}
                  title="ردیف درآمد یا هزینه‌ای موجود نیست"
                />
              )}
            </TableBody>
          </Table>
          <Pagination
            page={view.page}
            total={view.total}
            onPrevious={view.previous}
            onNext={view.next}
          />
        </Panel>
      )}
      <Panel title="نسخه‌های ذخیره‌شده" className="mt-5">
        {view.history.loading ? (
          <LoadingState />
        ) : view.history.error ? (
          <ErrorState
            message={view.history.error.message}
            onRetry={view.history.refresh}
          />
        ) : (
          <div className="flex flex-wrap gap-3">
            {view.history.data?.items.map((run) => (
              <Button
                key={run.id}
                variant="secondary"
                onClick={() => view.selectSaved(run)}
              >
                {displayDate(run.created_at)}
              </Button>
            ))}
          </div>
        )}
        <CursorPagination {...view.history} />
      </Panel>
      <DimensionAllocationForm view={view} />
    </>
  );
}
