"use client";

import { useRef, useState, type ReactNode, type RefObject } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { FieldError } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { StatusMessage } from "@/components/ui/financial/status-message";
import { ErrorState } from "@/components/ui/financial/error-state";
import { ArrowLeft, CheckCircle, FileText, FolderSearch, Landmark, Sparkles, UploadCloud, X } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

type ArchiveUploadViewProps = {
  file: File | null;
  fieldError: string;
  fileControlRef: RefObject<HTMLButtonElement | null>;
  result: "idle" | "processing" | "complete" | "error";
  onFiles: (files: File[]) => void;
  onSubmit: () => void;
  onReset: () => void;
  sampleAction?: ReactNode;
};

export function ArchiveUploadView({ file, fieldError, fileControlRef, result, onFiles, onSubmit, onReset, sampleAction }: ArchiveUploadViewProps) {
  const [dragging, setDragging] = useState(false);
  const submitRef = useRef<HTMLButtonElement>(null);
  function start() {
    submitRef.current?.focus();
    onSubmit();
  }
  return <main dir="rtl" className="flex min-h-dvh flex-col bg-background text-foreground">
    <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-6 sm:px-12">
      <span className="flex items-center gap-3 font-display text-xl font-bold"><span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"><Sparkles size={22} aria-hidden="true" /></span>دیدبان مالی</span>
      <Badge variant="outline">پیش‌نمایش تعاملی</Badge>
    </header>
    <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-8 px-6 py-6 sm:px-12 lg:grid-cols-[1fr_1.1fr] lg:gap-20 lg:py-16">
      <section aria-labelledby="archive-heading" className="min-w-0">
        <p className="mb-4 flex items-center gap-3 text-xs font-medium text-muted-foreground"><span className="h-px w-9 bg-primary/40" aria-hidden="true" />ورود اسناد</p>
        <h1 id="archive-heading" className="text-balance font-display text-4xl font-bold leading-[1.5] sm:text-5xl sm:leading-[1.7]">از اسناد،<br /><span className="text-primary">به یک دید روشن.</span></h1>
        <p className="mt-4 max-w-sm text-sm leading-8 text-muted-foreground">گردش بانک و اسناد حسابداری را در یک فایل ZIP قرار دهید.</p>
        <div className="mt-10 hidden gap-5 border-t border-border pt-7 lg:grid">
          {[{ icon: Landmark, title: "گردش بانک", detail: "فایل‌های صورت‌حساب بانکی" }, { icon: FileText, title: "اسناد حسابداری", detail: "خروجی نرم‌افزار حسابداری" }].map(({ icon: Icon, title, detail }) => <div key={title} className="flex items-center gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-card"><Icon size={21} className="text-primary" aria-hidden="true" /></span><div><h2 className="text-sm font-medium">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div></div>)}
        </div>
      </section>
      <section aria-labelledby="archive-input-title" className="min-w-0 rounded-[var(--ds-p-radius-xl)] border border-border bg-card p-5 shadow-[var(--ds-shadow-xl)] sm:p-8">
        <div className="mb-7 flex items-center justify-between gap-3"><h2 id="archive-input-title" className="font-display text-lg font-bold">بسته اسناد شما</h2><span className="text-xs text-muted-foreground" dir="ltr">.ZIP</span></div>
        <Form noValidate onSubmit={(event) => { event.preventDefault(); start(); }} className="grid gap-5">
          <div onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
            onDrop={(event) => { event.preventDefault(); setDragging(false); onFiles(Array.from(event.dataTransfer.files)); }}
            className={cn("flex min-h-72 min-w-0 flex-col items-center justify-center rounded-[var(--ds-card-radius)] border border-dashed px-5 py-8 text-center transition-[background-color,border-color] duration-200 motion-reduce:transition-none", dragging ? "border-primary bg-primary/10" : "border-border bg-background/60")}>
            <span aria-hidden="true" className="mb-5 grid size-16 place-items-center rounded-2xl border border-border bg-card text-primary shadow-[var(--ds-shadow-lg)]">{file ? <FolderSearch size={30} /> : <UploadCloud size={30} />}</span>
            {file ? <><p className="w-full break-words text-sm font-medium [overflow-wrap:anywhere]"><bdi>{file.name}</bdi></p><p className="mt-2 text-xs text-muted-foreground">آماده شروع پیش‌نمایش</p></> : <><p className="text-sm font-medium">فایل ZIP را اینجا رها کنید</p><p id="archive-file-description" className="mt-2 text-xs text-muted-foreground">حداکثر ۵۰ مگابایت</p></>}
            <div className="mt-6 w-full max-w-56" ref={(element) => { fileControlRef.current = element?.querySelector("button") ?? null; }}>
              <FileInput id="archive-file" accept=".zip,application/zip,application/x-zip-compressed" aria-label={file ? "تغییر فایل ZIP" : "انتخاب فایل ZIP"} aria-describedby={fieldError ? "archive-file-error" : !file ? "archive-file-description" : undefined} aria-invalid={!!fieldError}
                fileName={file ? "تغییر فایل ZIP" : "انتخاب فایل ZIP"} onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) onFiles(files); event.target.value = ""; }} />
            </div>
            {file && <Button variant="ghost" size="sm" className="mt-2" onClick={onReset}><X size={14} aria-hidden="true" />حذف انتخاب</Button>}
          </div>
          {fieldError && <FieldError id="archive-file-error">{fieldError}</FieldError>}
          {result === "error" && <ErrorState variant="compact" title="پاسخ AI دریافت نشد." onRetry={start} />}
          {result === "complete" && <StatusMessage className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm"><CheckCircle size={22} aria-hidden="true" className="shrink-0 text-primary" /><div><p className="font-medium">پاسخ نمونه آماده است</p><p className="mt-1 text-xs text-muted-foreground">این پیش‌نمایش، محتوای ZIP را تحلیل نمی‌کند.</p></div></StatusMessage>}
          <Button ref={submitRef} type="submit" size="lg" className="w-full gap-3"><Sparkles size={18} aria-hidden="true" />{result === "complete" ? "مشاهده دوباره پردازش" : "شروع بررسی اسناد"}<ArrowLeft size={17} aria-hidden="true" className="ms-auto" /></Button>
        </Form>
        {sampleAction && <div className="mt-4 text-center">{sampleAction}</div>}
      </section>
    </div>
    <footer className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-5 text-xs text-muted-foreground sm:px-12"><span>دیدبان مالی</span><span>نسخه نمایشی · فایل‌ها ارسال نمی‌شوند.</span></footer>
  </main>;
}
