"use client";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SearchSelect } from "@/components/ui/search-select";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import {
  LoadingState,
  ErrorState,
  EmptyState,
  StatusMessage,
} from "@/components/ui/content-states";
import { CursorPagination } from "@/components/ui/pagination";
import {
  chequeActionLabels,
  chequeStateLabels,
  type ChequeController,
} from "@/hooks/use-cheques";
import { displayDate } from "@/lib/utils";
export function ChequeEvents({ c }: { c: ChequeController }) {
  return (
    <Drawer
      title={c.selected ? `چک ${c.selected.number}` : "سابقه چک"}
      open={!!c.selected}
      onOpenChange={(open) => {
        if (!open && !c.command.busy) c.setSelected(null);
      }}
    >
      <div className="space-y-5">
        <StatusMessage>
          این بخش فقط سابقه و شاهد بانکی چک را ثبت می‌کند؛ سند حسابداری و تسویه
          فاکتور ایجاد نمی‌شود.
        </StatusMessage>
        {c.selected && <p>{chequeStateLabels[c.selected.state] || "نامشخص"}</p>}
        {c.workspace.canWrite && c.actionOptions.length > 0 && (
          <Form
            onSubmit={(event) => {
              event.preventDefault();
              c.apply();
            }}
            fieldErrors={c.command.error?.fields}
          >
            <Field id="cheque-action" label="رویداد">
              <Select
                id="cheque-action"
                value={c.action}
                onValueChange={c.setAction}
                options={c.actionOptions}
              />
            </Field>
            <Field
              id="cheque-event-period"
              name="period_id"
              label="دوره رویداد"
              error={c.errors["cheque-event-period"]}
            >
              <Select
                id="cheque-event-period"
                value={c.eventPeriod}
                onValueChange={c.setEventPeriod}
                options={c.periodOptions}
              />
            </Field>
            <Field
              id="cheque-event-date"
              name="event_date"
              label="تاریخ رویداد"
              error={c.errors["cheque-event-date"]}
            >
              <PersianDatePicker
                id="cheque-event-date"
                value={c.eventDate}
                onChange={c.setEventDate}
              />
            </Field>
            {c.action === "clear" && (
              <Field
                id="cheque-event-bank"
                name="bank_id"
                label="گردش واقعی بانک"
                error={c.errors["cheque-event-bank"]}
              >
                <SearchSelect
                  id="cheque-event-bank"
                  value={c.bankId}
                  selectedLabel={c.bankLabel}
                  query={c.query}
                  onQueryChange={c.setQuery}
                  onValueChange={c.selectBank}
                  options={c.bankOptions}
                  loading={c.banks.loading}
                  error={c.banks.error?.message}
                  hasMore={!!c.banks.data?.next_cursor}
                />
              </Field>
            )}
            {c.action === "clear" && c.bankPartyKnown === false && (
              <StatusMessage>
                طرف حساب در گردش بانک مشخص نیست؛ دلیل تطبیق با این چک را
                بنویسید.
              </StatusMessage>
            )}
            {c.action === "endorse" && (
              <Field
                id="cheque-endorsee"
                name="endorsed_to"
                label="طرف واگذاری"
              >
                <Input
                  id="cheque-endorsee"
                  required
                  maxLength={100}
                  value={c.endorsedTo}
                  onChange={(event) => c.setEndorsedTo(event.target.value)}
                />
              </Field>
            )}
            <Field id="cheque-event-reason" name="reason" label="دلیل و شرح">
              <Textarea
                id="cheque-event-reason"
                required
                maxLength={1000}
                value={c.reason}
                onChange={(event) => c.setReason(event.target.value)}
              />
            </Field>
            <FormMessage error>{c.command.error?.message}</FormMessage>
            <Button type="submit" busy={c.command.busy}>
              ثبت رویداد
            </Button>
          </Form>
        )}
        <h3 className="font-medium">سابقه چک</h3>
        {c.history.loading ? (
          <LoadingState variant="message" />
        ) : c.history.error ? (
          <ErrorState
            message={c.history.error.message}
            onRetry={c.history.refresh}
          />
        ) : !c.history.data?.items.length ? (
          <EmptyState compact title="رویدادی ثبت نشده" />
        ) : (
          <>
            <ol className="space-y-3">
              {c.history.data.items.map((event) => (
                <li
                  key={event.id}
                  className="rounded-control border border-border p-4"
                >
                  <p>
                    {chequeActionLabels[event.action] || "رویداد"} ·{" "}
                    {displayDate(event.event_date)}
                  </p>
                  <p className="mt-2 break-words text-muted">{event.reason}</p>
                </li>
              ))}
            </ol>
            <CursorPagination {...c.history} />
          </>
        )}
      </div>
    </Drawer>
  );
}
