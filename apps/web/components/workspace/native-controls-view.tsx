"use client";
import { ShieldCheckIcon } from "@phosphor-icons/react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, FormMessage } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { CursorPagination, Pagination } from "@/components/ui/pagination";
import {
  EmptyState,
  ErrorState,
  LoadingState,
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
import {
  useNativeControls,
  type NativeControlsController,
} from "@/hooks/use-native-controls";
import { useWorkspace } from "@/hooks/workspace";
import { amount, displayDate, persian } from "@/lib/utils";
import { PageHeader, Panel, NoCompany } from "./page-parts";
import { NativeControlEvidence } from "./native-control-evidence";
export function NativeControlsView() {
  const w = useWorkspace();
  return w.company ? (
    <Workspace key={`${w.user?.id}:${w.company.id}`} />
  ) : (
    <NoCompany />
  );
}
function Workspace() {
  const c = useNativeControls();
  return (
    <>
      <PageHeader
        title="کنترل دفتر اصلی"
        icon={ShieldCheckIcon}
        action={
          <ButtonLink href="/review" variant="secondary">
            بررسی و شواهد
          </ButtonLink>
        }
      />
      <Panel>
        <div className="flex flex-wrap items-end gap-4">
          <Field id="native-control-period" label="دوره مالی">
            <Select
              id="native-control-period"
              value={c.periodId}
              options={c.periodOptions}
              onValueChange={c.setPeriod}
            />
          </Field>
          <Button variant="secondary" onClick={c.refresh}>
            بررسی جاری
          </Button>
          {c.workspace.canWrite && (
            <Button
              busy={c.command.busy}
              disabled={!c.periodId || !c.live.data}
              onClick={c.save}
            >
              ذخیره بررسی جاری
            </Button>
          )}
          {c.runId && <Badge>نسخه ذخیره‌شده</Badge>}
        </div>
        <FormMessage error>{c.command.error?.message}</FormMessage>
      </Panel>
      <div className="mt-5 space-y-5">
        {!c.periodId ? (
          <EmptyState title="دوره مالی را انتخاب کنید" />
        ) : c.resource.loading ? (
          <LoadingState label="در حال بررسی دفتر اصلی" />
        ) : c.resource.error ? (
          <ErrorState
            message={c.resource.error.message}
            onRetry={c.resource.refresh}
          />
        ) : c.snapshot ? (
          <>
            <Panel title="موارد نیازمند رسیدگی">
              <Findings c={c} />
            </Panel>
            <Panel title="مقایسه هزینه اسناد ثبت‌شده">
              <Expenses c={c} />
            </Panel>
          </>
        ) : null}
        <Panel title="سابقه بررسی‌ها">
          {c.history.loading ? (
            <LoadingState label="در حال دریافت بررسی‌ها" />
          ) : c.history.error ? (
            <ErrorState
              message={c.history.error.message}
              onRetry={c.history.refresh}
            />
          ) : !c.history.data?.items.length ? (
            <EmptyState compact title="بررسی‌ای ذخیره نشده" />
          ) : (
            <div className="flex flex-wrap gap-2">
              {c.history.data.items.map((run) => (
                <Button
                  key={run.id}
                  variant="secondary"
                  onClick={() => c.selectRun(run.id)}
                >
                  {displayDate(run.created_at)} ·{" "}
                  {persian(run.snapshot.finding_count)} مورد
                </Button>
              ))}
            </div>
          )}
          <CursorPagination {...c.history} />
        </Panel>
      </div>
      <NativeControlEvidence c={c} />
    </>
  );
}
function Findings({ c }: { c: NativeControlsController }) {
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>موضوع</TableHead>
            <TableHead>نوع بررسی</TableHead>
            <TableHead>مبلغ مبنای بررسی (ریال)</TableHead>
            <TableHead>شواهد و رسیدگی</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {c.findingRows.length ? (
            c.findingRows.map((row) => (
              <TableRow key={row.id}>
                <TableRowHeader>
                  {row.title}
                  <p className="mt-2 font-normal text-muted">{row.detail}</p>
                </TableRowHeader>
                <TableCell>
                  <Badge
                    tone={
                      row.classification === "review" ? "warning" : "neutral"
                    }
                  >
                    {row.classification === "review"
                      ? "نیازمند بررسی"
                      : "داده ناکافی"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {amount(row.amount)}
                  <p className="mt-1 text-xs text-muted">{row.amount_label}</p>
                </TableCell>
                <TableCell>
                  <Button
                    variant="secondary"
                    onClick={() => c.openEvidence(row.title, row.journal_refs)}
                  >
                    شواهد و پیگیری
                  </Button>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableEmptyCell
              colSpan={4}
              title="در کنترل‌های بررسی‌شده موردی یافت نشد"
            />
          )}
        </TableBody>
      </Table>
      <Pagination
        page={c.findingPage}
        total={c.snapshot?.findings.length || 0}
        onPrevious={() => c.pageFindings(-1)}
        onNext={() => c.pageFindings(1)}
      />
    </>
  );
}
function Expenses({ c }: { c: NativeControlsController }) {
  const comparison = c.snapshot?.expense_comparison;
  if (!comparison || comparison.status !== "available")
    return (
      <EmptyState
        compact
        title="مقایسه آماده نیست"
        description={comparison?.reason || undefined}
      />
    );
  return (
    <>
      <StatusMessage>
        تغییر مبلغ، به‌تنهایی خطا یا تخلف را ثابت نمی‌کند.
      </StatusMessage>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>حساب</TableHead>
            <TableHead>این دوره (ریال)</TableHead>
            <TableHead>دوره قبل (ریال)</TableHead>
            <TableHead>تغییر (ریال)</TableHead>
            <TableHead>شواهد</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {c.expenseRows.length ? (
            c.expenseRows.map((row) => (
              <TableRow key={row.account_id}>
                <TableRowHeader>
                  {row.code} · {row.name}
                </TableRowHeader>
                <TableCell>{amount(row.current)}</TableCell>
                <TableCell>{amount(row.previous)}</TableCell>
                <TableCell>{amount(row.difference)}</TableCell>
                <TableCell>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      c.openEvidence(`شواهد ${row.code}`, row.journal_refs)
                    }
                  >
                    بررسی دو دوره
                  </Button>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableEmptyCell
              colSpan={5}
              title="حساب هزینه‌ای در اسناد دو دوره موجود نیست"
            />
          )}
          <TableRow>
            <TableRowHeader>جمع</TableRowHeader>
            <TableCell>{amount(comparison.current_total)}</TableCell>
            <TableCell>{amount(comparison.previous_total)}</TableCell>
            <TableCell>{amount(comparison.difference)}</TableCell>
            <TableCell />
          </TableRow>
        </TableBody>
      </Table>
      <Pagination
        page={c.expensePage}
        total={comparison.rows.length}
        onPrevious={() => c.pageExpenses(-1)}
        onNext={() => c.pageExpenses(1)}
      />
    </>
  );
}
