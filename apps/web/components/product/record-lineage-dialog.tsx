"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DetailGroup, DetailField, DetailSection, fieldIcon } from "@/components/ui/field-layout";
import { LoadingState, ErrorState, EmptyState, toPersianDigits } from "@/components/ui/financial";
import type { api } from "@/lib/product-api";
import { useRecordLineage } from "./use-record-lineage";

interface RecordLineageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  entityType: string;
  recordId: string | null;
  request?: typeof api;
}

export function RecordLineageDialog({ open, onOpenChange, companyId, entityType, recordId, request }: RecordLineageDialogProps) {
  const { loading, error, data, rawFields, normalizedFields, retry } = useRecordLineage(open, companyId, entityType, recordId, request);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-3xl" dir="rtl">
      <DialogHeader><DialogTitle>ردگیری منشأ داده</DialogTitle><DialogDescription className="sr-only">فایل اصلی، ردیف منبع و مقادیر رکورد</DialogDescription></DialogHeader>
      {loading ? <LoadingState label="در حال دریافت منشأ داده…" className="gap-7">{[0, 1, 2].map(section => <div key={section} aria-hidden="true" className="grid gap-4"><Skeleton className="h-6 w-36" /><div className="grid auto-rows-[64px] grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">{Array.from({ length: section === 0 ? 5 : 4 }, (_, field) => <Skeleton key={field} className="h-16 w-full" />)}</div></div>)}</LoadingState> : error ? <ErrorState variant="compact" error={error} onRetry={retry} /> : data ? <div className="grid min-w-0 gap-7">
        <DetailSection title="فایل و ردیف منبع">
          <DetailGroup>
            <DetailField icon={fieldIcon("فایل منبع")} label="فایل منبع">{data.source_filename}</DetailField>
            <DetailField icon={fieldIcon("ردیف منبع")} label="ردیف منبع">{toPersianDigits(data.source_row_number)}</DetailField>
            <DetailField icon={fieldIcon("شیت")} label="شیت">{data.sheet_name || "پیش‌فرض"}</DetailField>
            <DetailField icon={fieldIcon("نسخه نگاشت")} label="نسخه نگاشت">{toPersianDigits(data.mapping_version)}</DetailField>
            <DetailField icon={fieldIcon("هش فایل")} label="هش فایل"><bdi dir="ltr">{data.source_file_sha256}</bdi></DetailField>
          </DetailGroup>
        </DetailSection>
        <DetailSection title="مقادیر فایل منبع">
          {rawFields.length ? <DetailGroup>{rawFields.map(field => <DetailField key={field.label} icon={fieldIcon(field.label)} label={field.label}>{field.value}</DetailField>)}</DetailGroup> : <EmptyState variant="inline">مقداری در فایل منبع ثبت نشده است.</EmptyState>}
        </DetailSection>
        <DetailSection title="مقادیر ثبت‌شده">
          {normalizedFields.length ? <DetailGroup>{normalizedFields.map(field => <DetailField key={field.label} icon={fieldIcon(field.label)} label={field.label}>{field.value}</DetailField>)}</DetailGroup> : <EmptyState variant="inline">مقدار ثبت‌شده در دسترس نیست.</EmptyState>}
        </DetailSection>
      </div> : <EmptyState variant="inline">رکوردی انتخاب نشده است.</EmptyState>}
    </DialogContent>
  </Dialog>;
}
