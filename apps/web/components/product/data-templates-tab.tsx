"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductCard } from "./product-card";
import { api } from "@/lib/product-api";
import type { Company, MappingTemplateResponse } from "@/lib/product-types";
import {
  BookOpen,
  Calendar,
  Coins,
  FileCode2,
  Landmark,
  Receipt,
  Trash2,
  RefreshCw,
  Layers,
  Sparkles,
} from "@/components/ui/icons";

interface DataTemplatesTabProps {
  company: Company;
  onRefreshOverview?: () => void;
}

const sourceLabels = {
  accounting: "حسابداری",
  bank: "گردش بانکی",
  sales: "فروش و صورتحساب",
};

const sourceIcons = {
  accounting: BookOpen,
  bank: Landmark,
  sales: Receipt,
};

export function DataTemplatesTab({ company }: DataTemplatesTabProps) {
  const [templates, setTemplates] = useState<MappingTemplateResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadTemplates = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api<MappingTemplateResponse[]>(
        `/companies/${company.id}/imports/templates`,
      );
      setTemplates(res);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "خطا در دریافت الگوهای نگاشت.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
  }, [company.id]);

  async function handleDelete(id: string) {
    if (!window.confirm("آیا از حذف این الگوی نگاشت اطمینان دارید؟")) return;
    setDeletingId(id);
    try {
      await api(`/companies/${company.id}/imports/templates/${id}`, {
        method: "DELETE",
      });
      setTemplates((cur) => cur.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "حذف الگو انجام نشد.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="pp-data-templates space-y-4" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-foreground">
            الگوهای ذخیره‌شده تطبیق ستون‌ها
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            نگاشت‌های سفارشی ذخیره‌شده بر اساس ساختار نرم‌افزارهای حسابداری
            (سپیدار، راهکاران، پیوست، اکسل بانک‌ها)
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadTemplates}
          className="gap-1.5 self-start sm:self-center"
        >
          <RefreshCw className="size-3.5" />
          <span>به‌روزرسانی الگوها</span>
        </Button>
      </div>

      {error && (
        <div className="p-3 text-xs rounded-[var(--ds-card-radius)] bg-destructive/10 text-destructive border border-destructive/20">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-xs text-muted-foreground">
          در حال بارگذاری الگوهای نگاشت…
        </div>
      ) : error ? null : templates.length === 0 ? (
        <div className="p-12 text-center rounded-[var(--ds-card-radius)] border border-dashed border-border space-y-3">
          <div className="size-10 rounded-[var(--ds-card-radius)] bg-primary/10 text-primary mx-auto flex items-center justify-center">
            <Sparkles className="size-5" />
          </div>
          <h4 className="text-sm font-bold text-foreground">
            هنوز الگوی نگاشتی ذخیره نشده است
          </h4>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            هنگام بارگذاری فایل در مرحله تطبیق و تأیید، می‌توانید گزینه «ذخیره
            این نگاشت به‌عنوان الگو» را انتخاب کنید تا برای فایل‌های دوره‌های
            بعد به صورت خودکار شناسایی و پیشنهاد شود.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {templates.map((tpl) => {
            const IconComp = sourceIcons[tpl.source_kind] || FileCode2;
            const mappedCount = Object.keys(tpl.mapping || {}).length;

            return (
              <ProductCard
                key={tpl.id}
                className="p-4 rounded-[var(--ds-card-radius)] border border-border/80 bg-card hover:border-primary/40 transition-all shadow-2xs flex flex-col justify-between space-y-3"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2 border-b border-border/60 pb-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <IconComp className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <strong className="block text-xs font-bold text-foreground truncate">
                          {tpl.name}
                        </strong>
                        <span className="text-[11px] text-muted-foreground block truncate">
                          منبع:{" "}
                          {sourceLabels[tpl.source_kind] || tpl.source_kind}
                        </span>
                      </div>
                    </div>

                    {company.role !== "viewer" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={() => handleDelete(tpl.id)}
                        disabled={deletingId === tpl.id}
                        title="حذف الگو"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Attributes */}
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 rounded-lg bg-muted/30">
                      <span className="text-muted-foreground block">
                        واحد ارزی:
                      </span>
                      <strong className="text-foreground block mt-0.5 font-bold">
                        {tpl.currency_unit === "toman"
                          ? "تومان (تبدیل به ریال)"
                          : "ریال"}
                      </strong>
                    </div>

                    <div className="p-2 rounded-lg bg-muted/30">
                      <span className="text-muted-foreground block">
                        تقویم تاریخ:
                      </span>
                      <strong className="text-foreground block mt-0.5 font-bold">
                        {tpl.calendar === "jalali" ? "شمسی (جلالی)" : "میلادی"}
                      </strong>
                    </div>

                    <div className="p-2 rounded-lg bg-muted/30">
                      <span className="text-muted-foreground block">
                        ردیف سرستون:
                      </span>
                      <strong className="text-foreground block mt-0.5 font-mono">
                        ردیف {tpl.header_row || 1}
                      </strong>
                    </div>

                    <div className="p-2 rounded-lg bg-muted/30">
                      <span className="text-muted-foreground block">
                        فیلدهای نگاشت‌شده:
                      </span>
                      <strong className="text-foreground block mt-0.5 font-mono text-primary">
                        {mappedCount} ستون
                      </strong>
                    </div>
                  </div>

                  {/* Preview of mapped fields */}
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted-foreground block">
                      ستون‌های منطبق:
                    </span>
                    <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                      {Object.entries(tpl.mapping || {})
                        .slice(0, 6)
                        .map(([tgt, src]) => (
                          <span
                            key={tgt}
                            className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground font-mono truncate max-w-[120px]"
                          >
                            {tgt}
                          </span>
                        ))}
                      {mappedCount > 6 && (
                        <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground font-mono">
                          +{mappedCount - 6} فیلد دیگر
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-border/40 text-[10px] text-muted-foreground flex items-center justify-between">
                  <span>ثبت‌شده:</span>
                  <span className="font-mono">
                    {new Date(tpl.created_at).toLocaleDateString("fa-IR")}
                  </span>
                </div>
              </ProductCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
