"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { UploadWizard } from "@/components/product/upload-wizard";
import { SettlementImportSummaryView } from "@/components/product/settlement-import-summary";
import type { api } from "@/lib/product-api";
import type { Company, ImportBatch } from "@/lib/product-types";

const columns = ["شناسه تسویه", "تاریخ دریافت", "مبلغ دریافت", "شماره مالیاتی صورتحساب", "شماره پیگیری"];
const fields = ["settlement_id", "payment_date", "settlement_amount", "tax_id", "bank_reference"];
const batch = { id: "preview", source_kind: "settlement_sales", scan_status: "clean", status: "awaiting_mapping", original_name: "settlements.csv", source_label: "نمایش آزمایشی" } as ImportBatch;
// Display-only transport: no network calls or financial writes are made in this preview.
const previewRequest: typeof api = async <T,>(path: string): Promise<T> => {
  let result: unknown = batch;
  if (path.includes("/preview")) result = { sheets: ["CSV"], selected_sheet: "CSV", header_row: 1, columns,
    required_fields: fields.slice(0,3), alternative_required_fields: [], suggestions: fields.map((target_field, i) => ({ target_field, source_column: columns[i] })), mapping: null };
  if (path.endsWith("/validate")) result = { batch: { ...batch, row_count: 3, accepted_count: 3, rejected_count: 0 }, issue_counts: {}, coverage: {} };
  return result as T;
};
export function SettlementImportPreview() {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  return <section id="settlement-import" className="space-y-4" aria-label="نمونه ورود ریز تسویه">
    <h2 className="text-[22px] font-medium">ورود ریز تسویه</h2>
    <p className="text-sm text-muted-foreground">نمونه نمایشی؛ داده‌ای ثبت نمی‌شود.</p>
    <Button variant="outline" onClick={() => setOpen(true)}>آزمایش تطبیق ستون‌های تسویه</Button>
    {done && <SettlementImportSummaryView counts={{ matched: 1, review: 1, duplicate: 1 }} busy={false} error="" canRetry={false} onRetry={() => {}} />}
    <Drawer open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }} title="بارگذاری ریز تسویه — نمونه">
      {open && <UploadWizard company={{ id: "preview", role: "owner" } as Company} initialBatch={batch} request={previewRequest} onSaving={setBusy} onCancel={() => setOpen(false)} onUpdated={() => {}} onDone={() => { setOpen(false); setDone(true); }} />}
    </Drawer>
  </section>;
}
