"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SupportModal } from "@/components/product/support-modal";
import { FinancialValidationModal } from "@/components/product/financial-validation-modal";
import { RecordLineageDialog } from "@/components/product/record-lineage-dialog";
import type { api } from "@/lib/product-api";
import type { RecordLineageResponse } from "@/lib/product-types";

const lineage: RecordLineageResponse = {
  company_id: "preview", record_id: "preview", entity_type: "ledger", import_id: "preview", source_file_id: "preview",
  source_filename: "فایل آزمایشی حسابداری با عنوان بسیار طولانی برای بررسی نمایش کامل نام فایل و هم‌ترازی.xlsx", source_file_sha256: "a7c4e21b".repeat(8), source_row_number: 0, sheet_name: "دفتر حسابداری آزمایشی", mapping_version: 2,
  raw_values: { "شرح ثبت با عنوان بسیار طولانی برای بررسی هم‌ارتفاع بودن برچسب‌ها": "شرح آزمایشی پرداخت هزینه پشتیبانی تجهیزات و خدمات نگهداری برای دوره مالی شرکت نمونه با اطلاعات تکمیلی", "مبلغ": "90071992547409931", "وصول": 0, "سررسید": null },
  normalized_fields: { description: "شرح آزمایشی خدمات پشتیبانی تجهیزات و نگهداری با متن طولانی برای بررسی سه‌نقطه و tooltip", amount_irr: "90071992547409931", source_row_number: 0, due_date: null }, mapping_summary: {}, transforms_applied: {}, imported_at: "2026-10-18T12:00:00Z",
};
type Preview = "support" | "support_error" | "validation" | "validation_error" | "lineage" | "lineage_error" | "lineage_empty" | "lineage_loading" | "confirm" | "confirm_busy" | null;
function transport(mode: Preview): typeof api {
  let failed = false;
  return async <T,>(_path: string, options?: RequestInit): Promise<T> => {
    await Promise.resolve();
    if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (mode === "lineage_loading") return new Promise<T>(() => {});
    if (mode?.endsWith("error") && (!failed || mode !== "lineage_error")) { failed = true; throw Error("عملیات آزمایشی انجام نشد؛ دوباره تلاش کنید."); }
    return (mode === "lineage_empty" ? { ...lineage, raw_values: {}, normalized_fields: {} } : lineage) as T;
  };
}
export function DialogPatternsPreview() {
  const [mode, setMode] = useState<Preview>(null);
  const request = useMemo(() => transport(mode), [mode]);
  const close = (open: boolean) => { if (!open) setMode(null); };
  return <section aria-label="نمونه دیالوگ‌ها" className="grid gap-4">
    <h2 className="text-[22px] font-medium">دیالوگ‌ها و مودال‌ها</h2>
    <p className="text-sm text-muted-foreground">نمونه آزمایشی؛ هیچ درخواست یا تأیید مالی ارسال نمی‌شود.</p>
    <div className="flex flex-wrap gap-2">{([
      ["support", "آزمایش پشتیبانی"], ["support_error", "آزمایش خطای پشتیبانی"], ["validation", "آزمایش تأیید ارقام"], ["validation_error", "آزمایش خطای تأیید ارقام"],
      ["lineage", "آزمایش منشأ داده"], ["lineage_error", "آزمایش خطای منشأ داده"], ["lineage_empty", "آزمایش مقادیر خالی منشأ داده"], ["lineage_loading", "آزمایش بارگذاری منشأ داده"], ["confirm", "آزمایش تأیید حذف"], ["confirm_busy", "آزمایش انتظار حذف"],
    ] as const).map(([value, label]) => <Button key={value} variant="outline" onClick={() => setMode(value)}>{label}</Button>)}</div>
    {(mode === "support" || mode === "support_error") && <SupportModal open companyId="preview" onOpenChange={close} request={request} />}
    {(mode === "validation" || mode === "validation_error") && <FinancialValidationModal open companyId="preview" onOpenChange={close} onValidated={() => setMode(null)} request={request} />}
    {mode?.startsWith("lineage") && <RecordLineageDialog open companyId="preview" entityType="ledger" recordId="preview" onOpenChange={close} request={request} />}
    <ConfirmDialog open={mode === "confirm" || mode === "confirm_busy"} onOpenChange={close} title="حذف سند مالی" description="فایل «سند آزمایشی با نام طولانی برای بررسی خوانایی پیام و نمایش کامل پیامد حذف» حذف شود؟ داده‌های وابسته هم حذف می‌شوند." busy={mode === "confirm_busy"} onConfirm={() => setMode(null)} />
  </section>;
}
