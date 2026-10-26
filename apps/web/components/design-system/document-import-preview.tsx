"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { UploadWizard } from "@/components/product/upload-wizard";
import type { api } from "@/lib/product-api";
import type { Company, ImportBatch } from "@/lib/product-types";
const columns = ["تاریخ", "شماره", "کل فاکتور", "مالیات", "طرف معامله"];
const fields = ["issue_date", "invoice_no", "gross_amount", "tax_amount", "customer_name"];
const batch = { id: "preview", source_kind: "sales", scan_status: "clean", status: "awaiting_mapping", original_name: "فاکتورهای چندردیفی.xlsx", source_label: "آزمایش" } as ImportBatch;
const request: typeof api = async <T,>(path: string): Promise<T> => {
  const params = new URLSearchParams(path.split("?")[1]);
  const result = path.includes("/preview") ? { sheets: ["فروش"], selected_sheet: "فروش", header_row: Number(params.get("header_row") ?? 1), header_rows: Number(params.get("header_rows") ?? 1), columns, required_fields: ["issue_date", "gross_amount"], alternative_required_fields: [["invoice_no"], ["tax_id"]], suggestions: fields.map((target_field, i) => ({ target_field, source_column: columns[i] })), mapping: null }
    : path.endsWith("/validate") ? { batch: { ...batch, row_count: 4, accepted_count: 4, rejected_count: 0 }, issue_counts: {}, coverage: {} } : path.includes("/issues") ? { items: [], total: 0 } : batch;
  return result as T;
};
export function DocumentImportPreview() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return <main dir="rtl" className="min-h-screen space-y-6 bg-background p-6 text-foreground"><h1 className="text-xl font-bold">آزمون ساختار اسناد با داده آزمایشی</h1><Button onClick={() => setOpen(true)}>بررسی ساختار فایل نمونه</Button><Drawer size="wide" open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }} title="ساختار فایل — آزمایشی">{open && <UploadWizard company={{ id: "preview", role: "owner" } as Company} initialBatch={batch} request={request} onSaving={setBusy} onCancel={() => setOpen(false)} onUpdated={() => {}} onDone={() => setOpen(false)} />}</Drawer></main>;
}
