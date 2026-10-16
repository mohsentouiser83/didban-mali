"use client";
import { Form, FormMessage } from "@/components/ui/form";
import { TruncatedText } from "@/components/ui/tooltip";
import { EmptyState, StatusMessage, ErrorState, toJalaliDate, toPersianDigits } from "@/components/ui/financial";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { ArrowLeft, ArrowRight, Check, CheckCircle, FileText, UploadCloud } from "@/components/ui/icons";
import type { ImportBatch } from "@/lib/product-types";
import type { useMoadianComparison } from "./use-moadian-comparison";

type Controller = ReturnType<typeof useMoadianComparison>;

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
      {!periodStep ? <>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-[family-name:var(--font-display)] text-lg font-bold">انتخاب فایل‌های تطبیق</h2>
          <div role="group" aria-label="نوع تطبیق" className="flex gap-1 rounded-[var(--ds-button-radius)] bg-muted p-1">{([['sales', 'فروش'], ['purchases', 'خرید']] as const).map(([value, label]) => <Button key={value} type="button" size="sm" variant={c.selection.direction === value ? "outline" : "ghost"} aria-pressed={c.selection.direction === value} onClick={() => c.changeSelection({ direction: value })}>{c.selection.direction === value && <Check size={14} aria-hidden="true" />}{label}</Button>)}</div>
        </div>
        <div className="grid gap-6 md:grid-cols-2 md:gap-0 md:[&>section+section]:border-s md:[&>section+section]:border-border md:[&>section+section]:ps-6 md:[&>section:first-child]:pe-6">
          <SourcePicker id="internal" title="فایل حسابداری" files={c.internalFiles} selected={c.selectedInternal} value={c.selection.internal} onChange={(internal) => c.changeSelection({ internal })} onUpload={onUpload ? () => onUpload(c.selection.direction === "sales" ? "sales" : "purchases") : undefined} />
          <SourcePicker id="portal" title="فایل کارپوشه مؤدیان" files={c.portalFiles} selected={c.selectedPortal} value={c.selection.portal} onChange={(portal) => c.changeSelection({ portal })} onUpload={onUpload ? () => onUpload(`moadian_${c.selection.direction}`) : undefined} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><StatusMessage  >{c.sourcesReady ? "هر دو فایل انتخاب شدند" : "دو فایل را انتخاب کنید"}</StatusMessage><Button type="button" disabled={!c.sourcesReady} onClick={() => setStep("period")}>انتخاب بازه<ArrowLeft size={16} aria-hidden="true" /></Button></div>
      </> : <Form className="space-y-6" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-[family-name:var(--font-display)] text-lg font-bold">بازه تطبیق</h2><Button type="button" variant="ghost" onClick={() => setStep("sources")}><ArrowRight size={16} aria-hidden="true" />تغییر فایل‌ها</Button></div>
        <MoadianSourceSummary c={c} />
        <div className="grid max-w-2xl gap-4 sm:grid-cols-2"><div className="space-y-2"><label htmlFor="comparison-start" className="text-sm font-medium">از تاریخ</label><PersianDatePicker id="comparison-start" required value={c.selection.start} max={c.selection.end || undefined} onValueChange={(start) => c.changeSelection({ start })} /></div><div className="space-y-2"><label htmlFor="comparison-end" className="text-sm font-medium">تا تاریخ</label><PersianDatePicker id="comparison-end" required min={c.selection.start} value={c.selection.end} onValueChange={(end) => c.changeSelection({ end })} /></div></div>
        {c.error && !c.applied && <FormMessage>{c.error}</FormMessage>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><Button type="button" variant="ghost" onClick={() => { c.reset(); setStep("sources"); }}>شروع دوباره</Button><Button type="submit" disabled={!c.canSubmit} loading={c.loading} loadingText="در حال تطبیق…">اجرای تطبیق<ArrowLeft size={16} aria-hidden="true" /></Button></div>
      </Form>}
    </div>
  </section>;
}

function SourcePicker({ id, title, files, selected, value, onChange, onUpload }: {
  id: string; title: string; files: ImportBatch[]; selected?: ImportBatch; value: string;
  onChange: (value: string) => void; onUpload?: () => void;
}) {
  return <section className="min-w-0 space-y-4">
    <div className="flex items-center justify-between gap-3"><label htmlFor={`comparison-${id}`} className="flex items-center gap-2 text-sm font-medium"><FileText size={18} className="text-primary" aria-hidden="true" />{title}</label>{selected && <CheckCircle size={18} className="text-ds-success" aria-label="فایل انتخاب شده" />}</div>
    {files.length > 0 ? <>
      <Select dir="rtl" value={value || "none"} onValueChange={(next) => onChange(next === "none" ? "" : next)}><SelectTrigger id={`comparison-${id}`} className="w-full min-w-0 [&>span]:truncate"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">انتخاب فایل</SelectItem>{files.map((batch) => <SelectItem key={batch.id} value={batch.id}>{batch.original_name}</SelectItem>)}</SelectContent></Select>
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{selected ? toJalaliDate(selected.created_at) : `${toPersianDigits(files.length)} فایل آماده`}</span>{onUpload && <Button type="button" size="sm" variant="ghost" onClick={onUpload}><UploadCloud size={16} aria-hidden="true" />فایل جدید</Button>}</div>
    </> : <EmptyState variant="compact" className="min-h-32 items-start rounded-[var(--ds-button-radius)] border border-dashed border-border bg-muted/30 text-start" title="فایل آماده تطبیق ندارید" description={onUpload ? undefined : "ورود فایل توسط مدیر مالی"} action={onUpload ? { label: `ورود ${title}`, onClick: onUpload } : undefined} />}
  </section>;
}

export function MoadianSourceSummary({ c }: { c: Controller }) {
  return <dl className="grid min-w-0 gap-4 text-sm sm:grid-cols-2">{[{ title: "حسابداری", batch: c.selectedInternal }, { title: "کارپوشه مؤدیان", batch: c.selectedPortal }].map(({ title, batch }) => <div key={title} className="min-w-0"><dt className="mb-1 text-xs text-muted-foreground">{title}</dt><dd><TruncatedText text={batch?.original_name || "—"} className="font-medium" /></dd></div>)}</dl>;
}
