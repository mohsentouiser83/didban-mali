"use client";
import { CalendarBlankIcon as HeaderIcon } from "@phosphor-icons/react";
import { Select } from "@/components/ui/select";
import { Button, ButtonLink } from "@/components/ui/button";
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
import { usePeriodManagement } from "@/hooks/use-period-management";
import { useWorkspace } from "@/hooks/workspace";
import { listItems } from "@/lib/api";
import { displayDate } from "@/lib/utils";
import { CalendarBlankIcon, PlusIcon, TextAaIcon } from "@phosphor-icons/react";
import { PeriodLockPanel } from "./period-lock-panel";
import { NoCompany, PageHeader, Panel } from "./page-parts";

function PeriodWorkspace() {
  const {
    workspace,
    resource,
    command,
    editing,
    locking,
    deleting,
    name,
    start,
    end,
    previousPeriodId,
    comparisonOptions,
    comparisonInvalid,
    setEditing,
    setLocking,
    setDeleting,
    setName,
    setStart,
    setEnd,
    setPreviousPeriodId,
    open,
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
              <Button onClick={() => open(null)}>
                <PlusIcon size={18} aria-hidden />
                دوره جدید
              </Button>
            )}
          </div>
        }
      />
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
                  <TableHead>
                    <span className="sr-only">عملیات</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listItems(resource.data).length ? (
                  listItems(resource.data).map((period) => (
                    <TableRow key={period.id}>
                      <TableRowHeader>{period.name}</TableRowHeader>
                      <TableCell className="whitespace-nowrap">
                        {displayDate(period.start)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {displayDate(period.end)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="secondary"
                          onClick={() => setLocking(period)}
                        >
                          مشاهده و مدیریت
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableEmptyCell colSpan={4} title="دوره مالی تعریف نشده" />
                )}
              </TableBody>
            </Table>
            <CursorPagination {...resource} />
          </>
        )}
      </Panel>
      <Drawer
        title={locking?.name || "قفل دوره"}
        open={!!locking}
        onOpenChange={(open) => {
          if (!open) setLocking(null);
        }}
      >
        {locking && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {workspace.canWrite && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      open(locking);
                      setLocking(null);
                    }}
                  >
                    ویرایش
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setDeleting(locking);
                      setLocking(null);
                      command.clearError();
                    }}
                  >
                    حذف دوره
                  </Button>
                </>
              )}
              <ButtonLink href="/accounting/period-end" variant="secondary">
                اسناد پایان و آغاز دوره
              </ButtonLink>
            </div>
            <PeriodLockPanel
              key={`${workspace.company.id}:${locking.id}`}
              periodId={locking.id}
            />
          </div>
        )}
      </Drawer>
      <Drawer
        title={editing ? "ویرایش دوره مالی" : "دوره مالی جدید"}
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
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
          <Field
            id="period-previous"
            name="previous_period_id"
            label="دوره مقایسه"
            icon={CalendarBlankIcon}
            error={
              comparisonInvalid
                ? "دوره مقایسه باید پیش از تاریخ آغاز باشد."
                : undefined
            }
          >
            <Select
              id="period-previous"
              value={comparisonInvalid ? "" : previousPeriodId || "none"}
              onValueChange={(value) =>
                setPreviousPeriodId(value === "none" ? "" : value)
              }
              options={[
                { value: "none", label: "بدون مقایسه" },
                ...comparisonOptions.map((period) => ({
                  value: period.id,
                  label: period.name,
                })),
              ]}
            />
          </Field>
          {(!start || !end) && (
            <p className="text-xs text-muted">
              ابتدا و انتهای دوره را انتخاب کنید.
            </p>
          )}
          <FormMessage error>{command.error?.message}</FormMessage>
          <Button
            type="submit"
            busy={command.busy}
            disabled={!start || !end || comparisonInvalid}
          >
            ذخیره دوره
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
        <p>{deleting?.name}</p>
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
