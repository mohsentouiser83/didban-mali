"use client";
import {
  CalendarBlankIcon,
  CoinsIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useJournalEntryType } from "@/hooks/use-journal-entry-type";
import { OperationDraftView } from "./operation-draft-view";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, FieldError, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { AmountInput, Input, Textarea } from "@/components/ui/input";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Select } from "@/components/ui/select";
import { ErrorState, StatusMessage } from "@/components/ui/content-states";
import type { useJournalDrafts } from "@/hooks/use-accounting";
import { amount, persian } from "@/lib/utils";

export function JournalDraftForm({
  view,
}: {
  view: ReturnType<typeof useJournalDrafts>;
}) {
  const entry = useJournalEntryType(view.editing !== undefined);
  const editable =
    !!view.capabilities.data?.can_prepare &&
    (!view.editing || (view.editing.state === "draft" && !view.editing.inventory_origin));
  const unitLabel = "ریال";
  return (
    <Drawer
      title={view.editing ? (editable ? "مشاهده و ویرایش سند" : "مشاهده سند") : "سند جدید"}
      open={view.editing !== undefined}
      onOpenChange={(open) => {
        if (!open && !view.command.busy) view.close();
      }}
      className="sm:max-w-2xl"
    >
      {!view.editing &&
      !view.replacement &&
      (view.requiresAccounts || view.requiresPeriod) ? (
        <div className="space-y-4">
          {view.requiresAccounts && <p>برای ساخت سند، حساب فعال تعریف کنید.</p>}
          {view.requiresPeriod && <p>برای ساخت سند، دوره مالی تعریف کنید.</p>}
        </div>
      ) : (
        <>
          {!view.editing && !view.replacement && (
            <Field id="journal-entry-type" label="نوع سند" required>
              <Select
                id="journal-entry-type"
                value={entry.kind}
                onValueChange={entry.choose}
                options={entry.options}
                searchable
                searchPlaceholder="جستجوی نوع سند..."
              />
              {entry.catalogue.loading && (
                <FormMessage>در حال دریافت انواع سند…</FormMessage>
              )}
              {entry.catalogue.error && (
                <ErrorState
                  message={entry.catalogue.error.message}
                  onRetry={entry.catalogue.refresh}
                />
              )}
            </Field>
          )}
          <div key={entry.kind} className="space-y-5 motion-safe:animate-fade-in">
            {entry.kind !== "manual" && !view.editing && !view.replacement ? (
              <OperationDraftView
                key={entry.kind}
                initialKind={entry.kind}
                embedded
                onCreated={() => {
                  view.close();
                  view.refresh();
                }}
              />
            ) : (
              <Form
                fieldErrors={{ ...view.command.error?.fields, ...view.errors }}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (editable) view.save();
                }}
              >
                {view.replacement && (
                  <Field
                    id="replacement-reason"
                    label="دلیل اصلاح"
                    error={view.errors["replacement-reason"]}
                  >
                    <Textarea
                      id="replacement-reason"
                      required
                      value={view.replacement.reason}
                      onChange={(event) =>
                        view.setReplacementReason(event.target.value)
                      }
                    />
                  </Field>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    id="draft-date"
                    label="تاریخ سند"
                    icon={CalendarBlankIcon}
                    error={view.errors["draft-date"]}
                    required
                  >
                    <PersianDatePicker
                      id="draft-date"
                      value={view.value.date}
                      onChange={(value) => view.change("date", value)}
                      disabled={!editable || view.command.busy}
                    />
                  </Field>
                </div>
                <Field
                  id="draft-description"
                  label="شرح سند"
                  error={view.errors["draft-description"]}
                >
                  <Textarea
                    id="draft-description"
                    required
                    maxLength={500}
                    value={view.value.description}
                    disabled={!editable || view.command.busy}
                    onChange={(event) =>
                      view.change("description", event.target.value)
                    }
                  />
                </Field>
                <div className="space-y-4">
                  {view.value.lines.map((line, index) => (
                    <fieldset
                      key={index}
                      disabled={view.command.busy}
                      className="min-w-0 space-y-4 rounded-panel border border-border p-4"
                    >
                      <legend className="px-2 font-medium">
                        ردیف {persian(index + 1)}
                      </legend>
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <Field
                            id={`line-${index}-account`}
                            label="حساب"
                            error={view.errors[`line-${index}-account`]}
                            required
                          >
                            <Select
                              id={`line-${index}-account`}
                              value={line.account_id}
                              disabled={!editable}
                              options={view.accountOptions}
                              searchable
                              searchPlaceholder="جستجوی کد یا نام حساب..."
                              onValueChange={(id) =>
                                view.line(index, { account_id: id })
                              }
                            />
                          </Field>
                        </div>
                        {editable && (
                          <Button
                            variant="ghost"
                            className="mt-8 size-11 p-0"
                            disabled={view.value.lines.length <= 2}
                            aria-label={`حذف ردیف ${persian(index + 1)}`}
                            onClick={() => view.removeLine(index)}
                          >
                            <TrashIcon size={18} aria-hidden />
                          </Button>
                        )}
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                          id={`line-${index}-debit`}
                          label={`بدهکار (${unitLabel})`}
                          icon={CoinsIcon}
                          error={view.errors[`line-${index}-debit`]}
                        >
                          <AmountInput
                            id={`line-${index}-debit`}
                            value={line.debit}
                            disabled={!editable}
                            onValueChange={(debit) => view.line(index, { debit })}
                          />
                        </Field>
                        <Field
                          id={`line-${index}-credit`}
                          label={`بستانکار (${unitLabel})`}
                          icon={CoinsIcon}
                          error={view.errors[`line-${index}-credit`]}
                        >
                          <AmountInput
                            id={`line-${index}-credit`}
                            value={line.credit}
                            disabled={!editable}
                            onValueChange={(credit) =>
                              view.line(index, { credit })
                            }
                          />
                        </Field>
                      </div>
                      <Field id={`line-${index}-party`} label="شناسه طرف حساب">
                        <Input
                          id={`line-${index}-party`}
                          value={line.party_id}
                          maxLength={100}
                          disabled={!editable}
                          onChange={(event) =>
                            view.line(index, { party_id: event.target.value })
                          }
                        />
                      </Field>
                    </fieldset>
                  ))}
                  {editable && (
                    <Button
                      variant="secondary"
                      onClick={view.addLine}
                      disabled={
                        view.command.busy || view.value.lines.length >= 200
                      }
                    >
                      <PlusIcon size={18} aria-hidden />
                      افزودن ردیف
                    </Button>
                  )}
                </div>
                <div
                  aria-live="polite"
                  className="grid gap-3 rounded-control bg-canvas p-4 sm:grid-cols-2"
                >
                  <p className="text-sm">
                    جمع بدهکار{" "}
                    <span className="mt-1 block font-medium tabular-nums">
                      {amount(view.totals.totalDebit)} {unitLabel}
                    </span>
                  </p>
                  <p className="text-sm">
                    جمع بستانکار{" "}
                    <span className="mt-1 block font-medium tabular-nums">
                      {amount(view.totals.totalCredit)} {unitLabel}
                    </span>
                  </p>
                </div>
                <FieldError>
                  {view.errors.balance || view.errors.lines}
                </FieldError>
                <StatusMessage>
                  ذخیرهٔ پیش‌نویس اثر مالی ندارد؛ ثبت نهایی از فهرست اسناد انجام
                  می‌شود.
                </StatusMessage>
                <FormMessage error>{!view.value.period_id ? "دوره را از هدر انتخاب کنید." : view.command.error?.message}</FormMessage>
                {editable && (
                  <Button type="submit" busy={view.command.busy}>
                    ذخیره پیش‌نویس
                  </Button>
                )}
              </Form>
            )}
          </div>
        </>
      )}
    </Drawer>
  );
}
