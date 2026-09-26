"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Layers,
  RefreshCcw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Truck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Column,
  FinancialDataTable,
  KpiMetricCard,
  MoneyDisplay,
  RiskBadge,
  toPersianDigits,
} from "@/components/ui/financial";

import { api } from "@/lib/product-api";
import type {
  Company,
  PayablesBucketKey,
  PayablesRiskLevel,
  PayablesSummaryResponse,
  VendorPayableItem,
  VendorsPayablesResponse,
} from "@/lib/product-types";

const BUCKET_COLORS: Record<PayablesBucketKey, { bar: string; badge: string; border: string; activeBorder: string }> = {
  not_due: {
    bar: "bg-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
    border: "border-s-emerald-500",
    activeBorder: "ring-2 ring-emerald-500/50",
  },
  "1_30": {
    bar: "bg-amber-400",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25",
    border: "border-s-amber-400",
    activeBorder: "ring-2 ring-amber-400/50",
  },
  "31_60": {
    bar: "bg-orange-500",
    badge: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/25",
    border: "border-s-orange-500",
    activeBorder: "ring-2 ring-orange-500/50",
  },
  "61_90": {
    bar: "bg-rose-500",
    badge: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/25",
    border: "border-s-rose-500",
    activeBorder: "ring-2 ring-rose-500/50",
  },
  "90_plus": {
    bar: "bg-red-600",
    badge: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/25",
    border: "border-s-red-600",
    activeBorder: "ring-2 ring-red-600/50",
  },
  due_date_missing: {
    bar: "bg-slate-400 dark:bg-slate-500",
    badge: "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/25",
    border: "border-s-slate-400",
    activeBorder: "ring-2 ring-slate-400/50",
  },
};

const BUCKET_LABELS: Record<PayablesBucketKey, string> = {
  not_due: "جاری (قبل از سررسید)",
  "1_30": "۱ تا ۳۰ روز تاخیر پرداخت",
  "31_60": "۳۱ تا ۶۰ روز تاخیر پرداخت",
  "61_90": "۶۱ تا ۹۰ روز تاخیر پرداخت",
  "90_plus": "بیش از ۹۰ روز تاخیر (ریسک توقف تامین)",
  due_date_missing: "فاقد تاریخ سررسید صریح",
};

export function PayablesWorkspace({ company }: { company: Company }) {
  const [summary, setSummary] = useState<PayablesSummaryResponse | null>(null);
  const [vendors, setVendors] = useState<VendorPayableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & Search
  const [riskFilter, setRiskFilter] = useState<"all" | PayablesRiskLevel>("all");
  const [bucketFilter, setBucketFilter] = useState<"all" | PayablesBucketKey>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Selected vendor for detail drawer
  const [selectedVendor, setSelectedVendor] = useState<VendorPayableItem | null>(null);

  const loadData = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      try {
        const [sumRes, venRes] = await Promise.allSettled([
          api<PayablesSummaryResponse>(`/companies/${company.id}/payables/summary`),
          api<VendorsPayablesResponse>(`/companies/${company.id}/payables/vendors`),
        ]);

        if (sumRes.status === "fulfilled" && sumRes.value && Number(sumRes.value.total_payables_irr) > 0) {
          setSummary(sumRes.value);
        } else {
          setSummary(null);
        }

        if (venRes.status === "fulfilled" && venRes.value && venRes.value.items?.length > 0) {
          setVendors(venRes.value.items);
        } else {
          setVendors([]);
        }
      } catch {
        setSummary(null);
        setVendors([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [company.id]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered vendors
  const filteredVendors = useMemo(() => {
    return vendors.filter((v) => {
      const matchesRisk = riskFilter === "all" || v.risk_level === riskFilter;
      const matchesBucket =
        bucketFilter === "all" ||
        (Number(v.buckets[bucketFilter]) > 0);
      const matchesSearch =
        !searchQuery.trim() ||
        v.name.includes(searchQuery.trim()) ||
        (v.national_id && v.national_id.includes(searchQuery.trim()));
      return matchesRisk && matchesBucket && matchesSearch;
    });
  }, [vendors, riskFilter, bucketFilter, searchQuery]);

  // Table Columns
  const vendorColumns: Column<VendorPayableItem>[] = [
    {
      key: "name",
      header: "تامین‌کننده / بستانکار",
      render: (row) => (
        <button
          type="button"
          onClick={() => setSelectedVendor(row)}
          className="flex flex-col gap-0.5 text-start hover:text-primary transition-colors focus-visible:outline-none"
        >
          <span className="font-semibold text-xs text-[var(--ds-card-fg)]">{row.name}</span>
          <span className="text-[11px] text-[var(--ds-muted-fg)]">
            {row.national_id ? `شناسه: ${toPersianDigits(row.national_id)}` : "بدون شناسه ملی"}
          </span>
        </button>
      ),
    },
    {
      key: "risk_level",
      header: "ریسک تامین",
      align: "center",
      render: (row) => <RiskBadge level={row.risk_level} score={row.risk_score} showIcon size="sm" />,
    },
    {
      key: "total_payable_irr",
      header: "کل مانده بدهی",
      numeric: true,
      align: "left",
      render: (row) => <MoneyDisplay amount={row.total_payable_irr} compact />,
    },
    {
      key: "overdue_amount_irr",
      header: "مبلغ سررسید گذشته",
      numeric: true,
      align: "left",
      render: (row) => (
        <MoneyDisplay
          amount={row.overdue_amount_irr}
          compact
          direction={Number(row.overdue_amount_irr) > 0 ? "negative" : "neutral"}
        />
      ),
    },
    {
      key: "overdue_ratio",
      header: "نسبت معوق",
      align: "center",
      render: (row) => (
        <span
          className={`font-mono text-xs font-medium ${
            row.overdue_ratio > 0.5 ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-[var(--ds-card-fg)]"
          }`}
        >
          {toPersianDigits((row.overdue_ratio * 100).toFixed(0))}٪
        </span>
      ),
    },
    {
      key: "avg_delay_days",
      header: "میانگین تاخیر",
      align: "center",
      render: (row) => (
        <span className="text-xs text-[var(--ds-muted-fg)]">
          {row.avg_delay_days > 0 ? `${toPersianDigits(row.avg_delay_days)} روز` : "سررسید نشده"}
        </span>
      ),
    },
    {
      key: "share_of_total_payables",
      header: "سهم از کل",
      align: "center",
      render: (row) => (
        <span className="font-mono text-xs text-[var(--ds-muted-fg)]">
          {toPersianDigits(row.share_of_total_payables.toFixed(1))}٪
        </span>
      ),
    },
    {
      key: "recommended_action",
      header: "اقدام پیشنهادی مدیریت خرید و خزانه",
      render: (row) => (
        <span
          className="text-xs text-[var(--ds-muted-fg)] line-clamp-1 max-w-[280px]"
          title={row.recommended_action}
        >
          {row.recommended_action}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "center",
      render: (row) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelectedVendor(row)}
          className="h-7 text-xs px-2 text-primary hover:text-primary"
        >
          جزئیات
        </Button>
      ),
    },
  ];

  if (loading && !summary) {
    return (
      <div className="space-y-6 animate-pulse" dir="rtl">
        <div className="h-10 bg-muted/60 rounded-xl w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="h-28 bg-muted/60 rounded-xl" />
          <div className="h-28 bg-muted/60 rounded-xl" />
          <div className="h-28 bg-muted/60 rounded-xl" />
          <div className="h-28 bg-muted/60 rounded-xl" />
        </div>
        <div className="h-64 bg-muted/60 rounded-xl" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--ds-border)] bg-[var(--ds-card)] p-12 text-center space-y-4 min-h-[360px]" dir="rtl">
        <div className="grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <Truck className="size-7 text-primary" />
        </div>
        <div className="max-w-md space-y-1">
          <h3 className="text-base font-bold text-foreground">هنوز داده‌های بدهی‌های تجاری ثبت نشده است</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            برای ارزیابی سررسید تعهدات و ریسک تامین، ابتدا باید صورت‌های مالی یا تراز معین بستانکاران را بارگذاری نمایید.
          </p>
        </div>
        <Link href={`/companies/${company.id}/imports`}>
          <Button className="gap-2 text-xs">
            بارگذاری اطلاعات مالی
            <ChevronLeft className="size-4" />
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12" dir="rtl">
      {/* Sub-header Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-1 border-b border-[var(--ds-border)]/60">
        <div>
          <h2 className="text-sm font-semibold text-[var(--ds-card-fg)]">
            تحلیل سنی و مدیریت بدهی‌های تجاری
          </h2>
          <p className="text-xs text-[var(--ds-muted-fg)]">
            پایش سررسید تعهدات، مدیریت ارتباط با تامین‌کنندگان و بهینه‌سازی دوره پرداخت (DPO)
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {summary?.as_of_date && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--ds-muted-fg)] bg-[var(--ds-muted-bg)] px-2.5 py-1 rounded-lg border border-[var(--ds-border)]">
              <Calendar className="size-3 text-primary" />
              <span>مبنای داده‌ها:</span>
              <span className="font-medium text-[var(--ds-card-fg)]">{toPersianDigits(summary.as_of_date)}</span>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="h-8 text-xs gap-1.5"
          >
            <RefreshCcw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span>بروزرسانی</span>
          </Button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiMetricCard
          title="کل بدهی‌های تجاری"
          value={summary?.total_payables_irr ?? 0}
          loading={loading}
          subtext={`${toPersianDigits(summary?.vendor_count ?? 0)} تامین‌کننده و بستانکار فعال`}
          icon={Truck}
        />
        <KpiMetricCard
          title="بدهی‌های معوق سررسیدشده"
          value={summary?.total_overdue_irr ?? 0}
          loading={loading}
          status={Number(summary?.total_overdue_irr ?? 0) > 0 ? "warning" : "normal"}
          subtext={`${toPersianDigits(summary?.high_risk_vendor_count ?? 0)} تامین‌کننده در آستانه توقف خدمات`}
          icon={ShieldAlert}
        />
        <KpiMetricCard
          title="دوره پرداخت بدهی‌ها (DPO)"
          value={`${toPersianDigits(summary?.dpo_days ?? 0)} روز`}
          unit=""
          currency=""
          loading={loading}
          subtext="میانگین زمان تسویه حساب با تامین‌کنندگان"
          icon={Clock}
        />
        <KpiMetricCard
          title="فاصله وصول تا پرداخت (شکاف نقد)"
          value={`${toPersianDigits(summary?.ccc_days ?? 0)} روز`}
          unit=""
          currency=""
          loading={loading}
          status={(summary?.ccc_days ?? 0) > 30 ? "warning" : "normal"}
          subtext={`DSO (${toPersianDigits(summary?.dso_days ?? 0)}) − DPO (${toPersianDigits(summary?.dpo_days ?? 0)}) | نیازمند DIO برای CCC قطعی`}
          icon={ArrowRightLeft}
        />
      </div>

      {/* Working Capital Insights Banner */}
      <div className="rounded-xl border border-[var(--ds-border)] bg-[var(--ds-card)] shadow-xs border-s-4 border-s-primary p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <ArrowRightLeft className="size-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs text-[var(--ds-card-fg)]">
                  ارزیابی فاصله وصول تا پرداخت (تقریب بدون موجودی کالا):
                </span>
                <span className="text-xs px-2 py-0.5 rounded-md border bg-primary/10 text-primary border-primary/25 font-medium">
                  فاصله: {toPersianDigits(summary?.ccc_days ?? 0)} روز
                </span>
              </div>
              <p className="text-xs text-[var(--ds-muted-fg)] leading-relaxed">
                {(summary?.ccc_days ?? 0) > 0
                  ? `شرکت به طور متوسط ${toPersianDigits(summary?.ccc_days ?? 0)} روز بین پرداخت به تامین‌کنندگان و وصول وجه از مشتریان، شکاف نقدینگی دارد و نیازمند نقدینگی در گردش است.`
                  : "شرکت دوره پرداخت طولانی‌تری نسبت به دوره وصول دارد؛ یعنی بخشی از سرمایه در گردش شرکت عملاً توسط تامین‌کنندگان تامین مالی می‌شود."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Aging Schedule Card */}
      <Card className="border-[var(--ds-border)] bg-[var(--ds-card)] shadow-xs">
        <CardHeader className="p-4 pb-3 border-b border-[var(--ds-border)]/70">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Layers className="size-4 text-primary" />
                <span>ماتریس تحلیل سنی بدهی‌ها (Aging Breakdown)</span>
              </CardTitle>
              <p className="text-xs text-[var(--ds-muted-fg)] mt-0.5">
                برای مشاهده و فیلتر تامین‌کنندگان هر طبقه، روی کارت مربوطه کلیک کنید
              </p>
            </div>
            {bucketFilter !== "all" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBucketFilter("all")}
                className="h-7 text-xs text-primary gap-1"
              >
                <span>حذف فیلتر سنی</span>
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {/* Proportion Bar */}
          <div className="h-3 w-full rounded-full bg-[var(--ds-muted-bg)] overflow-hidden flex">
            {summary?.buckets.map((b) => {
              if (b.share_percentage <= 0) return null;
              return (
                <div
                  key={b.bucket_key}
                  style={{ width: `${b.share_percentage}%` }}
                  className={`${BUCKET_COLORS[b.bucket_key].bar} transition-all duration-300 hover:opacity-80`}
                  title={`${b.label_fa}: ${toPersianDigits(b.share_percentage.toFixed(1))}٪`}
                />
              );
            })}
          </div>

          {/* 5 Clickable Bucket Metric Blocks */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {summary?.buckets.map((b) => {
              const conf = BUCKET_COLORS[b.bucket_key];
              const isSelected = bucketFilter === b.bucket_key;
              return (
                <button
                  key={b.bucket_key}
                  type="button"
                  onClick={() => setBucketFilter(isSelected ? "all" : b.bucket_key)}
                  className={`p-3 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-card-bg)] border-s-4 ${conf.border} text-start flex flex-col justify-between gap-2 transition-all hover:shadow-xs focus-visible:outline-none ${
                    isSelected ? conf.activeBorder : ""
                  }`}
                >
                  <div>
                    <span className="text-xs font-medium text-[var(--ds-muted-fg)] block">
                      {b.label_fa}
                    </span>
                    <div className="mt-1 font-semibold text-sm text-[var(--ds-card-fg)] tabular-nums">
                      <MoneyDisplay amount={b.amount_irr} compact />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-[var(--ds-border)]/60 text-[var(--ds-muted-fg)]">
                    <span>{toPersianDigits(b.vendor_count)} تامین‌کننده</span>
                    <span className="font-semibold text-[var(--ds-card-fg)] tabular-nums">
                      {toPersianDigits(b.share_percentage.toFixed(1))}٪
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Vendors Table Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Risk Filter Chips */}
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <span className="text-[var(--ds-muted-fg)] ml-1 font-medium">ریسک تامین:</span>
            <Button
              variant={riskFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setRiskFilter("all")}
              className="h-6 text-xs px-2.5 rounded-full"
            >
              همه ({toPersianDigits(vendors.length)})
            </Button>
            <Button
              variant={riskFilter === "critical" ? "default" : "outline"}
              size="sm"
              onClick={() => setRiskFilter("critical")}
              className={`h-6 text-xs px-2.5 rounded-full ${
                riskFilter !== "critical" ? "text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30" : ""
              }`}
            >
              بحرانی ({toPersianDigits(vendors.filter((v) => v.risk_level === "critical").length)})
            </Button>
            <Button
              variant={riskFilter === "high" ? "default" : "outline"}
              size="sm"
              onClick={() => setRiskFilter("high")}
              className={`h-6 text-xs px-2.5 rounded-full ${
                riskFilter !== "high" ? "text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30" : ""
              }`}
            >
              بالا ({toPersianDigits(vendors.filter((v) => v.risk_level === "high").length)})
            </Button>
            <Button
              variant={riskFilter === "medium" ? "default" : "outline"}
              size="sm"
              onClick={() => setRiskFilter("medium")}
              className="h-6 text-xs px-2.5 rounded-full"
            >
              متوسط ({toPersianDigits(vendors.filter((v) => v.risk_level === "medium").length)})
            </Button>
            <Button
              variant={riskFilter === "low" ? "default" : "outline"}
              size="sm"
              onClick={() => setRiskFilter("low")}
              className="h-6 text-xs px-2.5 rounded-full"
            >
              کم‌ریسک ({toPersianDigits(vendors.filter((v) => v.risk_level === "low").length)})
            </Button>
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[var(--ds-muted-fg)]" />
            <Input
              placeholder="جستجوی تامین‌کننده..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-8 text-xs h-8 bg-[var(--ds-card)]"
            />
          </div>
        </div>

        {/* Vendors Table */}
        <Card className="border-[var(--ds-border)] bg-[var(--ds-card)] overflow-hidden shadow-xs">
          <FinancialDataTable
            data={filteredVendors}
            columns={vendorColumns}
            keyExtractor={(row) => row.counterparty_id}
            density="compact"
            emptyMessage="هیچ تامین‌کننده‌ای با معیارهای جستجو یافت نشد."
          />
        </Card>
      </div>

      {/* Vendor Aging Drawer / Detail Dialog */}
      {selectedVendor && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl border-[var(--ds-border)] bg-[var(--ds-card)] shadow-2xl animate-in fade-in-50 zoom-in-95">
            <CardHeader className="flex flex-row items-start justify-between pb-3 border-b border-[var(--ds-border)]">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base font-bold text-[var(--ds-card-fg)]">{selectedVendor.name}</CardTitle>
                  <RiskBadge level={selectedVendor.risk_level} score={selectedVendor.risk_score} size="sm" />
                </div>
                <CardDescription className="text-xs mt-1">
                  شناسه ملی: {toPersianDigits(selectedVendor.national_id ?? "—")} | سهم از کل بستانکاران:{" "}
                  {toPersianDigits(selectedVendor.share_of_total_payables.toFixed(1))}٪
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 rounded-full"
                onClick={() => setSelectedVendor(null)}
              >
                <X className="size-4" />
              </Button>
            </CardHeader>

            <CardContent className="space-y-4 pt-4">
              {/* Financial Balance Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-[var(--ds-muted-bg)]/50 border border-[var(--ds-border)]">
                  <span className="text-xs text-[var(--ds-muted-fg)] block">کل مانده بدهی به تامین‌کننده</span>
                  <div className="mt-1 font-bold text-sm text-[var(--ds-card-fg)] tabular-nums">
                    <MoneyDisplay amount={selectedVendor.total_payable_irr} />
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[var(--ds-muted-bg)]/50 border border-[var(--ds-border)]">
                  <span className="text-xs text-[var(--ds-muted-fg)] block">مبلغ معوق سررسیدشده</span>
                  <div className="mt-1 font-bold text-sm text-rose-600 dark:text-rose-400 tabular-nums">
                    <MoneyDisplay amount={selectedVendor.overdue_amount_irr} />
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[var(--ds-muted-bg)]/50 border border-[var(--ds-border)] col-span-2 sm:col-span-1">
                  <span className="text-xs text-[var(--ds-muted-fg)] block">میانگین تاخیر پرداخت</span>
                  <div className="mt-1 font-bold text-sm text-[var(--ds-card-fg)] tabular-nums">
                    {toPersianDigits(selectedVendor.avg_delay_days)} روز
                  </div>
                </div>
              </div>

              {/* Bucket Breakdown for this Vendor */}
              <div>
                <h4 className="text-xs font-semibold text-[var(--ds-card-fg)] mb-2 flex items-center gap-1.5">
                  <Layers className="size-3.5 text-primary" />
                  <span>سبد بازه سنی بدهی این تامین‌کننده</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                  {(Object.keys(BUCKET_LABELS) as PayablesBucketKey[]).map((key) => {
                    const amount = selectedVendor.buckets[key] ?? "0";
                    const conf = BUCKET_COLORS[key];
                    return (
                      <div
                        key={key}
                        className={`p-2.5 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-card-bg)] border-s-2 ${conf.border}`}
                      >
                        <span className="text-[11px] text-[var(--ds-muted-fg)] block">{BUCKET_LABELS[key]}</span>
                        <div className="mt-1 font-semibold text-xs tabular-nums">
                          <MoneyDisplay amount={amount} compact />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recommended Action Callout */}
              <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-start gap-3">
                <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5 text-xs">
                  <span className="font-semibold text-amber-800 dark:text-amber-300">
                    اقدام پیشنهادی مدیریت خرید و خزانه‌داری:
                  </span>
                  <p className="text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
                    {selectedVendor.recommended_action}
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button variant="default" size="sm" onClick={() => setSelectedVendor(null)} className="text-xs h-8">
                  بستن
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
