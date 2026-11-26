"use client";
import {
  ArrowUpLeftIcon,
  CalendarBlankIcon as HeaderIcon,
  CalendarBlankIcon,
  LockIcon,
  LockOpenIcon,
  PencilSimpleIcon,
  PlusIcon,
  TextAaIcon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState, LoadingState, StatusMessage } from "@/components/ui/content-states";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { CursorPagination } from "@/components/ui/pagination";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowHeader,
} from "@/components/ui/table";
import {
  usePeriodManagement,
  periodDateRangeStatus,
} from "@/hooks/use-period-management";
import { useWorkspace } from "@/hooks/workspace";
import { listItems, type Period } from "@/lib/api";
import { displayDate } from "@/lib/utils";
import { NoCompany, PageHeader, Panel } from "./page-parts";

const rangeLabels = {
  upcoming: { label: "پیش‌رو", tone: "neutral" as const },
  current: { label: "بازه جاری", tone: "primary" as const },
  expired: { label: "تاریخ پایان گذشته", tone: "neutral" as const },
};

function blockReason(period: Period): string | null {
  if (period.closed) return "دوره قفل‌شده است؛ ابتدا از «بستن و افتتاح دوره» بازگشایی کنید.";
  if (period.in_use) return "دارای اسناد یا سوابق مالی وابسته — قابل حذف نیست.";
  return null;
}

function PeriodWorkspace() {
  const {
    workspace,
    resource,
    command,
    creating,
    editing,
    deleting,
    name,
    start,
    end,
    previousPeriodId,
    comparisonCandidates,
    setDeleting,
    setName,
    setStart,
    setEnd,
    setPreviousPeriodId,
    openCreate,
    openEdit,
    closeCreate,
    save,
    remove,
  } = usePeriodManagement();

  if (!workspace.company) return <NoCompany />;

  const items = listItems(resource.data);

  return (
    <>
      <PageHeader
        icon={HeaderIcon}
        title="دوره‌های مالی"
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink variant="secondary" href="/accounting/period-end">
              بستن و افتتاح دوره
              <ArrowUpLeftIcon size={16} aria-hidden />
            </ButtonLink>
            {workspace.canWrite && (
              <Button onClick={openCreate}>
                <PlusIcon size={18} aria-hidden />
                دوره جدید
              </Button>
            )}
          </div>
        }
      />
      <div className="mb-4">
        <StatusMessage tone="primary">
          گذشتن تاریخ پایان دوره به‌تنهایی قفل ثبت سند ایجاد نمی‌کند. قفل یا بازگشایی عملیاتی دوره با دلیل و مجوز از مسیر «بستن و افتتاح دوره» انجام می‌شود و با دورهٔ انتخاب‌شده در هدر متفاوت است.
        </StatusMessage>
      </div>
      <Panel>
        {resource.loading ? (
          <LoadingState />
        ) : resource.error ? (
          <ErrorState
            message={resource.error.message}
            onRetry={resource.refresh}
          />
        ) : (
          <>
            <Table showSearch={false} title="دوره‌های مالی">
              <TableHeader>
                <TableRow>
                  <TableHead>نام دوره</TableHead>
                  <TableHead>از تاریخ</TableHead>
                  <TableHead>تا تاریخ</TableHead>
                  <TableHead>وضعیت بازهٔ زمانی</TableHead>
                  <TableHead>وضعیت قفل ثبت سند</TableHead>
                  <TableHead>عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length ? (
                  items.map((period) => {
                    const range = rangeLabels[periodDateRangeStatus(period)];
                    const locked = Boolean(period.closed);
                    const isHeaderSelected = workspace.periodId === period.id;
                    const deleteBlocked = Boolean(period.in_use || locked);
                    const deleteReason = blockReason(period);
                    return (
                      <TableRow key={period.id}>
                        <TableRowHeader>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-foreground">{period.name}</span>
                            {isHeaderSelected && (
                              <Badge tone="primary">دوره فعلی هدر</Badge>
                            )}
                            {period.in_use && (
                              <Badge tone="neutral">دارای سابقه</Badge>
                            )}
                          </div>
                        </TableRowHeader>
                        <TableCell className="whitespace-nowrap">
                          {displayDate(period.start)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {displayDate(period.end)}
                        </TableCell>
                        <TableCell>
                          <Badge tone={range.tone}>{range.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge tone={locked ? "warning" : "success"}>
                            {locked ? (
                              <>
                                <LockIcon size={14} className="me-1" aria-hidden />
                                قفل‌شده (بسته)
                              </>
                            ) : (
                              <>
                                <LockOpenIcon size={14} className="me-1" aria-hidden />
                                باز برای ثبت
                              </>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <ButtonLink
                                variant="ghost"
                                href={`/accounting/period-end?period_id=${period.id}`}
                                className="h-9 px-2.5 text-xs"
                              >
                                بستن / افتتاح
                              </ButtonLink>
                              {workspace.canWrite && (
                                <Button
                                  variant="secondary"
                                  className="h-9 px-2.5 text-xs"
                                  disabled={locked}
                                  onClick={() => openEdit(period)}
                                >
                                  <PencilSimpleIcon size={14} aria-hidden />
                                  ویرایش
                                </Button>
                              )}
                              {workspace.canWrite && (
                                <Button
                                  variant="ghost"
                                  onClick={() => {
                                    setDeleting(period);
                                    command.clearError();
                                  }}
                                  disabled={deleteBlocked}
                                  aria-label={
                                    deleteReason
                                      ? `${period.name}: ${deleteReason}`
                                      : `حذف ${period.name}`
                                  }
                                  className={
                                    deleteBlocked
                                      ? "h-9 cursor-not-allowed px-2.5 text-xs opacity-50"
                                      : "h-9 px-2.5 text-xs text-danger hover:text-danger"
                                  }
                                >
                                  حذف
                                </Button>
                              )}
                            </div>
                            {workspace.canWrite && deleteReason && (
                              <span className="text-[11px] text-muted">
                                {deleteReason}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableEmptyCell colSpan={6} title="هنوز دوره مالی تعریف نشده است" />
                )}
              </TableBody>
            </Table>
            <CursorPagination {...resource} />
          </>
        )}
      </Panel>

      <Drawer
        title={editing ? `ویرایش دوره: ${editing.name}` : "دوره مالی جدید"}
        open={creating}
        onOpenChange={(open) => {
          if (!open) closeCreate();
        }}
      >
        <Form
          fieldErrors={command.error?.fields}
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          {editing?.closed && (
            <StatusMessage tone="warning">
              این دوره در سرور قفل شده است؛ برای هرگونه ویرایش ابتدا از صفحه «بستن و افتتاح دوره» بازگشایی کنید.
            </StatusMessage>
          )}
          {editing?.in_use && !editing.closed && (
            <StatusMessage>
              این دوره دارای اسناد یا سوابق مالی است؛ طبق قواعد سرور تنها نام دوره قابل ویرایش است و تاریخ شروع، تاریخ پایان و دوره مقایسه ثابت می‌مانند.
            </StatusMessage>
          )}
          <Field id="period-name" label="نام دوره" icon={TextAaIcon} required>
            <Input
              id="period-name"
              required
              maxLength={120}
              disabled={command.busy || Boolean(editing?.closed)}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="period-start" label="از تاریخ" icon={CalendarBlankIcon} required>
              <PersianDatePicker
                id="period-start"
                value={start}
                disabled={command.busy || Boolean(editing?.in_use || editing?.closed)}
                onChange={setStart}
              />
            </Field>
            <Field id="period-end" label="تا تاریخ" icon={CalendarBlankIcon} required>
              <PersianDatePicker
                id="period-end"
                value={end}
                disabled={command.busy || Boolean(editing?.in_use || editing?.closed)}
                onChange={setEnd}
              />
            </Field>
          </div>
          <Field
            id="period-previous"
            label="دوره مقایسه قبلی (اختیاری)"
            description="برای محاسبه تغییرات و سند افتتاحیه؛ تاریخ پایان دوره مقایسه باید پیش از شروع این دوره باشد."
          >
            <Select
              id="period-previous"
              value={previousPeriodId || "none"}
              disabled={command.busy || Boolean(editing?.in_use || editing?.closed)}
              onValueChange={(val) => setPreviousPeriodId(val === "none" ? "" : val)}
              options={[
                { value: "none", label: "بدون دوره مقایسه" },
                ...comparisonCandidates.map((item) => ({
                  value: item.id,
                  label: `${item.name} (${displayDate(item.start)} تا ${displayDate(item.end)})`,
                })),
              ]}
            />
          </Field>
          <FormMessage error>{command.error?.message}</FormMessage>
          <Button
            type="submit"
            busy={command.busy}
            disabled={!name.trim() || !start || !end || Boolean(editing?.closed)}
          >
            {editing ? "ذخیره تغییرات دوره" : "ایجاد دوره مالی"}
          </Button>
        </Form>
      </Drawer>

      <ConfirmDialog
        title="دوره مالی حذف شود؟"
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        busy={command.busy}
        onConfirm={remove}
      >
        <p className="font-medium text-main">{deleting?.name}</p>
        {deleting && (deleting.in_use || deleting.closed) ? (
          <div className="rounded-lg bg-danger/10 p-3 text-xs text-danger">
            {blockReason(deleting)}
          </div>
        ) : (
          <p className="text-xs text-muted">
            تنها دوره‌های باز و فاقد هرگونه سند، پیش‌نویس، گزارش یا سابقه قفل قابل حذف هستند.
          </p>
        )}
        <FormMessage error>{command.error?.message}</FormMessage>
      </ConfirmDialog>
    </>
  );
}

export function PeriodsView() {
  const workspace = useWorkspace();
  if (!workspace.company) return <NoCompany />;
  return (
    <PeriodWorkspace key={`${workspace.user?.id}:${workspace.company.id}`} />
  );
}
