"use client";

import { AppIcon } from "@/components/ui/app-icon";
import type { FormEvent } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Field, Input, Textarea, FormMessage } from "@/components/ui/field";
import { Select, type Option } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";

export type MappingField = {
  key: string;
  label: string;
  value: string;
  options: Option[];
  validate: (value: string) => string | null;
};
export function MappingView({
  open,
  onOpenChange,
  sheets,
  sheet,
  onSheet,
  kinds,
  kind,
  onKind,
  header,
  onHeader,
  unit,
  onUnit,
  calendar,
  onCalendar,
  fields,
  onColumn,
  trialDates,
  reason,
  onReason,
  busy,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sheets: Option[];
  sheet: string;
  onSheet: (v: string) => void;
  kinds: Option[];
  kind: string;
  onKind: (v: string) => void;
  header: string;
  onHeader: (v: string) => void;
  unit: string;
  onUnit: (v: string) => void;
  calendar: string;
  onCalendar: (v: string) => void;
  fields: MappingField[];
  onColumn: (key: string, value: string) => void;
  trialDates: {
    start: string;
    end: string;
    needsStart: boolean;
    needsEnd: boolean;
  } | null;
  reason: string;
  onReason: (v: string) => void;
  busy: boolean;
  error?: string;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog
      icon="SlidersHorizontal"
      title="تنظیم تشخیص فایل"
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
    >
      <Form onSubmit={onSubmit} className="space-y-5">
        <Field icon="FileSpreadsheet" id="mapping-sheet" label="شیت">
          <Select
            id="mapping-sheet"
            value={sheet}
            onValueChange={onSheet}
            options={sheets}
          />
        </Field>
        <Field icon="FileSpreadsheet" id="mapping-kind" label="نوع منبع">
          <Select
            id="mapping-kind"
            value={kind}
            onValueChange={onKind}
            options={kinds}
          />
        </Field>
        <Field
          icon="FileSpreadsheet"
          id="mapping-header"
          label="شماره ردیف سربرگ"
        >
          <Input
            id="mapping-header"
            type="number"
            min={1}
            max={20000}
            required
            value={header}
            onChange={(e) => onHeader(e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field icon="Coins" id="mapping-unit" label="واحد ردیف‌های بدون واحد">
            <Select
              id="mapping-unit"
              value={unit}
              onValueChange={onUnit}
              options={[
                { value: "source", label: "از ستون واحد منبع" },
                { value: "IRR", label: "ریال" },
                { value: "IRT", label: "تومان" },
              ]}
            />
          </Field>
          <Field
            icon="CalendarRange"
            id="mapping-calendar"
            label="تقویم تاریخ متنی"
          >
            <Select
              id="mapping-calendar"
              value={calendar}
              onValueChange={onCalendar}
              options={[
                { value: "source", label: "از تاریخ صریح منبع" },
                { value: "jalali", label: "شمسی" },
                { value: "gregorian", label: "میلادی" },
              ]}
            />
          </Field>
        </div>
        {trialDates ? (
          <div key={sheet} className="grid gap-4 sm:grid-cols-2">
            {trialDates.needsStart ? (
              <Field icon="BookOpen" id="trial-start" label="آغاز گردش تراز">
                <PersianDatePicker
                  id="trial-start"
                  name="period_start"
                  label="آغاز گردش تراز"
                  initialValue={trialDates.start}
                  required
                />
              </Field>
            ) : null}
            {trialDates.needsEnd ? (
              <Field icon="CalendarRange" id="trial-end" label="تاریخ تراز">
                <PersianDatePicker
                  id="trial-end"
                  name="as_of_date"
                  label="تاریخ تراز"
                  initialValue={trialDates.end}
                  required
                />
              </Field>
            ) : null}
          </div>
        ) : null}
        {fields.map((field) => (
          <Field
            icon="FileSpreadsheet"
            key={field.key}
            id={`column-${field.key}`}
            label={field.label}
          >
            <Select
              id={`column-${field.key}`}
              value={field.value}
              onValueChange={(v) => onColumn(field.key, v)}
              options={field.options}
              validate={field.validate}
            />
          </Field>
        ))}
        <Field icon="SlidersHorizontal" id="mapping-reason" label="دلیل تنظیم">
          <Textarea
            id="mapping-reason"
            required
            maxLength={1000}
            value={reason}
            onChange={(e) => onReason(e.target.value)}
          />
        </Field>
        <FormMessage>{error}</FormMessage>
        <Button type="submit" className="w-full" disabled={busy || !kind}>
          <AppIcon name="RefreshCw" />
          {busy ? "در حال ثبت…" : "ثبت تنظیمات و بررسی دوباره"}
        </Button>
      </Form>
    </Dialog>
  );
}
