"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUpLeft, Archive, RotateCcw } from "lucide-react";
import type { Schema } from "@didban/api-client";
import { PageHeader, UnitSelect } from "./company-view";
import { Button } from "@/components/ui/button";
import { Field, Input, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/dialog";
export function SettingsView({
  company,
  onSubmit,
  onArchive,
  busy,
  error,
  onRefresh,
}: {
  company: Schema<"Company">;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onArchive: () => void;
  busy: boolean;
  error?: string;
  onRefresh: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <section className="motion-safe:animate-reveal">
      <PageHeader
        title="تنظیمات شرکت"
        description={company.name}
        action={
          <Button variant="ghost" asChild>
            <Link href={`/companies/${company.id}`}>
              بازگشت به شرکت
              <ArrowUpLeft size={16} aria-hidden />
            </Link>
          </Button>
        }
      />
      <div className="max-w-2xl space-y-5">
        <section className="rounded-panel border border-border bg-surface p-5 shadow-panel sm:p-7">
          <Form className="space-y-5" onSubmit={onSubmit}>
            <Field id="settings-name" label="نام شرکت">
              <Input
                id="settings-name"
                name="name"
                defaultValue={company.name}
                required
                maxLength={4000}
              />
            </Field>
            <UnitSelect initial={company.display_unit} />
            <FormMessage>{error}</FormMessage>
            {error ? (
              <Button variant="ghost" onClick={onRefresh}>
                دریافت نسخه تازه
              </Button>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={busy}>
                {busy ? "در حال ذخیره…" : "ذخیره تغییرات"}
              </Button>
            </div>
          </Form>
        </section>
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-border bg-surface p-5 sm:p-7">
          <div>
            <h2 className="font-medium">
              {company.archived ? "بازگرداندن شرکت" : "بایگانی شرکت"}
            </h2>
            <p className="mt-1 text-xs text-muted">
              سوابق و داده‌ها حفظ می‌شوند.
            </p>
          </div>
          <Button variant="secondary" onClick={() => setConfirm(true)}>
            {company.archived ? (
              <RotateCcw size={17} aria-hidden />
            ) : (
              <Archive size={17} aria-hidden />
            )}
            {company.archived ? "بازگرداندن" : "بایگانی"}
          </Button>
        </section>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={company.archived ? "شرکت بازگردانده شود؟" : "شرکت بایگانی شود؟"}
        description={company.name}
        busy={busy}
        onConfirm={() => {
          onArchive();
          setConfirm(false);
        }}
      />
    </section>
  );
}
