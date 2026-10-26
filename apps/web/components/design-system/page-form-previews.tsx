"use client";

import { useState } from "react";
import { CreateCompanyView } from "@/components/product/create-company";
import { MoadianComparisonSetup } from "@/components/product/moadian-comparison-setup";
import type { ImportBatch } from "@/lib/product-types";
import type { ComparisonSelection } from "@/lib/moadian";

const baseBatch = { source_label: "نمونه", status: "completed", stage: "completed", progress: 100, size_bytes: 100, sha256: "preview", scan_status: "clean", duplicate_detected: false, failure_message: null, created_at: "2026-10-18T12:00:00Z" } as const;
const internal: ImportBatch = { ...baseBatch, id: "internal", source_kind: "sales", original_name: "فایل آزمایشی حسابداری با نام بسیار طولانی برای بررسی نمایش کامل متن و هم‌ارتفاعی فیلدهای فرم.xlsx" };
const portal: ImportBatch = { ...baseBatch, id: "portal", source_kind: "moadian_sales", original_name: "فایل آزمایشی کارپوشه مؤدیان با نام بسیار طولانی برای بررسی tooltip و چیدمان فرم.xlsx" };
const initial: ComparisonSelection = { direction: "sales", internal: [], portal: [], start: "", end: "", internalComplete: false, portalComplete: false };
export function PageFormPreviews() {
  const [error, setError] = useState("");
  const [selection, setSelection] = useState(initial);
  const selectedInternal = selection.internal.includes(internal.id) ? [internal] : [];
  const selectedPortal = selection.portal.includes(portal.id) ? [portal] : [];
  const sourcesReady = selectedInternal.length > 0 && selectedPortal.length > 0;
  return <section aria-label="نمونه فرم‌های صفحه" className="grid gap-6">
    <h2 className="text-[22px] font-medium">فرم‌های داخل صفحه</h2>
    <p className="text-sm text-muted-foreground">داده‌ها آزمایشی‌اند؛ فرم‌ها چیزی ثبت یا ارسال نمی‌کنند.</p>
    <section aria-label="فرم شرکت آزمایشی" className="min-w-0 rounded-[var(--ds-card-radius)] border border-border bg-card p-5">
      <CreateCompanyView compact controller={{ busy: false, error, submit: async () => { setError("شرکت آزمایشی ثبت نشد؛ ورودی‌ها حفظ شدند."); } }} />
    </section>
    <MoadianComparisonSetup c={{ selection, sourcesReady, internalFiles: [internal], portalFiles: [portal], selectedInternal, selectedPortal,
      changeSelection: patch => setSelection(current => ({ ...current, ...patch })), canSubmit: sourcesReady && !!selection.start && !!selection.end && selection.start <= selection.end,
      loading: false, error: "", applied: null, reset: () => setSelection(initial),
    }} onSubmit={() => {}} />
  </section>;
}
