"use client";
import { CalendarBlankIcon as HeaderIcon } from "@phosphor-icons/react";
import { Select } from "@/components/ui/select";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
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
import { useCommand } from "@/hooks/use-command";
import { usePagedResource } from "@/hooks/use-paged-resource";
import { useWorkspace } from "@/hooks/workspace";
import { listItems, type Period } from "@/lib/api";
import { displayDate } from "@/lib/utils";
import {
  CalendarBlankIcon,
  PencilSimpleIcon,
  PlusIcon,
  TextAaIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { PeriodLockPanel } from "./period-lock-panel";
import { NoCompany, PageHeader, Panel } from "./page-parts";

function PeriodWorkspace() {
  const workspace = useWorkspace();
  const resource = usePagedResource<Period>(
    workspace.companyPath("financial-periods"),
  );
  const command = useCommand();
  const [editing, setEditing] = useState<Period | null | undefined>();
  const [locking, setLocking] = useState<Period | null>(null);
  const [deleting, setDeleting] = useState<Period | null>(null);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [previousPeriodId, setPreviousPeriodId] = useState("");
  const comparisonOptions = workspace.periods.filter(
    (period) => period.id !== editing?.id && !!start && period.end < start,
  );
  const comparisonInvalid =
    !!previousPeriodId &&
    !comparisonOptions.some((period) => period.id === previousPeriodId);
  function open(period: Period | null) {
    setEditing(period);
    setName(period?.name || "");
    setStart(period?.start || "");
    setEnd(period?.end || "");
    setPreviousPeriodId(period?.previous_period_id || "");
    command.clearError();
  }
  function save() {
    if (!name.trim() || !start || !end) return;
    void command.run(
      workspace.companyPath(
        "financial-periods" + (editing ? `/${editing.id}` : ""),
      ),
      {
        method: editing ? "PATCH" : "POST",
        body: {
          name: name.trim(),
          start,
          end,
          previous_period_id: previousPeriodId || null,
        },
        version: editing?.version,
      },
      () => {
        setEditing(undefined);
        resource.refresh();
        workspace.refreshPeriods();
      },
      "دوره مالی ذخیره شد.",
    );
  }
  if (!workspace.company) return <NoCompany />;
  return (
    <>
      <PageHeader
        icon={HeaderIcon}
        title="دوره‌های مالی"
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/accounting/period-end" variant="secondary">
              اسناد پایان و آغاز دوره
            </ButtonLink>
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
                          آمادگی و قفل دوره
                        </Button>
                        {workspace.canWrite && (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              className="size-11 p-0"
                              aria-label={`ویرایش ${period.name}`}
                              onClick={() => open(period)}
                            >
                              <PencilSimpleIcon size={18} />
                            </Button>
                            <Button
                              variant="ghost"
                              className="size-11 p-0 text-danger"
                              aria-label={`حذف ${period.name}`}
                              onClick={() => {
                                setDeleting(period);
                                command.clearError();
                              }}
                            >
                              <TrashIcon size={18} />
                            </Button>
                          </div>
                        )}
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
      <Dialog
        title={locking?.name || "قفل دوره"}
        open={!!locking}
        onOpenChange={(open) => {
          if (!open) setLocking(null);
        }}
      >
        {locking && (
          <PeriodLockPanel
            key={`${workspace.company.id}:${locking.id}`}
            periodId={locking.id}
          />
        )}
      </Dialog>
      <Dialog
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
      </Dialog>
      <ConfirmDialog
        title="دوره مالی حذف شود؟"
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        busy={command.busy}
        onConfirm={() => {
          if (deleting)
            void command.run(
              workspace.companyPath(`financial-periods/${deleting.id}`),
              { method: "DELETE", version: deleting.version },
              () => {
                setDeleting(null);
                resource.refresh();
              },
              "دوره حذف شد.",
            );
        }}
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
