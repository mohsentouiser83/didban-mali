"use client";
import { DetailSection, DetailGroup, DetailField, fieldIcon } from "@/components/ui/field-layout";
import { LoadingState, ErrorState, EmptyState, MoneyDisplay, toPersianDigits, toJalaliDate } from "@/components/ui/financial";

import React, { useState } from "react";
import Link from "next/link";
import { Drawer } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/product-api";
import type { MetricResultDTO, MetricStatus } from "@/lib/product-types";
import { AlertTriangle, CheckCircle2, HelpCircle, Info } from "@/components/ui/icons";
import { useMetricTrace } from "./use-metric-trace";
import { MetricTraceRecordView } from "./metric-trace-record";
import { RecordLineageDialog } from "./record-lineage-dialog";

export interface MetricEvidenceDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  metric: MetricResultDTO | null;
  request?: typeof api;
}

const STATUS_CONFIG: Record<
  MetricStatus,
  { label: string; bg: string; text: string; icon: React.ElementType }
> = {
  available: {
    label: "قطعی و قابل اتکا",
    bg: "bg-ds-success/10 border-ds-success/30",
    text: "text-ds-success",
    icon: CheckCircle2,
  },
  available_with_warning: {
    label: "دارای ملاحظات داده‌ای",
    bg: "bg-ds-warning/10 border-ds-warning/30",
    text: "text-ds-warning",
    icon: AlertTriangle,
  },
  approximate: {
    label: "تقریبی بر مبنای مدل",
    bg: "bg-primary/10 border-primary/30",
    text: "text-primary",
    icon: Info,
  },
  insufficient_data: {
    label: "عدم تکافوی داده اولیه",
    bg: "bg-primary/10 border-primary/30",
    text: "text-primary",
    icon: HelpCircle,
  },
  not_applicable: {
    label: "غیرقابل‌اعمال بر اساس منطق مالی",
    bg: "bg-muted/30 border-muted-foreground/30",
    text: "text-muted-foreground",
    icon: Info,
  },
};

export function MetricEvidenceDrawer({
  open,
  onOpenChange,
  companyId,
  metric,
  request = api,
}: MetricEvidenceDrawerProps) {
  const { data: traceData, loading: loadingTrace, error: traceError, retry: retryTrace } = useMetricTrace(companyId, metric?.metric_key, open, request);

  // Record lineage modal state for deeper Phase 1 drill-down
  const [selectedRecord, setSelectedRecord] = useState<{
    entityType: string;
    recordId: string;
  } | null>(null);

  if (!metric) return null;

  const st = STATUS_CONFIG[metric.status] || STATUS_CONFIG.available;
  const StatusIcon = st.icon;
  const evidence = metric.evidence;

  const formatValue = (val: number | string | null, unit: string) => {
    if (val == null || !Number.isFinite(Number(val))) return "—";
    const normalizedUnit = unit.toLowerCase();
    if (normalizedUnit === "irr" || normalizedUnit === "toman") {
      return <MoneyDisplay amount={val} currency={normalizedUnit === "irr" ? "ریال" : "تومان"} executive direction="neutral" />;
    }
    const value = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(Number(val));
    const suffix = normalizedUnit === "day" ? "روز" : normalizedUnit === "month" ? "ماه" : normalizedUnit === "percent" ? "٪" : "";
    return <span><bdi dir="ltr">{value}</bdi> {suffix}</span>;
  };

  return (
    <>
      <Drawer size="wide" open={open} onOpenChange={onOpenChange} title={evidence?.title_fa || metric.metric_key} description={evidence?.definition_fa || "شواهد و محاسبات شاخص مالی"}>
        <div className="flex items-center gap-2 text-sm">
          <StatusIcon className={`size-4 ${st.text}`} /><span className={st.text}>{st.label}</span>
        </div>
            {/* Metric Value & Coverage Summary */}
        <DetailGroup>
          <DetailField icon={fieldIcon("مقدار محاسبه‌شده")} label="مقدار محاسبه‌شده">{formatValue(metric.value_numeric, metric.unit)}</DetailField>
          <DetailField icon={fieldIcon("پوشش داده‌های ورودی")} label="پوشش داده‌های ورودی">{toPersianDigits(metric.coverage_score)}٪</DetailField>
          <DetailField icon={fieldIcon("سطح اطمینان محاسباتی")} label="سطح اطمینان محاسباتی">{metric.confidence === "high" ? "بسیار بالا" : metric.confidence === "medium" ? "متوسط" : metric.confidence === "low" ? "پایین" : "نامشخص"}</DetailField>
        </DetailGroup>

            {(metric.unit.toLowerCase() === "irr" || metric.unit.toLowerCase() === "toman") && metric.value_numeric != null && (
              <DetailGroup><DetailField icon={fieldIcon("مبلغ دقیق")} label="مبلغ دقیق">
                <MoneyDisplay amount={metric.value_numeric} currency={metric.unit.toLowerCase() === "toman" ? "تومان" : "ریال"} direction="neutral" />
              </DetailField></DetailGroup>
            )}
            <DetailGroup><DetailField icon={fieldIcon("تاریخ مبنا")} label="تاریخ مبنا">{toJalaliDate(metric.as_of_date)}</DetailField></DetailGroup>
            {/* Formula & Calculation Logic */}
            <DetailSection title="فرمول و منطق محاسبه">
              <Badge variant="outline" className="self-start"><bdi dir="ltr">{metric.metric_version}</bdi></Badge>
              <DetailGroup>
                <DetailField icon={fieldIcon("فرمول محاسبه")} label="فرمول محاسبه" className="sm:col-span-2">{evidence?.formula_fa || "محاسبه قطعی بر اساس داده‌های مالی پذیرفته‌شده"}</DetailField>
                <DetailField icon={fieldIcon("تعداد اسناد ورودی")} label="تعداد اسناد ورودی">{toPersianDigits(metric.input_record_count)}</DetailField>
                <DetailField icon={fieldIcon("تعداد اسناد مستثنی‌شده")} label="تعداد اسناد مستثنی‌شده">{toPersianDigits(metric.excluded_record_count)}</DetailField>
              </DetailGroup>
            </DetailSection>

            {/* Warnings & Notes */}
            {metric.warnings && metric.warnings.length > 0 && (
              <DetailSection title="ملاحظات و هشدارهای کیفی">
                <ul className="space-y-1.5 text-sm text-muted-foreground pe-1">
                  {metric.warnings.map((w, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <AlertTriangle size={17} aria-hidden="true" className="mt-1 shrink-0 text-ds-warning" />
                      <span>{toPersianDigits(w)}</span>
                    </li>
                  ))}
                </ul>
              </DetailSection>
            )}

            {metric.warnings?.length > 0 && <Button asChild variant="outline"><Link href={`/companies/${companyId}/data/connections`}>بررسی و تکمیل داده‌های ورودی</Link></Button>}
            {/* Reconciliation Notes */}
            {evidence?.reconciliation_notes &&
              evidence.reconciliation_notes.length > 0 && (
                <DetailSection title="تراز و انطباق‌های ریاضی">
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {evidence.reconciliation_notes.map((note, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <CheckCircle2 size={17} aria-hidden="true" className="mt-1 shrink-0 text-ds-success" />
                        <span>{toPersianDigits(note)}</span>
                      </li>
                    ))}
                  </ul>
                </DetailSection>
              )}

            {/* Data Lineage & Trace to Phase 1 Canonical Records */}
            <DetailSection title="رکوردهای منبع">
              <div className="flex items-center justify-between">
                {traceData && (
                  <span className="text-sm text-muted-foreground">
                    {toPersianDigits(traceData.total_records)} رکورد منبع
                  </span>
                )}
              </div>

              {loadingTrace && (
                <LoadingState variant="inline">
                  در حال بارگذاری ردگیری داده‌ها…
                </LoadingState>
              )}

              {traceError && (
                <ErrorState variant="compact" onRetry={retryTrace}>{traceError}</ErrorState>
              )}

              {traceData && traceData.sample_records.length > 0 && (
                <div className="grid min-w-0 gap-5">
                  {traceData.sample_records.map((record) => <MetricTraceRecordView key={record.record_id} record={record} onTrace={() => setSelectedRecord({ entityType: record.entity_type, recordId: record.record_id })} />)}
                </div>
              )}

              {traceData && traceData.sample_records.length === 0 && (
                <EmptyState variant="compact">رکوردی در تاریخ مبنا ثبت نشده است.</EmptyState>
              )}
            </DetailSection>
      </Drawer>

      {/* Phase 1 Raw File Lineage Dialog */}
      <RecordLineageDialog
        open={!!selectedRecord}
        onOpenChange={(op) => !op && setSelectedRecord(null)}
        companyId={companyId}
        entityType={selectedRecord?.entityType || ""}
        recordId={selectedRecord?.recordId || null}
      />
    </>
  );
}
