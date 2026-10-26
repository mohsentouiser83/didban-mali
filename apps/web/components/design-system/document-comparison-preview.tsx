"use client";
import { useMemo, useState } from "react";
import { MoadianWorkspace } from "@/components/product/moadian-workspace";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/product-api";
import type { Company, ImportBatch } from "@/lib/product-types";
import type { ComparisonItem, ComparisonReport, InvoiceSnapshot } from "@/lib/moadian";

const batches = [
  { id: "internal", source_kind: "sales", original_name: "فاکتورهای حسابداری.xlsx" },
  { id: "portal", source_kind: "moadian_sales", original_name: "کارپوشه مؤدیان.xlsx" },
].map((batch) => ({ ...batch, status: "completed", created_at: "2026-10-18" })) as ImportBatch[];
const invoice: InvoiceSnapshot = { row_id: "row-1", batch_id: "internal", row_number: 4, sheet: "فروش", invoice_no: "1042", tax_id: "A1234567890123456789012", issue_date: "2026-10-01", party_name: "شرکت نمونه", party_id: "12345678901", gross_amount: "125000000", tax_amount: "10000000", subject: "اصلی", reference_tax_id: "", status: "تأییدشده" };
const initialItem: ComparisonItem = { key: "item-1", status: "difference", internal: invoice, portal: { ...invoice, row_id: "row-2", batch_id: "portal", gross_amount: "120000000" }, differences: ["مبلغ کل"], limitations: [], reason: "شماره مالیاتی یکسان؛ مبلغ کل متفاوت است.", decision: "open", note: "" };
function createPreviewRequest(fail: boolean, generation: number) {
    let item = { ...initialItem };
    return (async (path: string, options?: RequestInit) => {
      if (fail) throw new Error("خطای آزمایشی دریافت اطلاعات");
      const query = new URLSearchParams(path.split("?")[1]);
      if (path.includes("/imports?")) return batches.filter((batch) => batch.source_kind === query.get("source_kind"));
      if (options?.method === "PUT") { item = { ...item, ...JSON.parse(String(options.body)) }; return item; }
      if (path.endsWith("/comparisons?limit=25")) return [{ id: `preview-${generation}`, direction: "sales", start_date: "2026-10-01", end_date: "2026-10-18", created_at: "2026-10-18" }];
      const report: ComparisonReport = { direction: "sales", run_id: `preview-${generation}`, internal_batch_id: "internal", portal_batch_id: "portal", internal_batch_ids: ["internal"], portal_batch_ids: ["portal"], start_date: "2026-10-01", end_date: "2026-10-18", counts: { difference: 1 }, total: 1, items: [item], limit: Number(query.get("limit") ?? 25), offset: 0, rejected_rows: 0,
        coverage: { internal: { complete: true, period_confirmed: true, rejected_rows: 0, reasons: [] }, portal: { complete: false, period_confirmed: false, rejected_rows: 0, reasons: ["پوشش کامل بازه تأیید نشده است."] } } };
      if (query.has("status") && query.get("status") !== "difference") { report.items = []; report.total = 0; }
      return report;
    }) as typeof api;

}
export function DocumentComparisonPreview() {
  const [fail, setFail] = useState(false);
  const [revision, setRevision] = useState(0);
  const request = useMemo(() => createPreviewRequest(fail, revision), [fail, revision]);
  return <main dir="rtl" className="mx-auto min-h-screen max-w-7xl space-y-6 bg-background p-4 text-foreground sm:p-8">
    <section className="flex flex-wrap items-center gap-3 border-b border-border pb-4"><h1 className="text-lg font-bold">آزمون تطبیق با داده آزمایشی</h1><Button variant="outline" onClick={() => setFail(!fail)}>{fail ? "رفع خطای آزمایشی" : "نمایش خطای آزمایشی"}</Button><Button variant="ghost" onClick={() => setRevision((v) => v + 1)}>شروع دوباره</Button></section>
    <MoadianWorkspace key={`${fail}:${revision}`} company={{ id: "preview", role: "owner" } as Company} request={request} />
  </main>;
}
