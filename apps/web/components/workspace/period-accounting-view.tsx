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
import { usePeriodLock } from "@/hooks/use-period-lock";
import { amount, displayDate, persian } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
  const lock = usePeriodLock(c.target);
  const activePeriod = c.workspace.periods.find((p) => p.id === c.target);
  const lockData = lock.resource.data;
  const customItems = lockData?.custom_items || [];
  const customDone = customItems.filter((item) => item.completed).length;

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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
            <div className="text-xs text-muted">دورهٔ منتخب</div>
            <div className="mt-1.5 font-medium text-foreground">
              {activePeriod ? activePeriod.name : "انتخاب‌نشده"}
            </div>
            {activePeriod && (
              <div className="mt-1 text-xs text-muted">
                {displayDate(activePeriod.start)} تا {displayDate(activePeriod.end)}
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
            <div className="text-xs text-muted">قفل ثبت سند</div>
            <div className="mt-2">
              {lockData ? (
                <Badge tone={lockData.closed ? "warning" : "success"}>
                  {lockData.closed ? "قفل‌شده (بسته)" : "باز برای ثبت سند"}
                </Badge>
              ) : (
                <span className="text-xs text-muted">—</span>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
            <div className="text-xs text-muted">وضعیت چک‌لیست دوره</div>
            <div className="mt-1.5 text-sm font-medium text-foreground">
              {lockData ? (
                lockData.errors.length > 0
                  ? `${persian(lockData.errors.length)} مانع · ${persian(lockData.warnings.length)} هشدار`
                  : lockData.ready_to_close
                    ? `آماده (${persian(customDone)} از ${persian(customItems.length)} مورد)`
                    : "نیازمند بررسی"
              ) : "—"}
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
            <div className="text-xs text-muted">آخرین سند مربوط دوره</div>
            {c.latestPeriodDoc ? (
              <div className="mt-1 space-y-1">
                <div className="truncate text-xs font-medium text-foreground">
                  {c.latestPeriodDoc.description}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone={c.latestPeriodDoc.state === "posted" ? "success" : "warning"}>
                    {c.latestPeriodDoc.state === "posted" ? "ثبت قطعی" : "پیش‌نویس در انتظار تأیید"}
                  </Badge>
                  <ButtonLink
                    variant="ghost"
                    className="h-6 px-1.5 text-xs"
                    href={c.latestPeriodDoc.state === "draft" ? `/accounting?review_draft=${c.latestPeriodDoc.id}` : "/accounting"}
                  >
                    مشاهده و تأیید
                  </ButtonLink>
                </div>
              </div>
            ) : (
              <div className="mt-1.5 text-xs text-muted">هنوز سند بستن یا افتتاحیه ساخته نشده است</div>
            )}
          </div>
        </div>

        <Panel
          title={
            activePeriod
              ? `چک‌لیست و قفل عملیاتی دوره: ${activePeriod.name}`
              : "چک‌لیست و قفل عملیاتی دوره"
          }
        >
          {c.target ? (
            <PeriodLockPanel periodId={c.target} controller={lock} />
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
              {c.isClosing ? (
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
                    searchable
                    value={c.resultAccount}
                    onValueChange={c.setResultAccount}
                    options={c.accountOptions}
                  />
                </Field>
              ) : (
                <div className="rounded-control border border-border bg-canvas/50 p-3 text-xs">
                  <div className="text-muted">انتقال مانده از دورهٔ مبدأ به دورهٔ مقصد:</div>
                  <div className="mt-1 font-medium text-foreground">
                    {c.sourcePeriod?.name || "نامشخص"} ← {activePeriod?.name || "نامشخص"}
                  </div>
                </div>
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
            <Field id="closing-reason" label="دلیل عملیات" required>
              <Textarea
                id="closing-reason"
                required
                value={c.reason}
                onChange={(event) => c.setReason(event.target.value)}
              />
            </Field>
            <div className="space-y-2 rounded-xl border border-border bg-canvas/50 p-3.5 text-xs">
              <div className="font-medium text-foreground">پیش‌نمایش اثر و پیش‌نیازهای عملیات</div>
              <div className="grid gap-2 sm:grid-cols-3 text-muted">
                <div>حساب‌های منتخب: <b className="text-foreground">{persian(c.selected.length)} حساب</b></div>
                <div>دارای ماندهٔ باز: <b className="text-foreground">{persian(c.nonZeroSelectedCount)} حساب</b></div>
                <div>
                  برآورد خالص مانده منتخب:{" "}
                  <b className="tabular-nums text-foreground">{amount(String(Math.abs(c.estimatedNetBalance)))} ریال</b>
                </div>
              </div>
              {c.prerequisites.length > 0 && (
                <ul className="list-inside list-disc space-y-1 text-warning pt-1">
                  {c.prerequisites.map((reqText, i) => (
                    <li key={i}>{reqText}</li>
                  ))}
                </ul>
              )}
            </div>
            <FormMessage error>{c.command.error?.message}</FormMessage>
            {c.created ? (
              <ButtonLink href="/accounting">
                بررسی و تأیید پیش‌نویس ساخته‌شده در اسناد
              </ButtonLink>
            ) : (
              <Button
                type="submit"
                busy={c.command.busy}
                disabled={
                  !c.workspace.canWrite ||
                  !c.period ||
                  !c.selected.length ||
                  (c.isClosing ? !c.resultAccount : !c.target)
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
