"use client";

import React, { useEffect, useState } from "react";
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
} from "lucide-react";
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
    bg: "bg-emerald-500/10 border-emerald-500/30",
    text: "text-emerald-500",
    icon: CheckCircle2,
  },
  available_with_warning: {
    label: "دارای ملاحظات داده‌ای",
    bg: "bg-amber-500/10 border-amber-500/30",
    text: "text-amber-500",
    icon: AlertTriangle,
  },
  approximate: {
    label: "تقریبی بر مبنای مدل",
    bg: "bg-blue-500/10 border-blue-500/30",
    text: "text-blue-500",
    icon: Info,
  },
  insufficient_data: {
    label: "عدم تکافوی داده اولیه",
    bg: "bg-purple-500/10 border-purple-500/30",
    text: "text-purple-400",
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
      `/companies/${companyId}/calculations/metrics/${metric.metric_key}/trace`
    )
      .then((res) => {
        if (!ignore) setTraceData(res);
      })
      .catch((err) => {
        if (!ignore) {
          setTraceError(
            err instanceof Error ? err.message : "خطا در دریافت مسیر داده‌های شاخص"
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

  const formatValue = (val: number | null, unit: string) => {
    if (val === null || val === undefined) return "—";
    if (unit === "irr") {
      const toman = val / 10;
      return `${toman.toLocaleString("fa-IR")} تومان`;
    }
    if (unit === "day") return `${val.toLocaleString("fa-IR")} روز`;
    if (unit === "month") return `${val.toLocaleString("fa-IR")} ماه`;
    if (unit === "percent" || unit === "ratio") return `${val.toLocaleString("fa-IR")}٪`;
    return val.toLocaleString("fa-IR");
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="left"
          className="w-full sm:max-w-xl lg:max-w-2xl overflow-y-auto p-0 border-e border-border bg-background text-foreground"
          dir="rtl"
        >
          {/* Header */}
          <SheetHeader className="p-6 border-b border-border bg-card sticky top-0 z-10 text-start">
            <div className="flex items-center justify-between gap-3">
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${st.bg} ${st.text}`}
              >
                <StatusIcon className="size-3.5" />
                <span>{st.label}</span>
              </div>
              <Badge variant="outline" className="font-mono text-xs">
                نسخه فرمول: {metric.metric_version}
              </Badge>
            </div>

            <SheetTitle className="text-xl font-bold mt-3 text-start">
              {evidence?.title_fa || metric.metric_key}
            </SheetTitle>
            <SheetDescription className="text-start text-xs text-muted-foreground mt-1">
              {evidence?.definition_fa ||
                "مبتنی بر تراکنش‌ها و اسناد استاندارد شده فاز ۱ بنیاد داده."}
            </SheetDescription>
          </SheetHeader>

          <div className="p-6 space-y-6">
            {/* Metric Value & Coverage Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-2xl border border-border bg-card p-4">
              <div>
                <span className="block text-xs text-muted-foreground mb-1">
                  مقدار محاسبه‌شده:
                </span>
                <span className="text-lg font-bold text-foreground">
                  {formatValue(metric.value_numeric, metric.unit)}
                </span>
              </div>
              <div>
                <span className="block text-xs text-muted-foreground mb-1">
                  پوشش داده‌های ورودی:
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-bold">
                    {metric.coverage_score}٪
                  </span>
                  <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        metric.coverage_score >= 80
                          ? "bg-emerald-500"
                          : metric.coverage_score >= 50
                          ? "bg-amber-500"
                          : "bg-rose-500"
                      }`}
                      style={{ width: `${metric.coverage_score}%` }}
                    />
                  </div>
                </div>
              </div>
              <div>
                <span className="block text-xs text-muted-foreground mb-1">
                  سطح اطمینان محاسباتی:
                </span>
                <Badge
                  variant="secondary"
                  className="font-medium text-xs text-primary"
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

            {/* Formula & Calculation Logic */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Calculator className="size-4 text-primary" />
                <span>فرمول و منطق محاسبه:</span>
              </div>
              <div className="bg-muted/40 p-3 rounded-xl font-mono text-xs text-foreground dir-ltr text-end break-all">
                {evidence?.formula_fa || "محاسبه قطعی بر اساس داده‌های مالی پذیرفته‌شده"}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                <span>تعداد اسناد ورودی: {metric.input_record_count}</span>
                <span>تعداد اسناد مستثنی‌شده: {metric.excluded_record_count}</span>
              </div>
            </div>

            {/* Warnings & Notes */}
            {metric.warnings && metric.warnings.length > 0 && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-500">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>ملاحظات و هشدارهای کیفی:</span>
                </div>
                <ul className="space-y-1.5 text-xs text-muted-foreground pe-1">
                  {metric.warnings.map((w, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-amber-500 shrink-0 font-bold">•</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Reconciliation Notes */}
            {evidence?.reconciliation_notes &&
              evidence.reconciliation_notes.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <ShieldCheck className="size-4 text-emerald-500" />
                    <span>تراز و انطباق‌های ریاضی:</span>
                  </div>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {evidence.reconciliation_notes.map((note, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="text-emerald-500 font-bold">✓</span>
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            {/* Data Lineage & Trace to Phase 1 Canonical Records */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <GitBranch className="size-4 text-primary" />
                  <span>ردگیری رکوردهای منبع (فاز ۱):</span>
                </div>
                {traceData && (
                  <span className="text-xs text-muted-foreground">
                    {traceData.total_records} رکورد منبع
                  </span>
                )}
              </div>

              {loadingTrace && (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  در حال بارگذاری ردگیری داده‌ها...
                </div>
              )}

              {traceError && (
                <div className="py-3 text-center text-xs text-destructive">
                  {traceError}
                </div>
              )}

              {traceData && traceData.sample_records.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto pe-1">
                  {traceData.sample_records.map((rec: MetricTraceRecord) => (
                    <div
                      key={rec.record_id}
                      className="p-3 rounded-xl border border-border/70 bg-muted/20 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground truncate">
                            {rec.description || rec.entity_type}
                          </span>
                          {rec.source_file_name && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] flex items-center gap-1 font-mono"
                            >
                              <FileSpreadsheet className="size-3" />
                              {rec.source_file_name}
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-3">
                          <span>تاریخ: {rec.date}</span>
                          {rec.source_row_number && (
                            <span>سطر: {rec.source_row_number}</span>
                          )}
                          {rec.amount_irr !== null && (
                            <span className="font-mono">
                              مبلغ: {(rec.amount_irr / 10).toLocaleString("fa-IR")} تومان
                            </span>
                          )}
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1 text-[11px] text-primary shrink-0"
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
                <div className="py-4 text-center text-xs text-muted-foreground">
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
