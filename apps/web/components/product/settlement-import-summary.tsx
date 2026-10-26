"use client";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import { LoadingState, toPersianDigits } from "@/components/ui/financial";
import type { ImportBatch } from "@/lib/product-types";
import { useSettlementImport } from "./use-settlement-import";

export function SettlementImportSummary({ companyId, batch, canWrite, onUpdated }: {
  companyId: string; batch: ImportBatch; canWrite: boolean; onUpdated: () => void;
}) {
  const c = useSettlementImport(companyId, batch, onUpdated);
  return <SettlementImportSummaryView counts={c.counts} busy={c.busy} error={c.error} canRetry={canWrite && ["completed", "completed_limited"].includes(batch.status)} onRetry={() => void c.retry()} />;
}

export function SettlementImportSummaryView({ counts, busy, error, canRetry, onRetry }: {
  counts?: Record<string, number>; busy: boolean; error: string; canRetry: boolean; onRetry: () => void;
}) {
  return <section className="grid min-w-0 gap-3 rounded-[var(--ds-card-radius)] border border-border bg-card p-4" aria-label="نتیجه ریز تسویه">
    <h2 className="text-base font-medium">نتیجه ریز تسویه</h2>
    {counts ? <dl className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
      <div><dt>اتصال ثبت‌شده</dt><dd>{toPersianDigits(counts.matched ?? 0)}</dd></div>
      <div><dt>قبلاً ثبت‌شده</dt><dd>{toPersianDigits(counts.duplicate ?? 0)}</dd></div>
      <div><dt>نیازمند بررسی</dt><dd>{toPersianDigits(counts.review ?? 0)}</dd></div>
      <div><dt>نامعتبر</dt><dd>{toPersianDigits(counts.invalid ?? 0)}</dd></div>
    </dl> : <p className="text-sm text-muted-foreground">نتیجه پس از تکمیل پردازش نمایش داده می‌شود.</p>}
    {busy && <LoadingState variant="inline" label="در حال بررسی ریز تسویه…" />}
    {error && <FormMessage>{error}</FormMessage>}
    {canRetry && <Button className="w-fit" variant="outline" disabled={busy} onClick={onRetry}>بررسی دوباره موارد حل‌نشده</Button>}
  </section>;
}
