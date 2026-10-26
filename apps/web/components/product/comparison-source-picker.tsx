"use client";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ControlLabel, fieldIcon } from "@/components/ui/field-layout";
import { EmptyState, StatusMessage, toJalaliDate, toPersianDigits } from "@/components/ui/financial";
import { UploadCloud } from "@/components/ui/icons";
import type { ImportBatch } from "@/lib/product-types";

function useFilePicker(files: ImportBatch[]) {
  const [query, setQuery] = useState("");
  return { query, setQuery, visible: files.filter((file) => file.original_name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) };
}
export function ComparisonSourcePicker({ id, title, files, value, onChange, onUpload }: {
  id: string; title: string; files: ImportBatch[]; value: string[];
  onChange: (value: string[]) => void; onUpload?: () => void;
}) {
  const c = useFilePicker(files);
  return <fieldset className="grid min-w-0 content-start gap-3">
    <legend className="mb-3 text-sm font-medium">{title}</legend>
    {files.length ? <>
      <ControlLabel htmlFor={`comparison-${id}-search`} className="sr-only" icon={fieldIcon("جستجو")}>جستجو در {title}</ControlLabel>
      <Input id={`comparison-${id}-search`} value={c.query} onChange={(event) => c.setQuery(event.target.value)} placeholder="جستجوی نام فایل" />
      <div className="max-h-60 overflow-y-auto rounded-[var(--ds-button-radius)] border border-border">
        {c.visible.map((file) => <label key={file.id} htmlFor={`comparison-${id}-${file.id}`} className="flex min-h-14 cursor-pointer items-center gap-3 border-b border-border px-3 py-3 text-sm last:border-0 has-[[data-state=checked]]:bg-primary/5 motion-safe:transition-colors">
          <Checkbox id={`comparison-${id}-${file.id}`} checked={value.includes(file.id)} onCheckedChange={(checked) => onChange(checked === true ? [...value, file.id] : value.filter((item) => item !== file.id))} />
          <span className="grid min-w-0 gap-1"><span className="break-words">{file.original_name}</span><span className="text-xs text-muted-foreground">{toJalaliDate(file.created_at)}</span></span>
        </label>)}
        {!c.visible.length && <EmptyState variant="compact" title="فایلی پیدا نشد" hasActiveFilters onClearFilters={() => c.setQuery("")} />}
      </div>
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <StatusMessage className="text-xs">{toPersianDigits(value.length)} فایل انتخاب شده</StatusMessage>
        {value.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>پاک‌کردن انتخاب</Button>}
      </div>
    </> : <EmptyState variant="compact" title="فایل دارای مشخصات فاکتور آماده نیست" />}
    {onUpload && <Button type="button" variant="outline" className="justify-self-start" onClick={onUpload}><UploadCloud size={16} aria-hidden="true" />ورود فایل</Button>}
  </fieldset>;
}
