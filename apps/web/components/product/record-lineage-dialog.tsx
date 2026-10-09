"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/product-api";
import type { RecordLineageResponse } from "@/lib/product-types";
import { FileText, GitBranch, Hash, Layers, ShieldCheck } from "@/components/ui/icons";

interface RecordLineageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  entityType: string;
  recordId: string | null;
}

export function RecordLineageDialog({
  open,
  onOpenChange,
  companyId,
  entityType,
  recordId,
}: RecordLineageDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<RecordLineageResponse | null>(null);

  useEffect(() => {
    if (!open || !recordId) {
      setData(null);
      setError("");
      return;
    }

    let ignore = false;
    setLoading(true);
    setError("");

    api<RecordLineageResponse>(
      `/companies/${companyId}/data/lineage/${entityType}/${recordId}`
    )
      .then((res) => {
        if (!ignore) setData(res);
      })
      .catch((err) => {
        if (!ignore) {
          setError(
            err instanceof Error ? err.message : "خطا در دریافت اطلاعات ردگیری رکورد."
          );
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [open, companyId, entityType, recordId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[95vw] sm:max-w-2xl max-h-[85vh] overflow-y-auto rounded-[var(--ds-card-radius)] p-5"
        dir="rtl"
      >
        <DialogHeader className="border-b border-border/70 pb-3 text-start">
          <div className="flex items-center gap-2.5">
            <span className="size-8 rounded-lg  text-primary flex items-center justify-center shrink-0">
              <GitBranch className="size-4" />
            </span>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                ردگیری منشأ داده (Data Lineage & Traceability)
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                شناسایی فایل اولیه، شماره ردیف و نگاشت مورد استفاده برای ایجاد این رکورد مالی
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center">
            <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-xs text-muted-foreground">در حال استعلام اصل منبع داده…</p>
          </div>
        ) : error ? (
          <div className="p-4 rounded-[var(--ds-card-radius)] bg-destructive/10 text-destructive text-xs border border-destructive/20 my-4">
            {error}
          </div>
        ) : data ? (
          <div className="space-y-4 py-2 text-xs">
            {/* Source Origin Card */}
            <div className="p-3.5 rounded-[var(--ds-card-radius)] border border-border/70 bg-muted/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-foreground flex items-center gap-1.5">
                  <FileText className="size-3.5 text-primary" />
                  <span>فایل و سطر منبع اصلی</span>
                </span>
                <Badge variant="outline" className="font-mono text-[11px] bg-background">
                  سطر {data.source_row_number.toLocaleString("fa-IR")}
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-muted-foreground block">نام فایل مبدأ:</span>
                  <strong className="text-foreground block truncate mt-0.5 font-mono" dir="ltr">
                    {data.source_filename}
                  </strong>
                </div>
                <div>
                  <span className="text-muted-foreground block">شیت (Sheet):</span>
                  <strong className="text-foreground block mt-0.5">
                    {data.sheet_name || "پیش‌فرض"}
                  </strong>
                </div>
                <div>
                  <span className="text-muted-foreground block">شناسه هش امنیتی (SHA-256):</span>
                  <span className="font-mono text-[10px] text-muted-foreground block truncate mt-0.5" dir="ltr">
                    {data.source_file_sha256}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">نسخه نگاشت (Mapping Version):</span>
                  <strong className="text-foreground block mt-0.5">
                    نسخه {data.mapping_version}
                  </strong>
                </div>
              </div>
            </div>

            {/* Raw Extracted Values */}
            <div className="space-y-1.5">
              <strong className="text-foreground block font-bold flex items-center gap-1.5">
                <Hash className="size-3.5 text-muted-foreground" />
                <span>مقادیر خام استخراج‌شده از اکسل / CSV:</span>
              </strong>
              <div className="p-3 rounded-[var(--ds-card-radius)] bg-card border border-border/80 font-mono text-[11px] overflow-x-auto" dir="ltr">
                <table className="w-full text-start">
                  <thead>
                    <tr className="border-b border-border/60 text-muted-foreground">
                      <th className="pb-1.5 text-start font-medium">Original Column</th>
                      <th className="pb-1.5 text-start font-medium">Raw Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {Object.entries(data.raw_values).map(([k, v]) => (
                      <tr key={k} className="hover:bg-muted/30">
                        <td className="py-1 text-primary pe-3 font-semibold">{k}</td>
                        <td className="py-1 text-foreground truncate max-w-xs">{String(v ?? "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Canonical Normalized Result */}
            <div className="space-y-1.5">
              <strong className="text-foreground block font-bold flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-ds-success" />
                <span>نتیجه اعتبارسنجی و ثبت در دفاتر دیدبان مالی:</span>
              </strong>
              <div className="p-3 rounded-[var(--ds-card-radius)] bg-card border border-border/80 text-[11px] space-y-1.5">
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(data.normalized_fields).map(([k, v]) => (
                    <div key={k} className="p-1.5 rounded-lg bg-muted/20">
                      <span className="text-muted-foreground text-[10px] block font-mono" dir="ltr">{k}</span>
                      <strong className="text-foreground block truncate mt-0.5 font-mono">
                        {String(v ?? "—")}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
