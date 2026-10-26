"use client";
import { DetailGroup, DetailField, ControlLabel, fieldIcon } from "@/components/ui/field-layout";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerFooter, DrawerForm } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MoneyDisplay } from "@/components/ui/financial";
import { FinancialAssistant, type AssistantAnswer } from "@/components/product/financial-assistant";
import { EvidenceDrawer, type FindingEvidenceDetail } from "@/components/ui/financial/evidence-drawer";
import { MetricEvidenceDrawer } from "@/components/product/metric-evidence-drawer";
import { MoadianComparisonDetails } from "@/components/product/moadian-comparison-results";
import type { api } from "@/lib/product-api";
import type { MetricResultDTO, MetricTraceResponse } from "@/lib/product-types";
import type { ComparisonItem, InvoiceSnapshot } from "@/lib/moadian";

const longText = "شرح آزمایشی پرداخت خدمات پشتیبانی و نگهداری تجهیزات برای دوره مالی شرکت نمونه با شماره پیگیری و توضیحات تکمیلی";
const metric: MetricResultDTO = {
  metric_key: "preview_payables", metric_version: "preview-v1", status: "available_with_warning",
  value_numeric: 17297400000, unit: "irr", as_of_date: "2026-10-07", coverage_score: 80,
  confidence: "high", input_record_count: 120, excluded_record_count: 0,
  warnings: ["سررسید ۱۲ سند ثبت نشده؛ برآورد تأخیر کامل نیست."],
  evidence: { title_fa: "بدهی‌های باز — نمونه", definition_fa: "نمونه نمایشی", formula_fa: "مجموع مانده‌های پرداختنی", formula_version: "1", components: {}, reconciliation_notes: ["جمع مانده‌ها با دفاتر تطبیق دارد."] },
};
const trace: MetricTraceResponse = {
  metric_key: metric.metric_key, metric_version: "preview-v1", calculation_run_id: "preview",
  total_records: 1, excluded_records: 0, sample_records: [{ record_id: "preview", entity_type: "ledger", description: longText, amount_irr: 12000000, date: "2026-10-07", source_file_name: "فایل آزمایشی دفتر حسابداری با عنوان طولانی برای بررسی نمایش کامل.xlsx", source_row_number: 0 }],
};
const invoice: InvoiceSnapshot = { row_id: "preview", batch_id: "preview", row_number: 12, sheet: "فروش", invoice_no: "INV-1405-120000000000000000001", tax_id: "A0000000000000000000000000000000001", issue_date: "2026-10-07", party_name: "شرکت نمونه خدمات فنی و مهندسی با نام طولانی برای بررسی هم‌ترازی", party_id: "14000000000", gross_amount: "90071992547409931", tax_amount: "0", subject: "فروش خدمات پشتیبانی", reference_tax_id: "", status: "تأییدشده" };
const comparison: ComparisonItem = { status: "difference", internal: invoice, portal: { ...invoice, row_number: 4, party_name: "شرکت نمونه", tax_amount: "1000" }, differences: ["مالیات"], limitations: [], reason: "مالیات دو فایل برابر نیست." };
const assistantAnswer: AssistantAnswer = {
  request_id: "preview", mode: "rules", status: "answered", answer_fa: "پاسخ آزمایشی برای بررسی نمایش فیلدها.",
  as_of_date: "2026-10-10", latest_invoice_date: "2026-10-01", latest_imported_at: null,
  total_outstanding_irr: "90071992547409931", total_overdue_irr: "0", customer_count: 1,
  caveats_fa: ["سررسید این فاکتور ثبت نشده؛ تأخیر آن قابل محاسبه نیست."],
  priorities: [{ customer_id: "preview", customer_name: "مشتری آزمایشی با نام طولانی برای بررسی نمایش کامل", overdue_amount_irr: "0", max_delay_days: 0, overdue_invoice_count: 0, omitted_evidence_count: 0,
    evidence: [{ invoice_id: "preview", invoice_no: "INV-000000000000000000000000001", remaining_amount_irr: "90071992547409931", due_date: null, delay_days: 0, import_batch_id: "preview", filename: "فایل آزمایشی فروش با نام بسیار طولانی برای بررسی tooltip و هم‌ارتفاعی فیلدها.xlsx", sheet: "فروش", row_number: 0 }],
  }],
};
const assistantRequest: typeof api = async <T,>(): Promise<T> => assistantAnswer as T;
const factor = { score: 75, weight: 25, reason: longText };
const finding: FindingEvidenceDetail = { id: "preview", title: "شواهد یافته — نمونه", riskLevel: "high", status: "follow_up", priorityScore: 75, amount: "90071992547409931", ratioToRevenue: 0, factors: { impact: factor, materiality: factor, confidence: factor, urgency: factor }, ruleCode: "PREVIEW", ruleDescription: "دادهٔ ساختگی", evidenceItems: [{ id: "preview", sourceType: "bank", title: "فایل نمونه", description: longText, fileName: "sample.xlsx", sheetName: "بانک", rowNumber: 0 }] };
type Preview = "evidence" | "assistant" | "fields" | "metric" | "trace_error" | "trace_loading" | "comparison" | null;

function traceTransport(preview: Preview): typeof api {
  let failed = false;
  return async <T,>(): Promise<T> => {
    if (preview === "trace_loading") return new Promise<T>(() => {});
    if (preview === "trace_error" && !failed) { failed = true; throw Error("رکوردهای منبع دریافت نشدند."); }
    return trace as T;
  };
}

export function DrawerPatternsPreview() {
  const [preview, setPreview] = useState<Preview>(null);
  const request = useMemo(() => traceTransport(preview), [preview]);
  const close = () => setPreview(null);
  return <section aria-label="نمونه الگوی drawerها" className="grid gap-4">
    <h2 className="text-[22px] font-medium">الگوی drawerها</h2>
    <p className="text-sm text-muted-foreground">داده‌ها ساختگی‌اند؛ این نمونه‌ها چیزی ارسال یا ثبت نمی‌کنند.</p>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => setPreview("assistant")}>آزمایش دستیار مالی</Button>
      <Button variant="outline" onClick={() => setPreview("evidence")}>آزمایش شواهد یافته</Button>
      <Button variant="outline" onClick={() => setPreview("fields")}>آزمایش فیلدها و فرم drawer</Button>
      <Button variant="outline" onClick={() => setPreview("comparison")}>آزمایش جزئیات تطبیق مؤدیان</Button>
      <Button variant="outline" onClick={() => setPreview("metric")}>آزمایش شواهد شاخص</Button>
      <Button variant="outline" onClick={() => setPreview("trace_error")}>آزمایش خطای شواهد شاخص</Button>
      <Button variant="outline" onClick={() => setPreview("trace_loading")}>آزمایش بارگذاری شواهد شاخص</Button>
    </div>
    <Drawer size="wide" open={preview === "fields"} onOpenChange={value => { if (!value) close(); }} title="جزئیات و فرم — نمونه">
      <DetailGroup>
        <DetailField icon={fieldIcon("شرح")} label="شرح">{longText}</DetailField>
        <DetailField icon={fieldIcon("مانده")} label="مانده"><MoneyDisplay amount="90071992547409931" currency="ریال" size="sm" direction="neutral" /></DetailField>
        <DetailField icon={fieldIcon("مبلغ وصول")} label="مبلغ وصول"><MoneyDisplay amount="0" currency="ریال" size="sm" direction="neutral" /></DetailField>
        <DetailField icon={fieldIcon("سررسید")} label="سررسید">ثبت نشده</DetailField>
      </DetailGroup>
      <DrawerForm onSubmit={event => event.preventDefault()}>
        <div><ControlLabel htmlFor="drawer-preview-name" icon={fieldIcon("عنوان")}>عنوان</ControlLabel><Input id="drawer-preview-name" required /></div>
        <div><ControlLabel htmlFor="drawer-preview-note" icon={fieldIcon("یادداشت")}>یادداشت</ControlLabel><Textarea id="drawer-preview-note" rows={3} /></div>
        <DrawerFooter><Button type="button" variant="outline" onClick={close}>بستن نمونه</Button><Button type="submit">بررسی فرم نمونه</Button></DrawerFooter>
      </DrawerForm>
    </Drawer>
    {preview === "assistant" && <FinancialAssistant companyId="preview" companyName="شرکت آزمایشی" request={assistantRequest} />}
    <EvidenceDrawer open={preview === "evidence"} onOpenChange={value => { if (!value) close(); }} finding={finding} onAction={() => {}} />
    <MoadianComparisonDetails item={preview === "comparison" ? comparison : null} batches={[]} onClose={close} />
    <MetricEvidenceDrawer companyId="preview" open={preview === "metric" || preview === "trace_error" || preview === "trace_loading"} onOpenChange={value => { if (!value) close(); }} metric={metric} request={request} />
  </section>;
}
