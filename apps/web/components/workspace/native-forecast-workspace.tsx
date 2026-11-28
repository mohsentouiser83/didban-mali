"use client";
import { useState } from "react";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormMessage } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { CursorPagination, Pagination } from "@/components/ui/pagination";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  StatusMessage,
} from "@/components/ui/content-states";
import { CashChart } from "@/components/ui/financial/financial-chart";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableRowHeader,
} from "@/components/ui/table";
import { useNativeForecasts } from "@/hooks/use-native-forecasts";
import { nativeForecastReasons } from "@/lib/native-forecast";
import { amount, displayDate } from "@/lib/utils";
import { Panel } from "./page-parts";
import { NativeForecastQuestionDialog } from "./native-forecast-question-dialog";
export function NativeForecastWorkspace() {
  const c = useNativeForecasts();
  const forecast = c.forecast;
  const [selectedDay, setSelectedDay] = useState("");
  const visibleEvents = selectedDay && forecast
    ? forecast.events.filter((ev) => ev.date === selectedDay)
    : c.events;
  return (
    <div className="space-y-5">
      <Panel title="پیش‌بینی دفتر اصلی">
        {c.statements.loading ? (
          <LoadingState />
        ) : c.statements.error ? (
          <ErrorState
            message={c.statements.error.message}
            onRetry={c.statements.refresh}
          />
        ) : c.statements.data?.items.length ? (
          <div className="space-y-4">
            <Field id="forecast-basis-statement" label="گزارش ثابت ماندهٔ نقد" required>
<Select
              label="گزارش ثابت ماندهٔ نقد"
              value={c.statementId}
              onValueChange={c.setStatementId}
              options={c.statements.data.items.map((row) => ({
                value: row.id,
                label: `${displayDate(row.snapshot.as_of)} · ${row.id.slice(0, 8)}`,
              }))}
            />
</Field>
            <CursorPagination {...c.statements} />
            {c.workspace.canWrite && (
              <>
                <Checkbox
                  id="native-forecast-complete"
                  label="فاکتورها و برنامه‌های پرداخت، تعهدهای آیندهٔ این پیش‌بینی را کامل پوشش می‌دهند"
                  checked={c.complete}
                  onCheckedChange={c.setComplete}
                />
                <Button
                  disabled={!c.statementId}
                  busy={c.command.busy}
                  onClick={c.create}
                >
                  ساخت پیش‌بینی ۳۰روزه
                </Button>
              </>
            )}
          </div>
        ) : (
          <EmptyState
            title="گزارش ثابت نقد موجود نیست"
            description="برای ساخت پیش‌بینی ۳۰روزه و بررسی مسیر D09، ابتدا یک گزارش ثابت دفتر بومی تولید کنید."
            action={<ButtonLink href="/reports/native">تولید نخستین گزارش ثابت</ButtonLink>}
          />
        )}
        <FormMessage error>{c.command.error?.message}</FormMessage>
      </Panel>
      <Panel title="برنامه‌های ذخیره‌شده">
        {c.plans.loading ? (
          <LoadingState />
        ) : c.plans.error ? (
          <ErrorState
            message={c.plans.error.message}
            onRetry={c.plans.refresh}
          />
        ) : c.plans.data?.items.length ? (
          <>
            <Select
              label="ادامه یا مشاهدهٔ برنامه"
              value={c.plan?.id || ""}
              onValueChange={c.load}
              options={c.plans.data.items.map((row) => ({
                value: row.id,
                label: `${displayDate(row.as_of)} · ${row.state === "waiting_input" ? "نیازمند پاسخ" : row.state === "completed_limited" ? "محدود" : "منتشرشده"} · ${row.id.slice(0, 8)}`,
              }))}
            />
            <CursorPagination {...c.plans} />
          </>
        ) : (
          <EmptyState compact title="برنامه‌ای ذخیره نشده" />
        )}
        {c.plan?.state === "waiting_input" && (
          <div className="mt-4 space-y-3">
            <Button variant="secondary" onClick={() => c.setDialogOpen(true)}>
              پاسخ به پرسش
            </Button>
          </div>
        )}
      </Panel>
      {forecast && (
        <Panel
          title={
            forecast.status === "limited"
              ? "مسیر جریان‌های تاریخ‌دار معلوم"
              : "مسیر برآوردی نقد"
          }
          action={
            <Badge tone={forecast.status === "limited" ? "warning" : "neutral"}>
              {forecast.status === "limited" ? "پیش‌بینی محدود" : "برآوردی"}
            </Badge>
          }
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>
              تاریخ مبنا: <b className="text-foreground">{displayDate(forecast.as_of)}</b> · افق{" "}
              {displayDate(forecast.start)} تا {displayDate(forecast.end)}
            </span>
            <Badge tone="neutral">
              {forecast.projection_scope === "declared_complete_obligations"
                ? "پوشش کامل تعهدهای آینده"
                : "صرفاً جریان‌های تاریخ‌دار معلوم"}
            </Badge>
          </div>
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-canvas/50 p-3">
              <div className="text-xs text-muted">ماندهٔ پایه (نقد مبنا)</div>
              <div className="mt-1 font-medium tabular-nums text-foreground">
                {amount(forecast.opening, c.workspace.unit)}{" "}
                <span className="text-xs text-muted">{c.workspace.unit === "IRR" ? "ریال" : "تومان"}</span>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-canvas/50 p-3">
              <div className="text-xs text-muted">
                {forecast.status === "limited" ? "حداقل ماندهٔ جریان‌های معلوم" : "حداقل ماندهٔ افق"}
              </div>
              <div className="mt-1 font-medium tabular-nums text-foreground">
                {amount(
                  forecast.status === "limited" ? forecast.known_dated_minimum : forecast.minimum,
                  c.workspace.unit,
                )}{" "}
                <span className="text-xs text-muted">{c.workspace.unit === "IRR" ? "ریال" : "تومان"}</span>
              </div>
              <div className="mt-1 text-xs text-muted">
                {forecast.first_deficit
                  ? `نخستین کمبود: ${displayDate(forecast.first_deficit)}`
                  : "بدون کسری نقد در این افق"}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-canvas/50 p-3">
              <div className="text-xs text-muted">
                {forecast.status === "limited" ? "مانده با جریان‌های تاریخ‌دار معلوم" : "مانده پایان افق"}
              </div>
              <div className="mt-1 font-display text-xl font-medium tabular-nums text-primary">
                {amount(
                  forecast.status === "limited" ? forecast.known_dated_closing : forecast.closing,
                  c.workspace.unit,
                )}{" "}
                <span className="font-body text-xs text-muted">
                  {c.workspace.unit === "IRR" ? "ریال" : "تومان"}
                </span>
              </div>
            </div>
          </div>
          <CashChart
            days={forecast.days}
            unit={c.workspace.unit}
            label={
              forecast.status === "limited"
                ? "مانده با جریان‌های تاریخ‌دار معلوم"
                : "پیش‌بینی دفتر اصلی در ۳۰ روز آینده"
            }
          />
          {forecast.days.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs">
              <span className="text-muted">جزئیات تعهدهای روز:</span>
              <Button
                variant={selectedDay === "" ? "primary" : "secondary"}
                className="min-h-7 px-2 text-xs"
                onClick={() => setSelectedDay("")}
              >
                همه روزها
              </Button>
              {forecast.days
                .filter((d) => forecast.events.some((ev) => ev.date === d.date))
                .slice(0, 12)
                .map((d) => (
                  <Button
                    key={d.date}
                    variant={selectedDay === d.date ? "primary" : "secondary"}
                    className="min-h-7 px-2 text-xs"
                    onClick={() => setSelectedDay(d.date)}
                  >
                    {displayDate(d.date)}
                  </Button>
                ))}
            </div>
          )}
          {forecast.status === "limited" && (
            <p className="text-sm text-muted">
              ماندهٔ کامل پایان افق و کمترین ماندهٔ کامل نامشخص است.
            </p>
          )}
          {forecast.reason_codes.length > 0 && (
            <StatusMessage tone="warning">
              {forecast.reason_codes
                .map(
                  (code) =>
                    nativeForecastReasons[code] ||
                    "بخشی از زمان یا پوشش پیش‌بینی نامشخص است.",
                )
                .join(" ")}
            </StatusMessage>
          )}
          {c.exportHref && (
            <ButtonLink download href={c.exportHref} variant="secondary">
              دریافت PDF پیش‌بینی
            </ButtonLink>
          )}
          {c.sourceHref && (
            <ButtonLink download href={c.sourceHref} variant="ghost">
              گزارش مبنا
            </ButtonLink>
          )}
          {c.events.length > 0 && (
            <>
              <Table aria-label="رویدادهای پیش‌بینی دفتر اصلی">
                <TableHeader>
                  <TableRow>
                    <TableHead>مرجع</TableHead>
                    <TableHead>تاریخ</TableHead>
                    <TableHead>نوع</TableHead>
                    <TableHead>مبلغ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleEvents.map((row) => (
                    <TableRow key={row.event_id}>
                      <TableRowHeader>{row.obligation_id}</TableRowHeader>
                      <TableCell>{displayDate(row.date)}</TableCell>
                      <TableCell>
                        {row.direction === "receipt"
                          ? "وصول برآوردی"
                          : "پرداخت برنامه‌ای"}
                      </TableCell>
                      <TableCell>
                        {amount(row.amount, c.workspace.unit)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!selectedDay && (
                <Pagination
                  page={c.eventPage}
                  total={c.eventTotal}
                  pageSize={15}
                  onPrevious={c.previousEvents}
                  onNext={c.nextEvents}
                />
              )}
            </>
          )}
        </Panel>
      )}
      {c.run && (
        <Panel
          title={
            c.evaluation.data?.out_of_sample === false
              ? "مقایسهٔ گذشته‌نگر با گردش واقعی"
              : "مقایسه با گردش واقعی هم‌مبنا"
          }
        >
          <Field id="forecast-actual-statement" label="گزارش ثابت پایان افق" required>
<Select
            label="گزارش ثابت پایان افق"
            value={c.actualId}
            onValueChange={c.setActualId}
            options={(c.statements.data?.items || []).map((row) => ({
              value: row.id,
              label: `${displayDate(row.snapshot.as_of)} · ${row.id.slice(0, 8)}`,
            }))}
          />
</Field>
          <CursorPagination {...c.statements} />
          {c.evaluation.loading ? (
            <LoadingState />
          ) : c.evaluation.error ? (
            <ErrorState
              message={c.evaluation.error.message}
              onRetry={c.evaluation.refresh}
            />
          ) : c.evaluation.data?.status === "available" ? (
            <p className="mt-4">
              اختلاف ماندهٔ واقعی و پیش‌بینی در پایان افق:{" "}
              {amount(c.evaluation.data.closing_error, c.workspace.unit)}
            </p>
          ) : (
            c.evaluation.data && (
              <StatusMessage>{c.evaluation.data.reason}</StatusMessage>
            )
          )}
        </Panel>
      )}
      <NativeForecastQuestionDialog controller={c} />
    </div>
  );
}
