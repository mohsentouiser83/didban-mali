"use client";
import { useEffect } from "react";
import { ArrowUpLeftIcon, BooksIcon } from "@phosphor-icons/react";
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
import { displayDate } from "@/lib/utils";
import { PageHeader, Panel, NoCompany } from "./page-parts";
import { PeriodLockPanel } from "./period-lock-panel";
export function PeriodAccountingView({
  initialPeriodId,
}: {
  initialPeriodId?: string;
} = {}) {
  const w = useWorkspace();
  useEffect(() => {
    if (
      initialPeriodId &&
      w.periods.some((p) => p.id === initialPeriodId) &&
      w.periodId !== initialPeriodId
    ) {
      w.setPeriodId(initialPeriodId);
    }
  }, [initialPeriodId, w]);
  return w.company ? (
    <Workspace key={`${w.user?.id}:${w.company.id}`} />
  ) : (
    <NoCompany />
  );
}
function Workspace() {
  const c = usePeriodAccounting();
  const activePeriod = c.workspace.periods.find((p) => p.id === c.target);
  return (
    <>
      <PageHeader
        title="بستن و افتتاح دوره"
        icon={BooksIcon}
        action={
          <ButtonLink variant="secondary" href="/settings/periods">
            تعریف و ویرایش دوره‌ها
            <ArrowUpLeftIcon size={16} aria-hidden />
          </ButtonLink>
        }
      />
      <div className="space-y-6">
        <Panel
          title={
            activePeriod
              ? `وضعیت قفل و آمادگی دوره: ${activePeriod.name} (${displayDate(activePeriod.start)} تا ${displayDate(activePeriod.end)})`
              : "وضعیت قفل و آمادگی دوره"
          }
        >
          {c.target ? (
            <PeriodLockPanel periodId={c.target} />
          ) : (
            <StatusMessage tone="warning">
              ابتدا از هدر یا بخش «تعریف و ویرایش دوره‌ها» یک دوره مالی انتخاب کنید.
            </StatusMessage>
          )}
        </Panel>
        <Panel title="پیش‌نویس اسناد بستن و افتتاحیه">
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
            <Field id="period-operation" label="عملیات بستن یا افتتاح حساب‌ها" required>
              <Select
                id="period-operation"
                value={c.kind}
                onValueChange={c.setKind}
                options={[
                  {
                    value: "temporary_closing",
                    label: "مرحله ۱: بستن حساب‌های موقت (هزینه‌ها و درآمدها به سود و زیان جاری)",
                  },
                  {
                    value: "permanent_closing",
                    label: "مرحله ۲: صدور سند اختتامیه (بستن حساب‌های دائم به تراز اختتامیه)",
                  },
                  {
                    value: "opening",
                    label: "مرحله ۳: صدور سند افتتاحیه (انتقال مانده‌های دائم به سال جدید)",
                  },
                ]}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              {(c.kind === "temporary_closing" || c.kind === "permanent_closing" || c.kind === "closing") && (
                <Field
                  id="closing-result"
                  label={
                    c.kind === "temporary_closing" || c.kind === "closing"
                      ? "حساب سود و زیان جاری (خلاصه سود و زیان)"
                      : "حساب تراز اختتامیه"
                  }
                  required
                >
                  <Select
                    id="closing-result"
                    value={c.resultAccount}
                    onValueChange={c.setResultAccount}
                    options={c.accountOptions}
                  />
                </Field>
              )}
            </div>
            {c.kind === "opening" && !c.period && (
              <FormMessage error>دورهٔ قبل به دورهٔ انتخابی متصل نیست.</FormMessage>
            )}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="w-72">
                <Field id="closing-search" label="جستجوی حساب">
                  <Input
                    id="closing-search"
                    value={c.query}
                    onChange={(event) => c.setQuery(event.target.value)}
                    placeholder="جستجو در کد یا نام حساب..."
                  />
                </Field>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={c.selectAll}>
                  انتخاب همه
                </Button>
                <Button type="button" variant="ghost" onClick={c.deselectAll}>
                  لغو انتخاب
                </Button>
              </div>
            </div>
            <fieldset className="max-h-80 space-y-3 overflow-y-auto rounded-panel border border-border p-4">
              <legend className="px-2 font-medium">
                {c.kind === "temporary_closing" || c.kind === "closing"
                  ? "حساب‌های موقت (درآمد و هزینه) انتخابی"
                  : "حساب‌های دائم (ترازنامه‌ای) انتخابی"}
              </legend>
              {!c.visibleAccounts.length && (
                <p className="text-sm text-muted">حسابی با نقش موردنیاز تعریف نشده است.</p>
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
      </div>
    </>
  );
}
