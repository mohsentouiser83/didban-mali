"use client";
import { CalendarBlankIcon as HeaderIcon, CalendarBlankIcon, PlusIcon, TextAaIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { CursorPagination } from "@/components/ui/pagination";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
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
import { usePeriodManagement, isPeriodClosed } from "@/hooks/use-period-management";
import { useWorkspace } from "@/hooks/workspace";
import { listItems } from "@/lib/api";
import { displayDate } from "@/lib/utils";
import { NoCompany, PageHeader, Panel } from "./page-parts";

function PeriodWorkspace() {
  const {
    workspace,
    resource,
    command,
    creating,
    deleting,
    name,
    start,
    end,
    setDeleting,
    setName,
    setStart,
    setEnd,
    openCreate,
    closeCreate,
    save,
    remove,
  } = usePeriodManagement();

  if (!workspace.company) return <NoCompany />;

  return (
    <>
      <PageHeader
        icon={HeaderIcon}
        title="دوره‌های مالی"
        action={
          <div className="flex flex-wrap gap-2">
            {workspace.canWrite && (
              <Button onClick={openCreate}>
                <PlusIcon size={18} aria-hidden />
                دوره جدید
              </Button>
            )}
          </div>
        }
      />
      <div className="mb-4 text-xs text-muted">
        بستن دوره‌های مالی به‌صورت خودکار بر اساس تاریخ پایان دوره انجام می‌شود.
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>دوره</TableHead>
                  <TableHead>از تاریخ</TableHead>
                  <TableHead>تا تاریخ</TableHead>
                  <TableHead>وضعیت دوره</TableHead>
                  <TableHead>
                    <span className="sr-only">عملیات</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listItems(resource.data).length ? (
                  listItems(resource.data).map((period) => {
                    const closed = isPeriodClosed(period);
                    return (
                      <TableRow key={period.id}>
                        <TableRowHeader>{period.name}</TableRowHeader>
                        <TableCell className="whitespace-nowrap">
                          {displayDate(period.start)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {displayDate(period.end)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge tone={closed ? "neutral" : "success"}>
                              {closed ? "بسته شده (خودکار)" : "دوره جاری"}
                            </Badge>
                            {period.in_use && (
                              <Badge tone="neutral" className="text-xs">
                                دارای اطلاعات مالی
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {workspace.canWrite && (
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  setDeleting(period);
                                  command.clearError();
                                }}
                                disabled={period.in_use}
                                aria-label={
                                  period.in_use
                                    ? `دوره ${period.name} دارای اطلاعات است و قابل حذف نیست`
                                    : `حذف ${period.name}`
                                }
                                title={
                                  period.in_use
                                    ? "این دوره دارای اطلاعات مالی است و قابل حذف نیست."
                                    : undefined
                                }
                                className={
                                  period.in_use
                                    ? "cursor-not-allowed opacity-50"
                                    : "text-danger hover:text-danger"
                                }
                              >
                                حذف
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableEmptyCell colSpan={5} title="هنوز دوره مالی تعریف نشده است" />
                )}
              </TableBody>
            </Table>
            <CursorPagination {...resource} />
          </>
        )}
      </Panel>

      <Drawer
        title="دوره مالی جدید"
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
          <Field id="period-name" label="نام دوره" icon={TextAaIcon}>
            <Input
              id="period-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="period-start" label="از تاریخ" icon={CalendarBlankIcon}>
              <PersianDatePicker
                id="period-start"
                value={start}
                onChange={setStart}
              />
            </Field>
            <Field id="period-end" label="تا تاریخ" icon={CalendarBlankIcon}>
              <PersianDatePicker
                id="period-end"
                value={end}
                onChange={setEnd}
              />
            </Field>
          </div>
          <FormMessage error>{command.error?.message}</FormMessage>
          <Button
            type="submit"
            busy={command.busy}
            disabled={!start || !end}
          >
            ایجاد دوره مالی
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
        {deleting?.in_use ? (
          <div className="rounded-lg bg-danger/10 p-3 text-xs text-danger">
            این دوره دارای اسناد و اطلاعات مالی است و طبق اصول حسابداری قابل حذف نمی‌باشد.
          </div>
        ) : (
          <p className="text-xs text-muted">
            تنها دوره‌هایی که فاقد هرگونه سند، پیش‌نویس، گزارش یا اطلاعات مالی هستند قابل حذف می‌باشند.
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
