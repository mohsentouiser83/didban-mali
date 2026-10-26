"use client";
import { ControlLabel, DetailField, DetailGroup, fieldIcon } from "@/components/ui/field-layout";
import { Form, FormMessage } from "@/components/ui/form";
import { StatusMessage } from "@/components/ui/financial";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ComparisonSourcePicker } from "./comparison-source-picker";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { ArrowLeft, ArrowRight, Check } from "@/components/ui/icons";
import type { ImportBatch } from "@/lib/product-types";
import type { useMoadianComparison } from "./use-moadian-comparison";

type Controller = Pick<ReturnType<typeof useMoadianComparison>, "selection" | "sourcesReady" | "internalFiles" | "portalFiles" | "selectedInternal" | "selectedPortal" | "changeSelection" | "canSubmit" | "loading" | "error" | "applied" | "reset">;

export function MoadianComparisonSetup({ c, onUpload, onSubmit }: {
  c: Controller; onUpload?: (kind: ImportBatch["source_kind"]) => void; onSubmit: () => void;
}) {
  const [step, setStep] = useState<"sources" | "period">("sources");
  const periodStep = step === "period" && c.sourcesReady;
  const contentRef = useRef<HTMLDivElement>(null);
  const previousStep = useRef(periodStep);
  useEffect(() => {
    if (previousStep.current !== periodStep) contentRef.current?.focus();
    previousStep.current = periodStep;
  }, [periodStep]);
  return <section aria-label="تنظیم تطبیق" className="overflow-hidden rounded-[var(--ds-card-radius)] border border-border bg-card">
    <ol aria-label="مراحل تطبیق" className="flex items-center gap-3 border-b border-border px-4 py-4 text-sm sm:gap-5 sm:px-6">
      <li aria-current={!periodStep ? "step" : undefined} className={`flex items-center gap-2 ${!periodStep ? "font-medium text-foreground" : "text-muted-foreground"}`}><span className={`flex size-7 items-center justify-center rounded-full ${c.sourcesReady ? "bg-[var(--ds-success-subtle)] text-ds-success" : "bg-primary/10 text-primary"}`}>{c.sourcesReady ? <Check size={16} aria-hidden="true" /> : "۱"}</span>منابع تطبیق</li>
      <ArrowLeft size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      <li aria-current={periodStep ? "step" : undefined} className={`flex items-center gap-2 ${periodStep ? "font-medium text-foreground" : "text-muted-foreground"}`}><span className={`flex size-7 items-center justify-center rounded-full ${periodStep ? "bg-primary/10 text-primary" : "bg-muted"}`}>۲</span>بازه و اجرا</li>
    </ol>
    <div ref={contentRef} tabIndex={-1} aria-label={periodStep ? "بازه تطبیق" : "انتخاب فایل‌های تطبیق"} key={periodStep ? "period" : "sources"} className="space-y-6 p-4 outline-none motion-safe:animate-[workspace-enter_180ms_ease-out_both] sm:p-6">
      {!periodStep ? <Form className="space-y-6" onSubmit={(event) => { event.preventDefault(); if (c.sourcesReady) setStep("period"); }}>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-[family-name:var(--font-display)] text-lg font-bold">انتخاب فایل‌های تطبیق</h2>
          <div role="group" aria-label="نوع تطبیق" className="flex gap-1 rounded-[var(--ds-button-radius)] bg-muted p-1">{([['sales', 'فروش'], ['purchases', 'خرید']] as const).map(([value, label]) => <Button key={value} type="button" size="sm" variant={c.selection.direction === value ? "outline" : "ghost"} aria-pressed={c.selection.direction === value} onClick={() => c.changeSelection({ direction: value })}>{c.selection.direction === value && <Check size={14} aria-hidden="true" />}{label}</Button>)}</div>
        </div>
        <div className="grid gap-6 md:grid-cols-2 md:gap-0 md:[&>fieldset+fieldset]:border-s md:[&>fieldset+fieldset]:border-border md:[&>fieldset+fieldset]:ps-6 md:[&>fieldset:first-child]:pe-6">
          <ComparisonSourcePicker id="internal" title="فایل‌های حسابداری" files={c.internalFiles} value={c.selection.internal} onChange={(internal) => c.changeSelection({ internal })} onUpload={onUpload ? () => onUpload(c.selection.direction === "sales" ? "sales" : "purchases") : undefined} />
          <ComparisonSourcePicker id="portal" title="فایل‌های کارپوشه مؤدیان" files={c.portalFiles} value={c.selection.portal} onChange={(portal) => c.changeSelection({ portal })} onUpload={onUpload ? () => onUpload(`moadian_${c.selection.direction}`) : undefined} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><StatusMessage  >{c.sourcesReady ? "منابع دو طرف انتخاب شدند" : "حداقل یک فایل از هر طرف انتخاب کنید"}</StatusMessage><Button type="submit" disabled={!c.sourcesReady}>انتخاب بازه<ArrowLeft size={16} aria-hidden="true" /></Button></div>
      </Form> : <Form className="space-y-6" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-[family-name:var(--font-display)] text-lg font-bold">بازه تطبیق</h2><Button type="button" variant="ghost" onClick={() => setStep("sources")}><ArrowRight size={16} aria-hidden="true" />تغییر فایل‌ها</Button></div>
        <MoadianSourceSummary c={c} />
        <div className="grid max-w-2xl gap-4 sm:grid-cols-2"><div className="space-y-2"><ControlLabel htmlFor="comparison-start" icon={fieldIcon("از تاریخ")}>از تاریخ</ControlLabel><PersianDatePicker id="comparison-start" required value={c.selection.start} max={c.selection.end || undefined} onValueChange={(start) => c.changeSelection({ start })} /></div><div className="space-y-2"><ControlLabel htmlFor="comparison-end" icon={fieldIcon("تا تاریخ")}>تا تاریخ</ControlLabel><PersianDatePicker id="comparison-end" required min={c.selection.start} value={c.selection.end} onValueChange={(end) => c.changeSelection({ end })} /></div></div>
        <fieldset className="grid gap-3"><legend className="mb-3 text-sm font-medium">پوشش بازه</legend>
          <label className="flex min-h-11 items-center gap-3" htmlFor="internal-coverage"><Checkbox id="internal-coverage" checked={c.selection.internalComplete} onCheckedChange={(value) => c.changeSelection({ internalComplete: value === true })} /><span className="text-sm">فایل‌های حسابداری این بازه را کامل پوشش می‌دهند</span></label>
          <label className="flex min-h-11 items-center gap-3" htmlFor="portal-coverage"><Checkbox id="portal-coverage" checked={c.selection.portalComplete} onCheckedChange={(value) => c.changeSelection({ portalComplete: value === true })} /><span className="text-sm">فایل‌های مؤدیان این بازه را کامل پوشش می‌دهند</span></label>
        </fieldset>
        {c.error && !c.applied && <FormMessage>{c.error}</FormMessage>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><Button type="button" variant="ghost" onClick={() => { c.reset(); setStep("sources"); }}>شروع دوباره</Button><Button type="submit" disabled={!c.canSubmit} loading={c.loading} loadingText="در حال تطبیق…">اجرای تطبیق<ArrowLeft size={16} aria-hidden="true" /></Button></div>
      </Form>}
    </div>
  </section>;
}

export function MoadianSourceSummary({ c }: { c: Controller }) {
  return <DetailGroup>{[{ title: "حسابداری", batch: c.selectedInternal }, { title: "کارپوشه مؤدیان", batch: c.selectedPortal }].map(({ title, batch }) => <DetailField key={title} icon={fieldIcon("فایل " + title)} label={title}>{batch.map((file) => file.original_name).join("، ") || "—"}</DetailField>)}</DetailGroup>;
}
