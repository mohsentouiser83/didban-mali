"use client";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Textarea } from "@/components/ui/input";
import {
  ErrorState,
  LoadingState,
  StatusMessage,
  EmptyState,
} from "@/components/ui/content-states";
import { CursorPagination } from "@/components/ui/pagination";
import { usePeriodLock } from "@/hooks/use-period-lock";
import { displayDate, persian } from "@/lib/utils";
import { PeriodTasksPanel } from "./period-tasks-panel";
export function PeriodLockPanel({ periodId }: { periodId: string }) {
  const c = usePeriodLock(periodId);
  const item = c.resource.data;
  return (
    <div className="space-y-5">
      {c.resource.loading ? (
        <LoadingState label="در حال بررسی آمادگی دوره" />
      ) : c.resource.error ? (
        <ErrorState
          message={c.resource.error.message}
          onRetry={c.resource.refresh}
        />
      ) : (
        item && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={item.closed ? "warning" : "success"}>
                {item.closed ? "بسته" : "باز"}
              </Badge>
              <span>
                {persian(item.draft_count)} پیش‌نویس ·{" "}
                {persian(item.active_session_count)} پردازش فعال
              </span>
              {item.reporting_basis && (
                <Badge tone="neutral">
                  {item.reporting_basis === "native_book"
                    ? "دفتر اصلی دیدبان"
                    : "منابع واردشده"}
                </Badge>
              )}
              {item.closing_journal_present && (
                <Badge tone="neutral">سند بستن ثبت‌شده</Badge>
              )}
              {c.nativeReportHref && (
                <ButtonLink download href={c.nativeReportHref} variant="ghost">
                  گزارش مبنا
                </ButtonLink>
              )}
            </div>
            <StatusMessage tone="primary">
              این عملیات فقط دوره را قفل می‌کند؛ سند اختتامیه یا افتتاحیه
              نمی‌سازد.
            </StatusMessage>
            {item.errors.length > 0 && (
              <StatusMessage tone="danger">
                <ul className="list-inside list-disc">
                  {item.errors.map((error) => (
                    <li key={error.id}>{error.title}</li>
                  ))}
                </ul>
              </StatusMessage>
            )}
            {item.warnings.length > 0 && (
              <div className="rounded-control border border-border p-4">
                <ul className="list-inside list-disc space-y-2">
                  {item.warnings.map((warning) => (
                    <li key={warning.id}>{warning.title}</li>
                  ))}
                </ul>
              </div>
            )}
            <PeriodTasksPanel
              periodId={periodId}
              items={item.custom_items || []}
              closed={item.closed}
              refresh={c.resource.refresh}
            />
            {c.canAct && (
              <Form
                onSubmit={(event) => {
                  event.preventDefault();
                  c.transition();
                }}
                fieldErrors={c.command.error?.fields}
              >
                <Field
                  id="period-lock-reason"
                  label={item.closed ? "دلیل بازگشایی" : "دلیل بستن دوره"}
                >
                  <Textarea
                    id="period-lock-reason"
                    required
                    maxLength={1000}
                    value={c.reason}
                    disabled={c.command.busy}
                    onChange={(event) => c.setReason(event.target.value)}
                  />
                </Field>
                {!item.closed && item.warnings.length > 0 && (
                  <Checkbox
                    id="period-lock-warnings"
                    label="موارد قابل بررسی را با این دلیل می‌پذیرم"
                    checked={c.ack}
                    disabled={c.command.busy}
                    onCheckedChange={c.setAck}
                  />
                )}
                <FormMessage error>{c.command.error?.message}</FormMessage>
                <Button
                  type="submit"
                  busy={c.command.busy}
                  disabled={c.disabled}
                >
                  {item.closed ? "بازگشایی دوره" : "بستن عملیاتی دوره"}
                </Button>
              </Form>
            )}
          </>
        )
      )}
      <section className="space-y-3">
        <h3 className="font-medium">سابقه قفل دوره</h3>
        {c.history.loading ? (
          <LoadingState variant="message" />
        ) : c.history.error ? (
          <ErrorState
            message={c.history.error.message}
            onRetry={c.history.refresh}
          />
        ) : !c.history.data?.items.length ? (
          <EmptyState compact title="بستن یا بازگشایی ثبت نشده" />
        ) : (
          <>
            <ol className="space-y-3">
              {c.history.data.items.map((event) => (
                <li
                  key={event.id}
                  className="rounded-control border border-border p-4"
                >
                  <p>
                    {event.action === "closed" ? "بسته شد" : "بازگشایی شد"} ·{" "}
                    {displayDate(event.created_at)}
                  </p>
                  <p className="mt-2 break-words text-muted">{event.reason}</p>
                </li>
              ))}
            </ol>
            <CursorPagination {...c.history} />
          </>
        )}
      </section>
    </div>
  );
}
