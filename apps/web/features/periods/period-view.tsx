"use client";

import { AppIcon } from "@/components/ui/app-icon";
import { useState, type FormEvent } from "react";
import type { Schema } from "@didban/api-client";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/features/companies/company-view";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableRowHeader,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/states";
import { Form } from "@/components/ui/form";
import { Field, Input, FormMessage } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { formatDate } from "@/lib/dates";

export function PeriodListView({
  periods,
  company,
  canManage,
  onCreate,
  onEdit,
  onDelete,
  more,
  onMore,
  busy,
}: {
  periods: Schema<"Period">[];
  company: string;
  canManage: boolean;
  onCreate: () => void;
  onEdit: (p: Schema<"Period">) => void;
  onDelete: (p: Schema<"Period">) => void;
  more: boolean;
  onMore: () => void;
  busy: boolean;
}) {
  const create = canManage ? (
    <Button onClick={onCreate}>
      <Plus size={18} aria-hidden />
      دوره جدید
    </Button>
  ) : undefined;
  return (
    <section className="motion-safe:animate-reveal">
      <PageHeader
        icon="CalendarRange"
        title="دوره‌های مالی"
        description={company}
        action={periods.length ? create : undefined}
      />
      {!periods.length ? (
        <EmptyState
          icon="CalendarRange"
          title="دوره‌ای تعریف نشده"
          action={create}
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>دوره</TableHead>
                  <TableHead>شروع</TableHead>
                  <TableHead>پایان</TableHead>
                  <TableHead>دوره قبل</TableHead>
                  {canManage ? <TableHead>مدیریت</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map((p) => (
                  <TableRow key={p.id}>
                    <TableRowHeader>{p.name}</TableRowHeader>
                    <TableCell className="tabular-nums">
                      {formatDate(p.starts_on)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDate(p.ends_on)}
                    </TableCell>
                    <TableCell>
                      {periods.find((v) => v.id === p.previous_period_id)
                        ?.name ?? "—"}
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" onClick={() => onEdit(p)}>
                            <Pencil size={15} aria-hidden />
                            ویرایش
                          </Button>
                          <Button variant="ghost" onClick={() => onDelete(p)}>
                            <Trash2 size={15} aria-hidden />
                            حذف
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="space-y-4 md:hidden">
            {periods.map((p) => (
              <article
                key={p.id}
                className="space-y-4 rounded-panel border border-border bg-surface p-5"
              >
                <h2 className="font-heading text-lg font-medium">{p.name}</h2>
                <p className="tabular-nums text-muted">
                  {formatDate(p.starts_on)} تا {formatDate(p.ends_on)}
                </p>
                {canManage ? (
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => onEdit(p)}>
                      <Pencil size={15} aria-hidden />
                      ویرایش
                    </Button>
                    <Button variant="ghost" onClick={() => onDelete(p)}>
                      <Trash2 size={15} aria-hidden />
                      حذف
                    </Button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </>
      )}
      {more ? (
        <Button
          className="mt-5"
          variant="secondary"
          disabled={busy}
          onClick={onMore}
        >
          <AppIcon name="ChevronsDown" />
          دوره‌های بیشتر
        </Button>
      ) : null}
    </section>
  );
}
export function PeriodFormDialog({
  period,
  periods,
  onClose,
  onSubmit,
  busy,
  error,
}: {
  period: Schema<"Period"> | null;
  periods: Schema<"Period">[];
  onClose: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  error?: string;
}) {
  const [previous, setPrevious] = useState(
    period?.previous_period_id ?? "none",
  );
  return (
    <Dialog
      icon="CalendarRange"
      open
      busy={busy}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={period ? "ویرایش دوره مالی" : "دوره مالی جدید"}
    >
      <Form className="space-y-5" onSubmit={onSubmit}>
        <Field icon="CalendarRange" id="period-name" label="نام دوره">
          <Input
            id="period-name"
            name="name"
            defaultValue={period?.name}
            required
            maxLength={4000}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field icon="CalendarRange" id="period-start" label="شروع دوره">
            <PersianDatePicker
              id="period-start"
              name="starts_on"
              label="شروع دوره"
              initialValue={period?.starts_on}
              required
            />
          </Field>
          <Field icon="CalendarRange" id="period-end" label="پایان دوره">
            <PersianDatePicker
              id="period-end"
              name="ends_on"
              label="پایان دوره"
              initialValue={period?.ends_on}
              required
            />
          </Field>
        </div>
        <Field icon="CalendarRange" id="previous-period" label="دوره قبل">
          <Select
            id="previous-period"
            name="previous_period_id"
            value={previous}
            onValueChange={setPrevious}
            options={[
              { value: "none", label: "بدون دوره قبل" },
              ...periods
                .filter((p) => p.id !== period?.id)
                .map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </Field>
        <FormMessage>{error}</FormMessage>
        <Button type="submit" disabled={busy} className="w-full">
          <AppIcon name="Save" />
          {busy ? "در حال ثبت…" : "ذخیره دوره"}
        </Button>
      </Form>
    </Dialog>
  );
}
