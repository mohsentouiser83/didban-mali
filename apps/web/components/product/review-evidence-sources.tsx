"use client";
import { Button } from "@/components/ui/button";
import { DetailField } from "@/components/ui/field-layout";
import { TruncatedText } from "@/components/ui/tooltip";
import { Calendar, Download, FileText, Hash, Landmark, Layers, Wallet } from "@/components/ui/icons";
import { MoneyDisplay, toJalaliDate, toPersianDigits } from "@/components/ui/financial";
import { API_URL } from "@/lib/product-api";
import { toman } from "@/lib/cashflow-amounts";
import type { EvidenceRecord } from "@/lib/review";

/** Presentational record for side-by-side proposal comparisons. */
export function ReviewRecordDetails({ record, companyId, showMissing = false, showSign = false }: {
  record: EvidenceRecord; companyId: string; showMissing?: boolean; showSign?: boolean;
}) {
  const source = record.source;
  return <div className="grid min-w-0 gap-5">
    <dl className="grid min-w-0 auto-rows-[64px] gap-x-5 gap-y-5 sm:grid-cols-2 [&_dd]:h-7 [&_dd]:whitespace-normal">
      <DetailField icon={Wallet} label="مبلغ">{record.amount_irr !== undefined ? <MoneyDisplay amount={toman(record.amount_irr)} currency="تومان" size="sm" direction="neutral" className="max-w-full [&>span:last-child]:truncate" showSign={showSign} /> : "ثبت نشده"}</DetailField>
      {(record.date || showMissing) && <DetailField icon={Calendar} label="تاریخ">{record.date ? toJalaliDate(record.date) : "ثبت نشده"}</DetailField>}
      {(record.account_name || showMissing) && <DetailField icon={Landmark} label="حساب" className="sm:col-span-2"><TruncatedText text={record.account_name || "ثبت نشده"} /></DetailField>}
      {(record.document_number || record.source_entry_id || record.reference || showMissing) && <DetailField icon={Hash} label="سند / مرجع"><TruncatedText text={record.document_number || record.source_entry_id || record.reference || "ثبت نشده"} /></DetailField>}
      {(source || showMissing) && <DetailField icon={Layers} label="محل ثبت"><TruncatedText text={source ? `شیت ${source.sheet_name || "بدون نام"} · ردیف ${toPersianDigits(source.row_number)}` : "ثبت نشده"} /></DetailField>}
      {(record.description || showMissing) && <DetailField icon={FileText} label="شرح ثبت" className="sm:col-span-2"><TruncatedText text={record.description ? toPersianDigits(record.description) : "ثبت نشده"} /></DetailField>}
      {(source || showMissing) && <DetailField icon={FileText} label="فایل منبع" className="sm:col-span-2"><TruncatedText text={source?.source_filename || "ثبت نشده"} /></DetailField>}
    </dl>
    <div className="flex min-h-9 min-w-0 items-start">{source?.source_file_id && <Button variant="outline" size="sm" className="justify-self-start" asChild><a href={`${API_URL}/companies/${companyId}/imports/source-files/${source.source_file_id}/download`}><Download size={16} aria-hidden="true" />دریافت فایل منبع</a></Button>}</div>

  </div>;
}
