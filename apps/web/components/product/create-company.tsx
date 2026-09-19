"use client";

import { Alert } from "@/components/ui/alert";

import { SelectField, SelectOption } from "./select-field";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/lib/product-api";
import type { Company } from "@/lib/product-types";

import { Icon } from "./icons";

export function CreateCompany({ onCreated, compact = false }: { onCreated?: (company: Company) => void; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const company = await api<Company>("/companies", {
        method: "POST",
        body: JSON.stringify({
          legal_name: data.get("legal_name"),
          national_id: data.get("national_id") || null,
          fiscal_year_start_month: Number(data.get("fiscal_year_start_month")),
        }),
      });
      onCreated?.(company);
      router.replace(`/companies/${company.id}/overview`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "شرکت ساخته نشد.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className={
        compact
          ? "company-form grid grid-cols-1 sm:grid-cols-3 gap-4 items-end"
          : "company-form grid grid-cols-1 gap-4"
      }
      onSubmit={submit}
    >
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-foreground">
          نام حقوقی شرکت
        </label>
        <Input
          name="legal_name"
          required
          minLength={2}
          placeholder="مثلاً راهکار تجارت آریا"
          className="h-10 text-sm bg-background"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-semibold text-foreground">
          <label>شناسه ملی</label>
          <span className="text-[11px] font-normal text-muted-foreground">اختیاری</span>
        </div>
        <Input
          name="national_id"
          inputMode="numeric"
          dir="ltr"
          minLength={8}
          placeholder="۱۴۰۰۱۲۳۴۵۶۷"
          className="h-10 text-sm bg-background text-end"
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-foreground">
          ماه شروع سال مالی
        </label>
        <SelectField name="fiscal_year_start_month" defaultValue="1" className="h-10 text-xs">
          {Array.from({ length: 12 }, (_, index) => (
            <SelectOption value={String(index + 1)} key={index + 1}>
              ماه {new Intl.NumberFormat("fa-IR").format(index + 1)}
            </SelectOption>
          ))}
        </SelectField>
      </div>

      {error && (
        <Alert variant="destructive" className="sm:col-span-full text-xs p-3" role="alert">
          {error}
        </Alert>
      )}

      <Button
        type="submit"
        className={compact ? "h-10 text-xs font-bold gap-2" : "h-11 text-sm font-bold gap-2 w-full mt-2"}
        disabled={busy}
      >
        <Icon name="plus" className="size-4" />
        {busy ? "در حال ساخت…" : "ایجاد شرکت"}
      </Button>
    </form>
  );
}
