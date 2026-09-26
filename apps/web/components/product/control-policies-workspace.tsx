"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  SlidersHorizontal,
  ShieldCheck,
  Save,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ArrowRight,
  Info,
  Check,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toPersianDigits, RiskBadge, PageHeader } from "@/components/ui/financial";
import { api } from "@/lib/product-api";
import type { Company, FinancialControlPolicy } from "@/lib/product-types";

type RuleDefinition = {
  rule_code: string;
  title_fa: string;
  description_fa: string;
  category_fa: string;
  default_severity: "critical" | "high" | "medium" | "low";
  thresholdFields: {
    key: string;
    label_fa: string;
    defaultValue: number;
    unit_fa?: string;
  }[];
};

const RULE_DEFINITIONS: RuleDefinition[] = [
  {
    rule_code: "UNMATCHED_BANK_OUTFLOW",
    title_fa: "خروج وجه از بانک بدون ثبت در دفاتر مالی",
    description_fa: "شناسایی پرداخت‌ها و برداشت‌های نقدی از حساب بانکی که سند متناظری برای آن‌ها در سیستم حسابداری ثبت نشده است.",
    category_fa: "تطبیق بانکی",
    default_severity: "critical",
    thresholdFields: [
      { key: "minimum_amount_irr", label_fa: "حداقل مبلغ اهمیت", defaultValue: 5000000, unit_fa: "ریال" },
    ],
  },
  {
    rule_code: "UNMATCHED_JOURNAL_PAYMENT",
    title_fa: "سند حسابداری پرداخت بدون گردش متناظر در بانک",
    description_fa: "شناسایی اسناد پرداخت و صدور چک در دفاتر مالی که برداشت متناظر با آن‌ها در صورت‌حساب بانک مشاهده نمی‌شود.",
    category_fa: "تطبیق بانکی",
    default_severity: "high",
    thresholdFields: [
      { key: "minimum_amount_irr", label_fa: "حداقل مبلغ اهمیت", defaultValue: 5000000, unit_fa: "ریال" },
    ],
  },
  {
    rule_code: "LARGE_AMOUNT_MISMATCH",
    title_fa: "مغایرت مبلغ بااهمیت بین بانک و دفاتر",
    description_fa: "شناسایی تراکنش‌هایی که از نظر تاریخ و شماره پیگیری تطبیق دارند اما ارقام ریالی ثبت‌شده در دو طرف تفاوت دارند.",
    category_fa: "تطبیق بانکی",
    default_severity: "high",
    thresholdFields: [
      { key: "threshold_irr", label_fa: "حداقل اختلاف مبلغ قابل پیگیری", defaultValue: 1000000, unit_fa: "ریال" },
    ],
  },
  {
    rule_code: "DUPLICATE_BANK_STATEMENT_LINE",
    title_fa: "تراکنش‌های بانکی تکراری و ثبت مضاعف",
    description_fa: "کشف تراکنش‌های واریز یا برداشت در صورت‌حساب بانک با مبالغ و تاریخ‌های یکسان که ریسک شارژ یا پرداخت تکراری دارند.",
    category_fa: "تطبیق بانکی",
    default_severity: "high",
    thresholdFields: [
      { key: "window_days", label_fa: "پنجره بررسی روزهای مجاور", defaultValue: 3, unit_fa: "روز" },
    ],
  },
  {
    rule_code: "OVERDUE_RECEIVABLE_EXTREME",
    title_fa: "مطالبات تجاری با تاخیر غیرعادی و ریسک سوخت",
    description_fa: "شناسایی مشتریان و فاکتورهایی که دوره تاخیر وصول آن‌ها به شکل بحرانی از استانداردهای اعتباری شرکت فراتر رفته است.",
    category_fa: "مطالبات تجاری",
    default_severity: "critical",
    thresholdFields: [
      { key: "extreme_days", label_fa: "آستانه تاخیر بحرانی", defaultValue: 90, unit_fa: "روز" },
      { key: "minimum_amount_irr", label_fa: "حداقل مبلغ مطالبات", defaultValue: 10000000, unit_fa: "ریال" },
    ],
  },
  {
    rule_code: "CASH_RUNWAY_EXHAUSTION",
    title_fa: "فرسایش سریع نقدینگی و تاب‌آوری بحرانی",
    description_fa: "هشدار خودکار در صورت کاهش دوره تاب‌آوری ذخایر نقدی و نزدیک شدن شرکت به نقطه کسری جریان نقد.",
    category_fa: "نقدینگی و خزانه‌داری",
    default_severity: "critical",
    thresholdFields: [
      { key: "runway_threshold_days", label_fa: "حداقل روزهای تاب‌آوری نقدی مجاز", defaultValue: 30, unit_fa: "روز" },
    ],
  },
  {
    rule_code: "ABNORMAL_DISCOUNT_SURGE",
    title_fa: "جهش غیرعادی نرخ تخفیفات فروش اعطایی",
    description_fa: "کشف فاکتورهای فروش با نسبت تخفیف‌های غیرمتعارف خارج از چهارچوب مصوب بازرگانی و فروش.",
    category_fa: "تحلیل مالی و سودآوری",
    default_severity: "medium",
    thresholdFields: [
      { key: "discount_surge_ratio", label_fa: "نسبت جهش تخفیف نسبت به میانگین", defaultValue: 0.25, unit_fa: "نسبت" },
      { key: "minimum_revenue_impact_irr", label_fa: "حداقل اثر ریالی تخفیف", defaultValue: 20000000, unit_fa: "ریال" },
    ],
  },
  {
    rule_code: "UNUSUAL_SALES_CREDIT_MEMO",
    title_fa: "اسناد بستانکاری یا برگشت از فروش غیرمتعارف",
    description_fa: "کشف حجم بالای اصلاحات قیمت، تخفیفات پس از فروش یا برگشت از فروش صادره برای طرف‌های تجاری خاص.",
    category_fa: "تحلیل مالی و سودآوری",
    default_severity: "medium",
    thresholdFields: [
      { key: "credit_memo_ratio", label_fa: "حداکثر سهم برگشت/بستانکاری از فاکتور", defaultValue: 0.30, unit_fa: "نسبت" },
      { key: "minimum_amount_irr", label_fa: "حداقل مبلغ سند بستانکاری", defaultValue: 15000000, unit_fa: "ریال" },
    ],
  },
];

export function ControlPoliciesWorkspace({ company }: { company: Company }) {
  const [policies, setPolicies] = useState<Record<string, FinancialControlPolicy>>({});
  const [loading, setLoading] = useState(true);
  const [savingRule, setSavingRule] = useState<string | null>(null);
  const base = `/companies/${company.id}`;

  const loadPolicies = useCallback(async () => {
    try {
      const data = await api<FinancialControlPolicy[]>(`/companies/${company.id}/control/policies`);
      const map: Record<string, FinancialControlPolicy> = {};
      for (const p of data) {
        map[p.rule_code] = p;
      }
      setPolicies(map);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "دریافت خط‌مشی‌های کنترلی با خطا مواجه شد.");
    } finally {
      setLoading(false);
    }
  }, [company.id]);

  useEffect(() => {
    void loadPolicies();
  }, [loadPolicies]);

  const handleUpdate = async (ruleCode: string, payload: {
    is_enabled?: boolean;
    severity_override?: string | null;
    thresholds?: Record<string, any>;
  }) => {
    setSavingRule(ruleCode);
    try {
      const updated = await api<FinancialControlPolicy>(
        `/companies/${company.id}/control/policies/${ruleCode}`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
        }
      );
      setPolicies((prev) => ({ ...prev, [ruleCode]: updated }));
      toast.success("تنظیمات خط‌مشی با موفقیت ذخیره شد.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطا در به‌روزرسانی خط‌مشی.");
    } finally {
      setSavingRule(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse" dir="rtl">
        <Skeleton className="h-10 w-72 rounded-xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12" dir="rtl">
      {/* Header */}
      <PageHeader
        title="خط‌مشی‌ها و قوانین پایش مغایرت‌ها"
        description="مدیریت قواعد ۸ گانه موتور تشخیص قطعی، تنظیم آستانه‌های محاسباتی و تعیین سطح اهمیت ریسک"
        badge={
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">
            <SlidersHorizontal className="size-3.5" />
            خط‌مشی‌های پایش
          </span>
        }
        secondaryActions={
          <Button variant="outline" size="sm" asChild className="h-8 gap-1.5 text-xs font-bold rounded-xl">
            <Link href={`${base}/control`}>
              <ShieldCheck className="size-3.5 text-primary" />
              <span>مشاهده داشبورد کنترل</span>
            </Link>
          </Button>
        }
      />

      {/* Rules List */}
      <div className="space-y-4">
        {RULE_DEFINITIONS.map((def) => {
          const policy = policies[def.rule_code];
          const isEnabled = policy ? policy.is_enabled : true;
          const currentSeverity = policy?.severity_override || def.default_severity;
          const currentThresholds = policy?.thresholds || {};

          return (
            <div
              key={def.rule_code}
              className={`p-5 rounded-2xl border transition-all ${
                isEnabled
                  ? "border-border bg-card/70 shadow-xs"
                  : "border-border/50 bg-muted/20 opacity-70"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-muted text-foreground border border-border/70">
                      {def.rule_code}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-primary/10 text-primary">
                      {def.category_fa}
                    </span>
                    <RiskBadge level={currentSeverity as any} size="sm" />
                  </div>
                  <h3 className="text-sm sm:text-base font-extrabold text-foreground pt-1">
                    {def.title_fa}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {def.description_fa}
                  </p>
                </div>

                {/* Enable/Disable Switch */}
                <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto bg-muted/50 p-2 rounded-xl border border-border/60">
                  <span className="text-xs font-bold text-foreground">
                    {isEnabled ? "فعال در پایش" : "غیرفعال"}
                  </span>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={(checked) => {
                      void handleUpdate(def.rule_code, {
                        is_enabled: checked,
                        severity_override: policy?.severity_override ?? null,
                        thresholds: currentThresholds,
                      });
                    }}
                    disabled={savingRule === def.rule_code}
                  />
                </div>
              </div>

              {/* Thresholds and Severity Settings */}
              {isEnabled && (
                <div className="mt-4 pt-4 border-t border-border/60 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-end">
                  {/* Severity Override */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-muted-foreground">
                      سطح شدت مغایرت:
                    </label>
                    <Select
                      value={currentSeverity}
                      onValueChange={(val) => {
                        void handleUpdate(def.rule_code, {
                          is_enabled: isEnabled,
                          severity_override: val,
                          thresholds: currentThresholds,
                        });
                      }}
                      dir="rtl"
                    >
                      <SelectTrigger className="h-8 text-xs font-bold bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="critical" className="text-xs font-bold text-red-600">بحرانی (Critical)</SelectItem>
                        <SelectItem value="high" className="text-xs font-bold text-amber-600">بالا (High)</SelectItem>
                        <SelectItem value="medium" className="text-xs font-bold text-blue-600">متوسط (Medium)</SelectItem>
                        <SelectItem value="low" className="text-xs font-bold text-muted-foreground">پایین (Low)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Threshold Fields */}
                  {def.thresholdFields.map((field) => {
                    const val = currentThresholds[field.key] ?? field.defaultValue;
                    return (
                      <div key={field.key} className="space-y-1.5">
                        <label className="text-[11px] font-bold text-muted-foreground flex items-center justify-between">
                          <span>{field.label_fa}:</span>
                          {field.unit_fa && <span className="text-[10px] text-muted-foreground/80">({field.unit_fa})</span>}
                        </label>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            defaultValue={val}
                            onBlur={(e) => {
                              const nextVal = Number(e.target.value);
                              if (nextVal !== val) {
                                void handleUpdate(def.rule_code, {
                                  is_enabled: isEnabled,
                                  severity_override: currentSeverity,
                                  thresholds: { ...currentThresholds, [field.key]: nextVal },
                                });
                              }
                            }}
                            className="h-8 text-xs font-mono font-bold bg-background text-start"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
