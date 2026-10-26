"use client";
import { ControlLabel, fieldIcon } from "@/components/ui/field-layout";
import { Form, FormMessage } from "@/components/ui/form";


import { SelectField, SelectOption } from "./select-field";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useId } from "react";
import { useCreateCompany } from "./use-create-company";

import type { Company } from "@/lib/product-types";

import { Icon } from "./icons";

export function CreateCompany({
  onCreated,
  compact = false,
}: {
  onCreated?: (company: Company) => void;
  compact?: boolean;
}) {
  const controller = useCreateCompany(onCreated);
  return <CreateCompanyView controller={controller} compact={compact} />;
}
export function CreateCompanyView({ controller: { busy, error, submit }, compact }: { controller: Pick<ReturnType<typeof useCreateCompany>, "busy" | "error" | "submit">; compact: boolean }) {
  const id = useId();
  return (
    <Form
      className={
        compact
          ? "grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-3 sm:items-start"
          : "grid grid-cols-1 gap-5"
      }
      onSubmit={(event) => { event.preventDefault(); void submit(new FormData(event.currentTarget)); }}
    >
      <div className="space-y-1.5">
        <ControlLabel htmlFor={`${id}-name`} icon={fieldIcon("نام حقوقی شرکت")}>نام حقوقی شرکت</ControlLabel>
        <Input
          id={`${id}-name`}
          name="legal_name"
          required
          minLength={2}
          placeholder="مثلاً راهکار تجارت آریا"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex h-6 min-w-0 items-center justify-between gap-2">
          <ControlLabel htmlFor={`${id}-national`} icon={fieldIcon("شناسه ملی")}>شناسه ملی</ControlLabel>
          <span className="shrink-0 text-xs text-muted-foreground">
            اختیاری
          </span>
        </div>
        <Input
          id={`${id}-national`}
          name="national_id"
          inputMode="numeric"
          dir="ltr"
          minLength={8}
          placeholder="۱۴۰۰۱۲۳۴۵۶۷"
          className="text-start"
        />
      </div>

      <div className="space-y-1.5">
        <ControlLabel htmlFor={`${id}-month`} icon={fieldIcon("ماه شروع سال مالی")}>ماه شروع سال مالی</ControlLabel>
        <SelectField id={`${id}-month`} name="fiscal_year_start_month" defaultValue="1">
          {Array.from({ length: 12 }, (_, index) => (
            <SelectOption value={String(index + 1)} key={index + 1}>
              ماه {new Intl.NumberFormat("fa-IR").format(index + 1)}
            </SelectOption>
          ))}
        </SelectField>
      </div>

      {error && (
        <FormMessage
          variant="destructive"
          className="sm:col-span-full text-xs p-3"
          role="alert"
        >
          {error}
        </FormMessage>
      )}

      <Button
        type="submit"
        className={
          compact
            ? "gap-2 sm:col-span-full sm:justify-self-end"
            : "h-11 text-sm font-bold gap-2 w-full mt-2"
        }
        disabled={busy}
      >
        <Icon name="plus" className="size-4" />
        {busy ? "در حال ساخت…" : "ایجاد شرکت"}
      </Button>
    </Form>
  );
}
