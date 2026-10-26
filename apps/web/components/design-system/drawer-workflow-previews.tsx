"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { ReceiptHistoryEditor } from "@/components/product/receipt-history-editor";
import { ConnectionDetail } from "@/components/product/integrations-workspace";
import { CounterpartyDrawerPreviews } from "./counterparty-drawer-previews";
import { SettlementDrawerPreview } from "./settlement-drawer-preview";
import { ReportForm } from "@/components/product/reports-workspace";
import type { api } from "@/lib/product-api";
import type { IntegrationConnection, IntegrationSyncJob } from "@/lib/product-types";
import type { InvoiceHistory } from "@/lib/financial-periods";

const history: InvoiceHistory = { invoice_id: "preview", invoice_no: "INV-PREVIEW-1405-00001", customer_name: "شرکت نمونه خدمات فنی و مهندسی با نام طولانی برای بررسی نمایش متن", issue_date: "2026-09-01", gross_amount_irr: "90071992547409931", paid_amount_irr: "12000000", complete: false, version: 1, receipts: [{ id: "preview", received_on: "2026-10-07", amount_irr: "12000000", reference: "PREVIEW-REF-12000000000000000001" }] };
const connection: IntegrationConnection = { id: "preview", company_id: "preview", name: "اتصال نمونه حسابداری", provider: "sepidar", status: "connected", config: {}, last_sync_at: "2026-10-07T12:00:00Z", next_sync_at: null, last_error_message: null, last_sync_record_count: 120, sync_interval_minutes: 30, created_at: "2026-10-07", updated_at: "2026-10-07" };
const jobs: IntegrationSyncJob[] = [{ id: "preview", company_id: "preview", connection_id: "preview", sync_type: "manual", status: "completed", started_at: "2026-10-07T12:00:00Z", completed_at: "2026-10-07T12:01:00Z", records_received: 120, records_imported: 120, records_rejected: 0, watermark_cursor: null, summary: {}, error_message: null, created_at: "2026-10-07" }];
// These transports never access the network or create business data.
const receiptRequest: typeof api = async <T,>(_path: string, options?: RequestInit): Promise<T> => {
  if (options?.method) throw Error("این نمونه ذخیره نمی‌شود.");
  return [history] as T;
};
const connectionRequest: typeof api = async <T,>(): Promise<T> => jobs as T;
const reportRequest: typeof api = async <T,>(_path: string, options?: RequestInit): Promise<T> => {
  if (options?.method) throw Error("این نمونه ذخیره نمی‌شود.");
  return [{ id: "preview", period_start: "2026-09-01", period_end: "2026-10-07", status: "completed_limited" }] as T;
};
const noop = () => {};
const reload = async () => {};

export function DrawerWorkflowPreviews() {
  const [mode, setMode] = useState<"connection" | "report" | null>(null);
  return <section aria-label="نمونه گردش کار drawerها" className="grid gap-4">
    <h2 className="text-[22px] font-medium">گردش کار drawerها</h2>
    <p className="text-sm text-muted-foreground">نمونه‌های پرشده با داده ساختگی؛ ذخیره و ارسال انجام نمی‌شود.</p>
    <div className="flex flex-wrap gap-2">
      <SettlementDrawerPreview />
      <ReceiptHistoryEditor companyId="preview" canWrite onChanged={noop} request={receiptRequest} />
      <Button variant="outline" onClick={() => setMode("connection")}>آزمایش جزئیات اتصال</Button>
      <Button variant="outline" onClick={() => setMode("report")}>آزمایش فرم گزارش پرشده</Button>
    </div>
    <CounterpartyDrawerPreviews />
    {mode === "connection" && <ConnectionDetail companyId="preview" connection={connection} manage={false} onClose={() => setMode(null)} onReload={reload} request={connectionRequest} />}
    <Drawer size="wide" open={mode === "report"} onOpenChange={open => { if (!open) setMode(null); }} title="گزارش جدید — نمونه">
      {mode === "report" && <ReportForm companyId="preview" onSaving={noop} onCancel={() => setMode(null)} onCreated={noop} request={reportRequest} />}
    </Drawer>
  </section>;
}
