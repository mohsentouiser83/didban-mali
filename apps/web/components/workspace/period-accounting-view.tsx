"use client";
import { BooksIcon } from "@phosphor-icons/react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  LoadingState,
  ErrorState,
  StatusMessage,
} from "@/components/ui/content-states";
import { useWorkspace } from "@/hooks/workspace";
import { usePeriodAccounting } from "@/hooks/use-period-accounting";
import { PageHeader, Panel, NoCompany } from "./page-parts";
export function PeriodAccountingView() {
  const w = useWorkspace();
  return w.company ? (
    <Workspace key={`${w.user?.id}:${w.company.id}`} />
  ) : (
    <NoCompany />
  );
}
function Workspace() {
  const c = usePeriodAccounting();
  return (
    <>
      <PageHeader
        title="اسناد پایان و آغاز دوره"
        icon={BooksIcon}
        action={
          <ButtonLink href="/settings/periods" variant="secondary">
            دوره‌های مالی
          </ButtonLink>
        }
      />
      <Panel>
        {c.accounts.loading || c.roles.resource.loading ? (
          <LoadingState />
        ) : c.accounts.error || c.roles.resource.error ? (
          <ErrorState
            message={(c.accounts.error || c.roles.resource.error)!.message}
            onRetry={() => {
              c.accounts.refresh();
              c.roles.resource.refresh();
            }}
          />
        ) : (
          <Form
            onSubmit={(event) => {
              event.preventDefault();
              c.save();
            }}
          >
            <Field id="period-operation" label="عملیات">
              <Select
                id="period-operation"
                value={c.kind}
                onValueChange={c.setKind}
                options={[
                  {
                    value: "closing",
                    label: "بستن حساب‌های انتخابی به حساب نتیجه",
                  },
                  {
                    value: "opening",
                    label: "انتقال مانده‌های انتخابی به دوره بعد",
                  },
                ]}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="closing-period"
                label={
                  c.kind === "closing" ? "دوره مالی" : "دوره مبدأ؛ بسته‌شده"
                }
              >
                <Select
                  id="closing-period"
                  value={c.period}
                  onValueChange={c.setPeriod}
                  options={c.periodOptions}
                />
              </Field>
              {c.kind === "opening" ? (
                <Field id="opening-period" label="دوره مقصد">
                  <Select
                    id="opening-period"
                    value={c.target}
                    onValueChange={c.setTarget}
                    options={c.periodOptions}
                  />
                </Field>
              ) : (
                <Field id="closing-result" label="حساب نتیجه">
                  <Select
                    id="closing-result"
                    value={c.resultAccount}
                    onValueChange={c.setResultAccount}
                    options={c.accountOptions}
                  />
                </Field>
              )}
            </div>
            <Field id="closing-search" label="جستجوی حساب">
              <Input
                id="closing-search"
                value={c.query}
                onChange={(event) => c.setQuery(event.target.value)}
              />
            </Field>
            <fieldset className="max-h-80 space-y-3 overflow-y-auto rounded-panel border border-border p-4">
              <legend className="px-2 font-medium">
                {c.kind === "closing"
                  ? "حساب‌های سود و زیان انتخابی"
                  : "حساب‌های ترازنامه‌ای انتخابی"}
              </legend>
              {!c.visibleAccounts.length && (
                <ButtonLink href="/settings/account-roles" variant="secondary">
                  تعیین نقش حساب‌ها
                </ButtonLink>
              )}
              {c.visibleAccounts.map((account) => (
                <Checkbox
                  key={account.id}
                  label={`${account.code} · ${account.name}`}
                  checked={c.selected.includes(account.id)}
                  onCheckedChange={(checked) => c.toggle(account.id, checked)}
                />
              ))}
            </fieldset>
            <Field id="closing-reason" label="دلیل">
              <Textarea
                id="closing-reason"
                required
                value={c.reason}
                onChange={(event) => c.setReason(event.target.value)}
              />
            </Field>
            <StatusMessage>
              مبنا فقط اسناد نهایی دفتر دیدبان است؛ پیش‌نویس حساب‌ها و تاریخ‌ها
              را پیش از ثبت بررسی کنید.
            </StatusMessage>
            <FormMessage error>{c.command.error?.message}</FormMessage>
            {c.created ? (
              <ButtonLink href="/accounting">
                بررسی پیش‌نویس ساخته‌شده
              </ButtonLink>
            ) : (
              <Button
                type="submit"
                busy={c.command.busy}
                disabled={
                  !c.workspace.canWrite ||
                  !c.period ||
                  !c.selected.length ||
                  (c.kind === "closing" ? !c.resultAccount : !c.target)
                }
              >
                ساخت پیش‌نویس دوره
              </Button>
            )}
          </Form>
        )}
      </Panel>
    </>
  );
}
