"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductCard } from "./product-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/product-api";
import type { Company, DataQualityResponse, QuarantinedRowItem } from "@/lib/product-types";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileX2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  HelpCircle,
  Eye,
} from "lucide-react";
import { RecordLineageDialog } from "./record-lineage-dialog";

interface DataQualityTabProps {
  company: Company;
}

export function DataQualityTab({ company }: DataQualityTabProps) {
  const [data, setData] = useState<DataQualityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedRow, setSelectedRow] = useState<QuarantinedRowItem | null>(null);
  const [lineageRecord, setLineageRecord] = useState<{ type: string; id: string } | null>(null);

  const loadQuality = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api<DataQualityResponse>(`/companies/${company.id}/data/quality`);
      setData(res);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "خطا در دریافت گزارش کیفیت داده‌ها."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadQuality();
  }, [company.id]);

  if (loading && !data) {
    return (
      <div className="py-20 flex flex-col items-center justify-center space-y-3 text-center">
        <div className="size-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-xs text-muted-foreground">در حال تحلیل سلامت و خطاهای داده…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 rounded-2xl border border-destructive/20 bg-destructive/5 text-xs text-destructive text-center space-y-3">
        <p>{error || "گزارش کیفیت در دسترس نیست."}</p>
        <Button variant="outline" size="sm" onClick={loadQuality} className="text-xs">
          تلاش مجدد
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-foreground">مرکز پایش کیفیت و قرنطینه داده‌ها</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            تفکیک سطرهای معتبر از خطاهای مسدودکننده، رکوردهای قرنطینه‌شده و راه‌حل‌های قطعی رفع نقص
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadQuality}
          className="h-8 gap-1.5 text-xs rounded-xl self-start sm:self-center"
        >
          <RefreshCw className="size-3.5" />
          <span>به‌روزرسانی کیفیت</span>
        </Button>
      </div>

      {/* KPI Highlights Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl border border-border bg-card shadow-2xs">
          <span className="text-[11px] text-muted-foreground block">کل سطرهای بررسی‌شده:</span>
          <strong className="text-base font-bold text-foreground block mt-1 font-mono">
            {data.total_records.toLocaleString("fa-IR")}
          </strong>
        </div>

        <div className="p-3.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 shadow-2xs">
          <span className="text-[11px] text-emerald-700 dark:text-emerald-400 block font-medium">
            پذیرفته‌شده در دفاتر:
          </span>
          <strong className="text-base font-bold text-emerald-600 dark:text-emerald-400 block mt-1 font-mono">
            {data.accepted_records.toLocaleString("fa-IR")}
          </strong>
        </div>

        <div className="p-3.5 rounded-2xl border border-amber-500/20 bg-amber-500/5 shadow-2xs">
          <span className="text-[11px] text-amber-700 dark:text-amber-400 block font-medium">
            هشدارهای قابل‌بررسی:
          </span>
          <strong className="text-base font-bold text-amber-600 dark:text-amber-400 block mt-1 font-mono">
            {data.warning_records.toLocaleString("fa-IR")}
          </strong>
        </div>

        <div className="p-3.5 rounded-2xl border border-rose-500/20 bg-rose-500/5 shadow-2xs">
          <span className="text-[11px] text-rose-700 dark:text-rose-400 block font-medium">
            ردشده در قرنطینه:
          </span>
          <strong className="text-base font-bold text-rose-600 dark:text-rose-400 block mt-1 font-mono">
            {data.rejected_records.toLocaleString("fa-IR")}
          </strong>
        </div>
      </div>

      {/* Grouped Issues Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-amber-500" />
            <h4 className="text-sm font-bold text-foreground">دسته‌بندی موضوعی اشکالات شناسایی‌شده</h4>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {data.groups.length} نوع خطا شناسایی شده است
          </span>
        </div>

        {data.groups.length === 0 ? (
          <div className="p-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2.5">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
            <span>تبریک! هیچ خطای ساختاری یا اعتبارسنجی در داده‌های مالی ثبت نشده است.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.groups.map((group) => {
              const isBlocking = group.severity === "blocking" || group.severity === "error";

              return (
                <div
                  key={group.code}
                  className={`p-4 rounded-2xl border transition-all text-xs space-y-2 ${
                    isBlocking
                      ? "border-rose-500/30 bg-rose-500/[0.03]"
                      : "border-amber-500/30 bg-amber-500/[0.03]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {isBlocking ? (
                        <AlertCircle className="size-4 text-rose-600 dark:text-rose-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      )}
                      <strong className="block font-bold text-foreground truncate">
                        {group.title}
                      </strong>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[11px] py-0.5 px-2 font-mono ${
                        isBlocking
                          ? "bg-rose-500/10 text-rose-600 border-rose-500/30"
                          : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                      }`}
                    >
                      {group.count.toLocaleString("fa-IR")} مورد
                    </Badge>
                  </div>

                  <p className="text-[11px] text-muted-foreground font-mono" dir="ltr">
                    کد خطا: {group.code} · تأثیر بر {group.affected_batches_count} فایل
                  </p>

                  {group.remedy && (
                    <div className="p-2.5 rounded-xl bg-card border border-border/70 text-[11px] text-foreground space-y-1">
                      <span className="font-bold text-primary block">راهکار رفع اشکال:</span>
                      <p className="text-muted-foreground leading-relaxed">{group.remedy}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Quarantined Rows Table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileX2 className="size-4 text-rose-600 dark:text-rose-400" />
            <h4 className="text-sm font-bold text-foreground">
              رکوردهای قرنطینه‌شده (Quarantined Records)
            </h4>
          </div>
          <span className="text-[11px] text-muted-foreground">
            این سطرها به دلیل نقایص قطعی از ورود به دفاتر مالی منع شده‌اند
          </span>
        </div>

        {data.quarantined_rows.length === 0 ? (
          <div className="p-6 rounded-2xl border border-dashed border-border text-center text-xs text-muted-foreground">
            در حال حاضر هیچ سطری در قرنطینه وجود ندارد.
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <Table className="text-xs">
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="text-start font-bold">فایل و شیت</TableHead>
                    <TableHead className="text-center font-bold">شماره سطر</TableHead>
                    <TableHead className="text-start font-bold">دلیل رد رکورد</TableHead>
                    <TableHead className="text-start font-bold">راهکار اصلاح</TableHead>
                    <TableHead className="text-end font-bold">بررسی مقادیر</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/60">
                  {data.quarantined_rows.map((row) => (
                    <TableRow key={row.row_id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="py-2.5">
                        <strong className="block truncate max-w-[160px] font-mono text-[11px]" dir="ltr">
                          {row.source_filename}
                        </strong>
                        <span className="text-[10px] text-muted-foreground">
                          {row.sheet ? `شیت: ${row.sheet}` : "CSV"}
                        </span>
                      </TableCell>

                      <TableCell className="py-2.5 text-center font-mono font-bold">
                        {row.row_number.toLocaleString("fa-IR")}
                      </TableCell>

                      <TableCell className="py-2.5">
                        <div className="space-y-0.5">
                          {row.issues.map((iss, idx) => (
                            <span
                              key={idx}
                              className="block text-rose-600 dark:text-rose-400 font-medium text-[11px]"
                            >
                              • {iss.message || iss.title}
                            </span>
                          ))}
                        </div>
                      </TableCell>

                      <TableCell className="py-2.5 text-muted-foreground text-[11px] max-w-xs">
                        {row.issues[0]?.remedy || "بررسی مقادیر فایل منبع"}
                      </TableCell>

                      <TableCell className="py-2.5 text-end">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] rounded-lg gap-1 px-2.5"
                          onClick={() => setSelectedRow(row)}
                        >
                          <Eye className="size-3" />
                          <span>مشاهده سطر</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </section>

      {/* Row Inspection Dialog */}
      {selectedRow && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-card border border-border rounded-2xl p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto" dir="rtl">
            <div className="flex items-center justify-between border-b border-border/70 pb-3">
              <div>
                <strong className="block text-sm font-bold text-foreground">
                  جزییات سطر {selectedRow.row_number.toLocaleString("fa-IR")} از فایل {selectedRow.source_filename}
                </strong>
                <span className="text-[11px] text-muted-foreground">
                  مقادیر خام ارسال‌شده پیش از تلاش برای اعتبارسنجی
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs rounded-lg"
                onClick={() => setSelectedRow(null)}
              >
                بستن
              </Button>
            </div>

            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-400 space-y-1">
              <strong className="block font-bold">علل توقف و عدم ورود به دفاتر:</strong>
              <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                {selectedRow.issues.map((iss, idx) => (
                  <li key={idx}>
                    {iss.message} ({iss.remedy || "نیاز به اصلاح در فایل منبع"})
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-bold text-foreground block">مقادیر خام ستون‌های سطر:</span>
              <div className="p-3 rounded-xl bg-muted/30 border border-border font-mono text-[11px] overflow-x-auto" dir="ltr">
                <table className="w-full text-start">
                  <thead>
                    <tr className="border-b border-border/60 text-muted-foreground">
                      <th className="pb-1 text-start">ستون منبع</th>
                      <th className="pb-1 text-start">مقدار خام</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {Object.entries(selectedRow.raw_data).map(([k, v]) => (
                      <tr key={k}>
                        <td className="py-1 text-primary pe-4 font-semibold">{k}</td>
                        <td className="py-1 text-foreground truncate max-w-xs">{String(v ?? "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Record Lineage Dialog */}
      <RecordLineageDialog
        open={Boolean(lineageRecord)}
        onOpenChange={(o) => !o && setLineageRecord(null)}
        companyId={company.id}
        entityType={lineageRecord?.type || "journal_entry"}
        recordId={lineageRecord?.id || null}
      />
    </div>
  );
}
