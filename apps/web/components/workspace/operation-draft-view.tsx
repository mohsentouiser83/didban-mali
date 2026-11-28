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
import { isTreasuryRoleKey } from "@/lib/account-catalogue";
import { useWorkspace } from "@/hooks/workspace";
import { PageHeader, NoCompany } from "./page-parts";
export function OperationDraftView({
  embedded = false,
  onCreated,
  initialKind,
}: { embedded?: boolean; onCreated?: () => void; initialKind?: string } = {}) {
  const w = useWorkspace();
  return w.company ? (
    <Workspace
      key={`${w.user?.id}:${w.company.id}`}
      embedded={embedded}
      onCreated={onCreated}
      initialKind={initialKind}
    />
  ) : (
    <NoCompany />
  );
}
function Workspace({
  embedded,
  onCreated,
  initialKind,
}: {
  embedded: boolean;
  onCreated?: () => void;
  initialKind?: string;
}) {
  const c = useOperationDrafts(onCreated, initialKind);
  return (
    <>
      {!embedded && (
        <PageHeader
          title="عملیات مالی"
          icon={ReceiptIcon}
        />
      )}
      <div>
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
            <Form
              onSubmit={(event) => {
                event.preventDefault();
                c.save();
              }}
              fieldErrors={c.command.error?.fields}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                {!embedded && (
                  <Field id="op-kind" label="نوع عملیات" required>
                    <Select
                      id="op-kind"
                      value={c.form.kind}
                      onValueChange={c.choose}
                      searchable
                      searchPlaceholder="جستجوی نوع سند..."
                      options={(c.catalogue.data?.items || []).map((item) => ({
                        value: item.kind,
                        label: item.label,
                      }))}
                    />
                  </Field>
                )}
                <Field id="op-date" label="تاریخ" required>
                  <PersianDatePicker
                    id="op-date"
                    value={c.form.date}
                    onChange={(date) => c.change({ date })}
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
                  <Field id="op-event" label="رویداد چک" required>
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
              <FormMessage error>{!c.workspace.periodId ? "دوره را از هدر انتخاب کنید." : c.command.error?.message}</FormMessage>
              {c.created && (
                <FormMessage>
                  پیش‌نویس ساخته شد.{" "}
                  {!embedded && (
                    <ButtonLink href="/accounting" variant="secondary">بررسی و تأیید سند</ButtonLink>
                  )}
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
      </div>
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
            label={`${operationAmountLabels[key] || key} (ریال)`}
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
        {c.template?.roles.map((role) => {
          const isTreasury =
            isTreasuryRoleKey(role.key) ||
            role.label.includes("بانک") ||
            role.label.includes("صندوق") ||
            role.label.includes("تنخواه");
          const canSelectTerminal = c.supportsPointOfSale && role.key === "bank_a";
          const options = isTreasury
            ? c.treasuryAccountOptions.length > 0
              ? c.treasuryAccountOptions
              : c.accountOptions
            : c.accountOptions;
          return (
            <Field
              key={role.key}
              id={`op-account-${role.key}`}
              label={canSelectTerminal ? "حساب خزانه یا کارت‌خوان" : role.label}
              required
            >
              <Select
                id={`op-account-${role.key}`}
                value={(canSelectTerminal && c.form.point_of_sale_id) || c.form.accounts[role.key] || ""}
                searchable
                searchPlaceholder="جستجوی کد یا نام حساب..."
                placeholder={
                  isTreasury && c.treasuryAccountOptions.length === 0 && (!canSelectTerminal || !c.pointOfSaleOptions.length)
                    ? "حساب بانک، صندوق یا تنخواه یافت نشد"
                    : "انتخاب حساب"
                }
                onValueChange={(value) => c.selectAccount(role.key, value)}
                options={canSelectTerminal ? [...options, ...c.pointOfSaleOptions] : options}
              />
            </Field>
          );
        })}
      </div>
    </>
  );
}
