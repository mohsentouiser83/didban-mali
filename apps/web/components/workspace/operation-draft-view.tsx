"use client";
import { ReceiptIcon } from "@phosphor-icons/react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input, AmountInput, Textarea } from "@/components/ui/input";
import { CursorPagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import {
  ErrorState,
  LoadingState,
  StatusMessage,
} from "@/components/ui/content-states";
import {
  useOperationDrafts,
  operationAmountLabels,
} from "@/hooks/use-operation-drafts";
import { useWorkspace } from "@/hooks/workspace";
import { PageHeader, Panel, NoCompany } from "./page-parts";
import { OperationLearningPanel } from "./operation-learning-panel";
export function OperationDraftView() {
  const w = useWorkspace();
  return w.company ? (
    <Workspace key={`${w.user?.id}:${w.company.id}`} />
  ) : (
    <NoCompany />
  );
}
function Workspace() {
  const c = useOperationDrafts();
  return (
    <>
      <PageHeader
        title="عملیات مالی"
        icon={ReceiptIcon}
        action={
          <ButtonLink href="/accounting" variant="secondary">
            اسناد حسابداری
          </ButtonLink>
        }
      />
      <Panel>
        {c.catalogue.loading || c.accounts.loading ? (
          <LoadingState />
        ) : c.catalogue.error || c.accounts.error ? (
          <ErrorState
            message={(c.catalogue.error || c.accounts.error)!.message}
            onRetry={() => {
              c.catalogue.refresh();
              c.accounts.refresh();
            }}
          />
        ) : (
          <div className="space-y-5">
            <OperationLearningPanel c={c.learning} />
            <Form
              onSubmit={(event) => {
                event.preventDefault();
                c.save();
              }}
              fieldErrors={c.command.error?.fields}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="op-kind" label="نوع عملیات">
                  <Select
                    id="op-kind"
                    value={c.form.kind}
                    onValueChange={c.choose}
                    options={(c.catalogue.data?.items || []).map((item) => ({
                      value: item.kind,
                      label: item.label,
                    }))}
                  />
                </Field>
                <Field id="op-period" label="دوره مالی">
                  <Select
                    id="op-period"
                    value={c.form.period_id}
                    onValueChange={(period_id) => c.change({ period_id })}
                    options={c.workspace.periods.map((p) => ({
                      value: p.id,
                      label: p.name,
                    }))}
                  />
                </Field>
                <Field id="op-date" label="تاریخ">
                  <PersianDatePicker
                    id="op-date"
                    value={c.form.date}
                    onChange={(date) => c.change({ date })}
                  />
                </Field>
                <Field id="op-ref" label="شماره مرجع عملیات">
                  <Input
                    id="op-ref"
                    required
                    maxLength={120}
                    value={c.form.source_reference}
                    onChange={(event) =>
                      c.change({ source_reference: event.target.value })
                    }
                  />
                </Field>
                <Field id="op-party" label="طرف حساب">
                  <Input
                    id="op-party"
                    required={c.form.kind !== "transfer"}
                    maxLength={100}
                    value={c.form.party_id}
                    onChange={(event) =>
                      c.change({ party_id: event.target.value })
                    }
                  />
                </Field>
                <Field id="op-unit" label="واحد">
                  <Select
                    id="op-unit"
                    value={c.form.unit}
                    onValueChange={(unit) => c.change({ unit })}
                    options={[
                      { value: "IRR", label: "ریال" },
                      { value: "TOMAN", label: "تومان" },
                    ]}
                  />
                </Field>
              </div>
              <Field id="op-desc" label="شرح عملیات">
                <Textarea
                  id="op-desc"
                  required
                  maxLength={500}
                  value={c.form.description}
                  onChange={(event) =>
                    c.change({ description: event.target.value })
                  }
                />
              </Field>
              {c.template?.cheque_event_required && (
                <div>
                  <Field id="op-event" label="رویداد چک">
                    <Select
                      id="op-event"
                      value={c.form.cheque_event_id}
                      onValueChange={c.selectEvent}
                      options={(c.chequeEvents.data?.items || []).map(
                        (event) => ({
                          value: event.id,
                          label: `چک ${event.number} · ${event.date}`,
                        }),
                      )}
                    />
                  </Field>
                  {c.chequeEvents.error && (
                    <ErrorState
                      message={c.chequeEvents.error.message}
                      onRetry={c.chequeEvents.refresh}
                    />
                  )}
                  <CursorPagination {...c.chequeEvents} />
                </div>
              )}
              {c.form.kind === "cheque_endorsed" && (
                <Field id="op-endorsee" label="طرف بدهی که چک به او واگذار شده">
                  <Input
                    id="op-endorsee"
                    required
                    maxLength={100}
                    value={c.form.endorsee_party_id}
                    onChange={(event) =>
                      c.change({ endorsee_party_id: event.target.value })
                    }
                  />
                </Field>
              )}
              <OperationFields c={c} />
              {c.form.kind === "payroll" && (
                <StatusMessage>
                  مبالغ حقوق و کسورات را صریح وارد کنید؛ نرخ قانونی محاسبه
                  نمی‌شود.
                </StatusMessage>
              )}
              <FormMessage error>{c.command.error?.message}</FormMessage>
              {c.created && (
                <FormMessage>
                  پیش‌نویس ساخته شد.{" "}
                  <ButtonLink href="/accounting" variant="secondary">
                    بررسی و تأیید سند
                  </ButtonLink>
                </FormMessage>
              )}
              <Button
                type="submit"
                busy={c.command.busy}
                disabled={!c.workspace.canWrite || !!c.created}
              >
                ساخت پیش‌نویس
              </Button>
            </Form>
          </div>
        )}
      </Panel>
    </>
  );
}
function OperationFields({ c }: { c: ReturnType<typeof useOperationDrafts> }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {c.template?.amounts.map((key) => (
          <Field
            key={key}
            id={`op-amount-${key}`}
            label={operationAmountLabels[key] || key}
          >
            <AmountInput
              id={`op-amount-${key}`}
              required
              value={c.form.amounts[key] || ""}
              onValueChange={(value) =>
                c.change({ amounts: { ...c.form.amounts, [key]: value } })
              }
            />
          </Field>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {c.template?.roles.map((role) => (
          <Field
            key={role.key}
            id={`op-account-${role.key}`}
            label={role.label}
          >
            <Select
              id={`op-account-${role.key}`}
              value={c.form.accounts[role.key] || ""}
              onValueChange={(value) =>
                c.change({
                  accounts: { ...c.form.accounts, [role.key]: value },
                })
              }
              options={c.accountOptions}
            />
          </Field>
        ))}
      </div>
    </>
  );
}
