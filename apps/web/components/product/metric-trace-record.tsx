import { DetailGroup, DetailField, fieldIcon } from "@/components/ui/field-layout";
import { Button } from "@/components/ui/button";

import { ExternalLink } from "@/components/ui/icons";
import { MoneyDisplay, toJalaliDate, toPersianDigits } from "@/components/ui/financial";
import type { MetricTraceRecord } from "@/lib/product-types";

export function MetricTraceRecordView({ record, onTrace }: { record: MetricTraceRecord; onTrace: () => void }) {
  return <article className="grid min-w-0 gap-4 border-b border-border/70 pb-5 last:border-0 last:pb-0">
    <DetailGroup>
      <DetailField icon={fieldIcon("شرح ثبت")} label="شرح ثبت">{record.description || record.entity_type}</DetailField>
      <DetailField icon={fieldIcon("تاریخ")} label="تاریخ">{toJalaliDate(record.date)}</DetailField>
      <DetailField icon={fieldIcon("فایل منبع")} label="فایل منبع">{record.source_file_name || "ثبت نشده"}</DetailField>
      <DetailField icon={fieldIcon("ردیف منبع")} label="ردیف منبع">{record.source_row_number == null ? "ثبت نشده" : toPersianDigits(record.source_row_number)}</DetailField>
      <DetailField icon={fieldIcon("مبلغ")} label="مبلغ">{record.amount_irr === null ? "ثبت نشده" : <MoneyDisplay amount={record.amount_irr} currency="ریال" size="sm" direction="neutral" />}</DetailField>
    </DetailGroup>
    <Button size="sm" variant="outline" className="justify-self-start" onClick={onTrace}><ExternalLink aria-hidden="true" />ردگیری فایل</Button>
  </article>;
}
