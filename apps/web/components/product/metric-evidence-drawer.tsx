"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { MoneyDisplay, toPersianDigits, toJalaliDate } from "@/components/ui/financial";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/product-api";
import type {
  MetricResultDTO,
  MetricStatus,
  MetricTraceRecord,
  MetricTraceResponse,
} from "@/lib/product-types";
import {
  AlertCircle,
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Database,
  ExternalLink,
  FileSpreadsheet,
  GitBranch,
  HelpCircle,
  Info,
  Layers,
  ShieldCheck,
} from "@/components/ui/icons";
import { RecordLineageDialog } from "./record-lineage-dialog";

export interface MetricEvidenceDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  metric: MetricResultDTO | null;
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
}: MetricEvidenceDrawerProps) {
  const [loadingTrace, setLoadingTrace] = useState(false);
  const [traceData, setTraceData] = useState<MetricTraceResponse | null>(null);
  const [traceError, setTraceError] = useState("");

  // Record lineage modal state for deeper Phase 1 drill-down
  const [selectedRecord, setSelectedRecord] = useState<{
    entityType: string;
    recordId: string;
  } | null>(null);

  useEffect(() => {
    if (!open || !metric) {
      setTraceData(null);
      setTraceError("");
      return;
    }

    let ignore = false;
    setLoadingTrace(true);
    setTraceError("");

    api<MetricTraceResponse>(
      `/companies/${companyId}/calculations/metrics/${metric.metric_key}/trace`,
    )
      .then((res) => {
        if (!ignore) setTraceData(res);
      })
      .catch((err) => {
        if (!ignore) {
          setTraceError(
            err instanceof Error
              ? err.message
              : "خطا در دریافت مسیر داده‌های شاخص",
          );
        }
      })
      .finally(() => {
        if (!ignore) setLoadingTrace(false);
      });

    return () => {
      ignore = true;
    };
  }, [open, companyId, metric]);

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
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="left"
          className="metric-evidence-drawer w-full sm:max-w-xl lg:max-w-2xl overflow-y-auto p-0 border-e border-border bg-background text-foreground"
          dir="rtl"
        >
          {/* Header */}
          <SheetHeader className="p-6 pe-16 border-b border-border bg-card sticky top-0 z-10 text-start">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-semibold border ${st.bg} ${st.text}`}
              >
                <StatusIcon className="size-3.5" />
                <span>{st.label}</span>
              </div>

            </div>

            <SheetTitle className="text-xl font-bold mt-3 text-start">
              {evidence?.title_fa || metric.metric_key}
            </SheetTitle>
            <SheetDescription className="text-start text-sm text-muted-foreground mt-1">
              {evidence?.definition_fa ||
                "مبتنی بر تراکنش‌ها و اسناد استاندارد شده فاز ۱ بنیاد داده."}
            </SheetDescription>
          </SheetHeader>

          <div className="p-6 space-y-6">
            {/* Metric Value & Coverage Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-[var(--ds-card-radius)] border border-border bg-card p-4">
              <div>
                <span className="block text-sm text-muted-foreground mb-1">
                  مقدار محاسبه‌شده:
                </span>
                <span className="text-lg font-bold text-foreground">
                  {formatValue(metric.value_numeric, metric.unit)}
                </span>
              </div>
              <div>
                <span className="block text-sm text-muted-foreground mb-1">
                  پوشش داده‌های ورودی:
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-bold">
                    {toPersianDigits(metric.coverage_score)}٪
                  </span>
                  <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        metric.coverage_score >= 80
                          ? "bg-ds-success"
                          : metric.coverage_score >= 50
                            ? "bg-ds-warning"
                            : "bg-ds-danger"
                      }`}
                      style={{ width: `${metric.coverage_score}%` }}
                    />
                  </div>
                </div>
              </div>
              <div>
                <span className="block text-sm text-muted-foreground mb-1">
                  سطح اطمینان محاسباتی:
                </span>
                <Badge
                  variant="secondary"
                  className="font-medium text-sm text-primary"
                >
                  {metric.confidence === "high"
                    ? "بسیار بالا"
                    : metric.confidence === "medium"
                      ? "متوسط"
                      : metric.confidence === "low"
                        ? "پایین"
                        : "نامشخص"}
                </Badge>
              </div>
            </div>

            {(metric.unit.toLowerCase() === "irr" || metric.unit.toLowerCase() === "toman") && metric.value_numeric != null && (
              <details className="text-sm"><summary className="cursor-pointer min-h-11 content-center">مبلغ دقیق به ریال</summary>
                <MoneyDisplay amount={metric.unit.toLowerCase() === "toman" ? Number(metric.value_numeric) * 10 : metric.value_numeric} currency="ریال" direction="neutral" />
              </details>
            )}
            <p className="text-sm text-muted-foreground">داده تا {toJalaliDate(metric.as_of_date)}</p>
            {/* Formula & Calculation Logic */}
            <div className="rounded-[var(--ds-card-radius)] border border-border bg-card p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Calculator className="size-4 text-primary" />
<span>فرمول و منطق محاسبه:</span><Badge variant="outline"><bdi dir="ltr">{metric.metric_version}</bdi></Badge>
              </div>
              <div className="bg-muted/40 p-3 rounded-[var(--ds-card-radius)] font-mono text-sm text-foreground dir-ltr text-end break-all">
                {evidence?.formula_fa ||
                  "محاسبه قطعی بر اساس داده‌های مالی پذیرفته‌شده"}
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground pt-1">
                <span>تعداد اسناد ورودی: {toPersianDigits(metric.input_record_count)}</span>
                <span>
                  تعداد اسناد مستثنی‌شده: {toPersianDigits(metric.excluded_record_count)}
                </span>
              </div>
            </div>

            {/* Warnings & Notes */}
            {metric.warnings && metric.warnings.length > 0 && (
              <div className="rounded-[var(--ds-card-radius)] border border-ds-warning/30 bg-ds-warning/5 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-ds-warning">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>ملاحظات و هشدارهای کیفی:</span>
                </div>
                <ul className="space-y-1.5 text-sm text-muted-foreground pe-1">
                  {metric.warnings.map((w, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-ds-warning shrink-0 font-bold">
                        •
                      </span>
                      <span>{toPersianDigits(w)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {metric.warnings?.length > 0 && <Button asChild variant="outline"><Link href={`/companies/${companyId}/data`}>بررسی و تکمیل داده‌های ورودی</Link></Button>}
            {/* Reconciliation Notes */}
            {evidence?.reconciliation_notes &&
              evidence.reconciliation_notes.length > 0 && (
                <div className="rounded-[var(--ds-card-radius)] border border-border bg-card p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    <ShieldCheck className="size-4 text-ds-success" />
                    <span>تراز و انطباق‌های ریاضی:</span>
                  </div>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {evidence.reconciliation_notes.map((note, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="text-ds-success font-bold">✓</span>
                        <span>{toPersianDigits(note)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            {/* Data Lineage & Trace to Phase 1 Canonical Records */}
            <div className="rounded-[var(--ds-card-radius)] border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <GitBranch className="size-4 text-primary" />
                  <span>رکوردهای منبع:</span>
                </div>
                {traceData && (
                  <span className="text-sm text-muted-foreground">
                    {toPersianDigits(traceData.total_records)} رکورد منبع
                  </span>
                )}
              </div>

              {loadingTrace && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  در حال بارگذاری ردگیری داده‌ها…
                </div>
              )}

              {traceError && (
                <div className="py-3 text-center text-sm text-destructive">
                  {traceError}
                </div>
              )}

              {traceData && traceData.sample_records.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto pe-1">
                  {traceData.sample_records.map((rec: MetricTraceRecord) => (
                    <div
                      key={rec.record_id}
                      className="p-3 rounded-[var(--ds-card-radius)] border border-border/70 bg-muted/20 flex items-center justify-between gap-3 text-sm"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground truncate">
                            {rec.description || rec.entity_type}
                          </span>
                          {rec.source_file_name && (
                            <Badge
                              variant="secondary"
                              className="text-xs flex items-center gap-1 font-mono"
                            >
                              <FileSpreadsheet className="size-3" />
                              {rec.source_file_name}
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-3">
                          <span>تاریخ: {toJalaliDate(rec.date)}</span>
                          {rec.source_row_number && (
                            <span>سطر: {rec.source_row_number}</span>
                          )}
                          {rec.amount_irr !== null && (
                            <span className="font-mono">
                              مبلغ:{" "}
                              {(rec.amount_irr / 10).toLocaleString("fa-IR")}{" "}
                              تومان
                            </span>
                          )}
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1 text-sm shrink-0"
                        onClick={() =>
                          setSelectedRecord({
                            entityType: rec.entity_type,
                            recordId: rec.record_id,
                          })
                        }
                      >
                        <ExternalLink className="size-3" />
                        <span>ردگیری فایل</span>
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {traceData && traceData.sample_records.length === 0 && (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  رکوردی در تاریخ مبنا ثبت نشده است.
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

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
