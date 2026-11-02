"use client";
import {
  ChatCircleTextIcon,
  CalendarBlankIcon,
  UserIcon,
  CoinsIcon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ErrorState,
  LoadingState,
  StatusMessage,
} from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { AmountInput, Textarea } from "@/components/ui/input";
import { CursorPagination } from "@/components/ui/pagination";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Select } from "@/components/ui/select";
import type { useControlCasePanel } from "@/hooks/use-control-workspace";
import {
  activityKindLabel,
  caseStates,
  controlStateLabel,
} from "@/lib/control";
import { amount, displayDate } from "@/lib/utils";
import { EvidenceList } from "./evidence-list";

export function ControlCasePanel({
  view,
}: {
  view: ReturnType<typeof useControlCasePanel>;
}) {
  return (
    <Drawer
      title={view.source?.title || "پروندهٔ پیگیری"}
      open={!!view.selection}
      onOpenChange={(open) => {
        if (!open && !view.command.busy) view.close();
      }}
    >
      {view.source && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            {view.source.classification && (
              <Badge>{view.source.classification.label}</Badge>
            )}
            {view.currentCase && (
              <Badge
                tone={
                  view.currentCase.state === "resolved" ? "success" : "primary"
                }
              >
                {controlStateLabel(view.currentCase.state)}
              </Badge>
            )}
          </div>
          <dl className="grid gap-4 rounded-control bg-canvas p-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted">
                {view.source.kind === "invoice"
                  ? "مانده در مبنای پرونده (ریال)"
                  : "مبلغ درگیر (ریال)"}
              </dt>
              <dd className="mt-2 tabular-nums">
                {amount(
                  view.source.kind === "invoice"
                    ? view.source.remaining
                    : view.source.amount,
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">تاریخ مبنای پرونده</dt>
              <dd className="mt-2">{displayDate(view.source.as_of_date)}</dd>
            </div>
          </dl>
          <EvidenceList evidence={view.source.evidence_refs} />
          {view.detail.error && (
            <ErrorState
              message={view.detail.error.message}
              onRetry={view.refresh}
            />
          )}
          {view.newerVersionAvailable && (
            <StatusMessage>
              پرونده تغییر کرده است.
              <Button
                variant="secondary"
                className="mt-2"
                onClick={view.reloadLatest}
              >
                دریافت آخرین نسخه
              </Button>
            </StatusMessage>
          )}
          {view.workspace.canWrite ? (
            <Form
              fieldErrors={view.command.error?.fields}
              onSubmit={(event) => {
                event.preventDefault();
                view.save();
              }}
            >
              {view.assignees.error ? (
                <ErrorState
                  message={view.assignees.error.message}
                  onRetry={view.assignees.refresh}
                />
              ) : (
                <Field
                  id="control-assignee"
                  label="مسئول پیگیری"
                  icon={UserIcon}
                >
                  <Select
                    id="control-assignee"
                    value={view.value.assignee}
                    options={view.assigneeOptions}
                    onValueChange={(assignee) => view.change({ assignee })}
                    disabled={view.assignees.loading || view.command.busy}
                  />
                </Field>
              )}
              <Field
                id="control-due"
                label="مهلت پیگیری"
                icon={CalendarBlankIcon}
              >
                <PersianDatePicker
                  id="control-due"
                  value={view.value.due_date}
                  onChange={(due_date) => view.change({ due_date })}
                  disabled={view.command.busy}
                />
              </Field>
              {view.value.due_date && (
                <Button
                  variant="ghost"
                  disabled={view.command.busy}
                  onClick={() => view.change({ due_date: "" })}
                >
                  پاک‌کردن مهلت
                </Button>
              )}
              <Field id="control-next" label="اقدام بعدی">
                <Textarea
                  id="control-next"
                  value={view.value.next_action}
                  maxLength={500}
                  disabled={view.command.busy}
                  onChange={(event) =>
                    view.change({ next_action: event.target.value })
                  }
                />
              </Field>
              {view.currentCase && (
                <>
                  <Field id="control-state" label="وضعیت">
                    <Select
                      id="control-state"
                      value={view.value.state}
                      options={caseStates}
                      onValueChange={(state) => view.change({ state })}
                      disabled={view.command.busy}
                    />
                  </Field>
                  <Field id="control-reason" label="دلیل تغییر">
                    <Textarea
                      id="control-reason"
                      required
                      maxLength={2000}
                      value={view.value.reason}
                      onChange={(event) =>
                        view.change({ reason: event.target.value })
                      }
                      disabled={view.command.busy}
                    />
                  </Field>
                </>
              )}
              <FormMessage error>{view.caseError}</FormMessage>
              {view.command.error?.code === "version_conflict" && (
                <Button variant="secondary" onClick={view.refresh}>
                  تازه‌سازی پرونده
                </Button>
              )}
              <Button
                type="submit"
                busy={view.command.busy}
                disabled={
                  view.newerVersionAvailable ||
                  !!view.assignees.error ||
                  view.detail.loading
                }
              >
                {view.currentCase ? "ذخیره پیگیری" : "ایجاد پیگیری"}
              </Button>
            </Form>
          ) : (
            view.currentCase && (
              <dl className="space-y-3">
                <div>
                  <dt className="text-xs text-muted">مسئول</dt>
                  <dd className="mt-1">
                    {view.currentCase.assignee_name || "تعیین نشده"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">مهلت</dt>
                  <dd className="mt-1">
                    {displayDate(view.currentCase.due_date)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">اقدام بعدی</dt>
                  <dd className="mt-1 whitespace-pre-wrap">
                    {view.currentCase.next_action || "—"}
                  </dd>
                </div>
              </dl>
            )
          )}
          {view.currentCase && (
            <section
              className="space-y-4 border-t border-border pt-5"
              aria-label="فعالیت‌های پرونده"
            >
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <ChatCircleTextIcon
                  size={19}
                  className="text-primary"
                  aria-hidden
                />
                فعالیت‌ها
              </h2>
              {view.workspace.canWrite && (
                <Form
                  fieldErrors={view.activityFieldErrors}
                  onSubmit={(event) => {
                    event.preventDefault();
                    view.addActivity();
                  }}
                >
                  <Field id="control-activity-kind" label="نوع فعالیت">
                    <Select
                      id="control-activity-kind"
                      value={view.activity.kind}
                      options={view.activityOptions}
                      onValueChange={(kind) => view.changeActivity({ kind })}
                      disabled={view.command.busy}
                    />
                  </Field>
                  <Field id="control-message" label="شرح فعالیت">
                    <Textarea
                      id="control-message"
                      required
                      maxLength={2000}
                      value={view.activity.message}
                      onChange={(event) =>
                        view.changeActivity({ message: event.target.value })
                      }
                      disabled={view.command.busy}
                    />
                  </Field>
                  {view.activity.kind === "promise" && (
                    <>
                      <Field
                        id="control-promise-date"
                        label="تاریخ وعده"
                        icon={CalendarBlankIcon}
                      >
                        <PersianDatePicker
                          id="control-promise-date"
                          value={view.activity.promise_date}
                          onChange={(promise_date) =>
                            view.changeActivity({ promise_date })
                          }
                          disabled={view.command.busy}
                        />
                      </Field>
                      <Field
                        id="control-promise-amount"
                        label="مبلغ وعده"
                        icon={CoinsIcon}
                      >
                        <AmountInput
                          id="control-promise-amount"
                          value={view.activity.promise_amount}
                          onValueChange={(promise_amount) =>
                            view.changeActivity({ promise_amount })
                          }
                          disabled={view.command.busy}
                        />
                      </Field>
                      <Field id="control-promise-unit" label="واحد مبلغ">
                        <Select
                          id="control-promise-unit"
                          value={view.activity.unit}
                          options={[
                            { value: "IRR", label: "ریال" },
                            { value: "TOMAN", label: "تومان" },
                          ]}
                          onValueChange={(unit) =>
                            view.changeActivity({ unit })
                          }
                          disabled={view.command.busy}
                        />
                      </Field>
                      <StatusMessage>
                        وعدهٔ پرداخت، وصول وجه یا تغییر مانده نیست.
                      </StatusMessage>
                    </>
                  )}
                  <FormMessage error>{view.activityError}</FormMessage>
                  <Button
                    type="submit"
                    variant="secondary"
                    busy={view.command.busy}
                    disabled={view.newerVersionAvailable}
                  >
                    ثبت فعالیت
                  </Button>
                </Form>
              )}
              {view.activities.loading ? (
                <LoadingState
                  variant="message"
                  label="در حال دریافت فعالیت‌ها"
                />
              ) : view.activities.error ? (
                <ErrorState
                  message={view.activities.error.message}
                  onRetry={view.activities.refresh}
                />
              ) : (
                <>
                  <ol className="space-y-3">
                    {view.activities.data?.items.map((item) => (
                      <li
                        key={item.id}
                        className="space-y-2 rounded-control border border-border p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Badge>{activityKindLabel(item.kind)}</Badge>
                          <span className="text-xs text-muted">
                            {item.actor_name} · {displayDate(item.created_at)}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap break-words leading-7">
                          {item.message}
                        </p>
                        {item.data.promise_date && (
                          <p className="text-sm">
                            وعده: {displayDate(item.data.promise_date)}
                            {item.data.amount
                              ? ` · ${amount(item.data.amount)} ریال`
                              : ""}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                  <CursorPagination {...view.activities} />
                </>
              )}
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}
