"use client";
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
function CreateCompanyView({ controller: { busy, error, submit }, compact }: { controller: ReturnType<typeof useCreateCompany>; compact: boolean }) {
  const id = useId();
  return (
    <Form
      className={
        "pp-company-form " +
        (compact
          ? "company-form grid grid-cols-1 sm:grid-cols-3 gap-4 items-end"
          : "company-form grid grid-cols-1 gap-4")
      }
      onSubmit={(event) => { event.preventDefault(); void submit(new FormData(event.currentTarget)); }}
    >
      <div className="space-y-1.5">
        <label htmlFor={`${id}-name`} className="block text-sm font-semibold text-foreground">
          نام حقوقی شرکت
        </label>
        <Input
          id={`${id}-name`}
          name="legal_name"
          required
          minLength={2}
          placeholder="مثلاً راهکار تجارت آریا"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-semibold text-foreground">
          <label htmlFor={`${id}-national`}>شناسه ملی</label>
          <span className="text-[11px] font-normal text-muted-foreground">
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
          className="text-end"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${id}-month`} className="block text-sm font-semibold text-foreground">
          ماه شروع سال مالی
        </label>
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
            ? "h-10 text-xs font-bold gap-2"
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
