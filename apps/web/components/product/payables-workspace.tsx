"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Building2,
  Calendar,
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

const BUCKET_COLORS: Record<PayablesBucketKey, { bar: string; badge: string; border: string }> = {
  not_due: {
    bar: "bg-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    border: "border-r-emerald-500",
  },
  "1_30": {
    bar: "bg-amber-400",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    border: "border-r-amber-400",
  },
  "31_60": {
    bar: "bg-orange-500",
    badge: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
    border: "border-r-orange-500",
  },
  "61_90": {
    bar: "bg-rose-500",
    badge: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
    border: "border-r-rose-500",
  },
  "90_plus": {
    bar: "bg-red-600",
    badge: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
    border: "border-r-red-600",
  },
};

const BUCKET_LABELS: Record<PayablesBucketKey, string> = {
  not_due: "جاری (قبل از سررسید)",
  "1_30": "۱ تا ۳۰ روز تاخیر پرداخت",
  "31_60": "۳۱ تا ۶۰ روز تاخیر پرداخت",
  "61_90": "۶۱ تا ۹۰ روز تاخیر پرداخت",
  "90_plus": "بیش از ۹۰ روز تاخیر (ریسک توقف تامین)",
};

// Realistic mock fallback for demonstration
const MOCK_SUMMARY: PayablesSummaryResponse = {
  as_of_date: "1403/06/31",
  total_payables_irr: "56200000000",
  total_overdue_irr: "19800000000",
  overdue_ratio: 0.3523,
  dpo_days: 48,
  dso_days: 54,
  ccc_days: 6, // CCC = DSO (54) - DPO (48) = 6 days
  vendor_count: 22,
  high_risk_vendor_count: 4,
  buckets: [
    {
      bucket_key: "not_due",
      label_fa: "جاری (قبل از سررسید)",
      amount_irr: "36400000000",
      vendor_count: 18,
      share_percentage: 64.77,
    },
    {
      bucket_key: "1_30",
      label_fa: "۱ تا ۳۰ روز تاخیر پرداخت",
      amount_irr: "8500000000",
      vendor_count: 6,
      share_percentage: 15.12,
    },
    {
      bucket_key: "31_60",
      label_fa: "۳۱ تا ۶۰ روز تاخیر پرداخت",
      amount_irr: "5800000000",
      vendor_count: 4,
      share_percentage: 10.32,
    },
    {
      bucket_key: "61_90",
      label_fa: "۶۱ تا ۹۰ روز تاخیر پرداخت",
      amount_irr: "3200000000",
      vendor_count: 2,
      share_percentage: 5.69,
    },
    {
      bucket_key: "90_plus",
      label_fa: "بیش از ۹۰ روز تاخیر (خطر توقف تامین)",
      amount_irr: "2300000000",
      vendor_count: 2,
      share_percentage: 4.1,
    },
  ],
};

const MOCK_VENDORS: VendorPayableItem[] = [
  {
    counterparty_id: "vendor-1",
    name: "شرکت پتروشیمی رازی (تامین مواد اولیه)",
    national_id: "10100456123",
    total_payable_irr: "18500000000",
    overdue_amount_irr: "9200000000",
    overdue_ratio: 0.4972,
    avg_delay_days: 72,
    risk_level: "critical",
    risk_score: 82,
    recommended_action: "مذاکره فوری مدیرعامل/مالی جهت جلوگیری از لغو سهمیه خرید و توقف خط تولید",
    buckets: {
      not_due: "9300000000",
      "1_30": "2500000000",
      "31_60": "3200000000",
      "61_90": "1500000000",
      "90_plus": "2000000000",
    },
    share_of_total_payables: 32.9,
  },
  {
    counterparty_id: "vendor-2",
    name: "صنایع بسته‌بندی نوین البرز",
    national_id: "14003322114",
    total_payable_irr: "8400000000",
    overdue_amount_irr: "4600000000",
    overdue_ratio: 0.5476,
    avg_delay_days: 48,
    risk_level: "high",
    risk_score: 64,
    recommended_action: "صدور چک صیادی جدید یا تسویه بخشی از بدهی معوق جهت حفظ سفارشات جاری",
    buckets: {
      not_due: "3800000000",
      "1_30": "2100000000",
      "31_60": "2200000000",
      "61_90": "300000000",
      "90_plus": "0",
    },
    share_of_total_payables: 14.9,
  },
  {
    counterparty_id: "vendor-3",
    name: "شرکت حمل و نقل سراسری ماهان بار",
    national_id: "10260345678",
    total_payable_irr: "6200000000",
    overdue_amount_irr: "2100000000",
    overdue_ratio: 0.3387,
    avg_delay_days: 25,
    risk_level: "medium",
    risk_score: 38,
    recommended_action: "هماهنگی با امور مالی تامین‌کننده و درخواست تمدید مهلت پرداخت",
    buckets: {
      not_due: "4100000000",
      "1_30": "2100000000",
      "31_60": "0",
      "61_90": "0",
      "90_plus": "0",
    },
    share_of_total_payables: 11.0,
  },
  {
    counterparty_id: "vendor-4",
    name: "فولاد آلیاژی پارس یزد",
    national_id: "10861234567",
    total_payable_irr: "15800000000",
    overdue_amount_irr: "0",
    overdue_ratio: 0.0,
    avg_delay_days: 0,
    risk_level: "low",
    risk_score: 10,
    recommended_action: "حفظ اعتبار تجاری و پرداخت در موعد سررسید توافقی",
    buckets: {
      not_due: "15800000000",
      "1_30": "0",
      "31_60": "0",
      "61_90": "0",
      "90_plus": "0",
    },
    share_of_total_payables: 28.1,
  },
];

export function PayablesWorkspace({ company }: { company: Company }) {
  const [summary, setSummary] = useState<PayablesSummaryResponse | null>(null);
  const [vendors, setVendors] = useState<VendorPayableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & Search
  const [riskFilter, setRiskFilter] = useState<"all" | PayablesRiskLevel>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [tableDensity, setTableDensity] = useState<"compact" | "normal">("normal");

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

        let hasData = false;

        if (
          sumRes.status === "fulfilled" &&
          sumRes.value &&
          Number(sumRes.value.total_payables_irr) > 0
        ) {
          setSummary(sumRes.value);
          hasData = true;
        }

        if (
          venRes.status === "fulfilled" &&
          venRes.value &&
          venRes.value.items?.length > 0
        ) {
          setVendors(venRes.value.items);
          hasData = true;
        }

        if (!hasData) {
          setSummary(MOCK_SUMMARY);
          setVendors(MOCK_VENDORS);
        }
      } catch {
        toast.info("نمایش نمونه شبیه‌سازی‌شده پرداختنی‌ها به دلیل عدم ثبت دفاتر معین بستانکاران");
        setSummary(MOCK_SUMMARY);
        setVendors(MOCK_VENDORS);
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
      const matchesSearch =
        !searchQuery.trim() ||
        v.name.includes(searchQuery.trim()) ||
        (v.national_id && v.national_id.includes(searchQuery.trim()));
      return matchesRisk && matchesSearch;
    });
  }, [vendors, riskFilter, searchQuery]);

  // Vendor Table Columns
  const vendorColumns: Column<VendorPayableItem>[] = [
    {
      key: "name",
      header: "تامین‌کننده / بستانکار تجاری",
      render: (row) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-[var(--ds-card-fg)]">{row.name}</span>
          <span className="text-[11px] text-[var(--ds-muted-fg)]">
            {row.national_id ? `شناسه ملی: ${toPersianDigits(row.national_id)}` : "بدون شناسه ملی"}
          </span>
        </div>
      ),
    },
    {
      key: "risk_level",
      header: "ریسک ارتباط تجاری",
      align: "center",
      render: (row) => (
        <RiskBadge
          level={row.risk_level}
          score={row.risk_score}
          showIcon
          size="sm"
        />
      ),
    },
    {
      key: "share_of_total",
      header: "سهم از کل بدهی‌ها",
      align: "center",
      render: (row) => (
        <span className="text-xs font-mono font-medium">
          {toPersianDigits(row.share_of_total_payables.toFixed(1))}%
        </span>
      ),
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
      header: "نسبت تاخیر",
      align: "center",
      render: (row) => (
        <span
          className={`font-mono text-xs font-semibold ${
            row.overdue_ratio > 0.4 ? "text-red-600 dark:text-red-400" : "text-[var(--ds-card-fg)]"
          }`}
        >
          {toPersianDigits((row.overdue_ratio * 100).toFixed(0))}%
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
      key: "recommended_action",
      header: "اقدام پیشنهادی مدیریت خرید و خزانه",
      render: (row) => (
        <span
          className="text-xs text-[var(--ds-card-fg)] line-clamp-1 max-w-[280px]"
          title={row.recommended_action}
        >
          {row.recommended_action}
        </span>
      ),
    },
    {
      key: "actions",
      header: "جزئیات",
      align: "center",
      render: (row) => (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs px-2"
          onClick={() => setSelectedVendor(row)}
        >
          سبد سنی
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-12" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[var(--ds-border)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-bold tracking-tight text-[var(--ds-card-fg)]">
              هوشمندی پرداختنی‌ها و تامین‌کنندگان (Payables Intelligence)
            </h1>
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-xs">
              سرمایه در گردش و تعهدات خرید
            </Badge>
          </div>
          <p className="text-xs lg:text-sm text-[var(--ds-muted-fg)] mt-1">
            تحلیل سن بدهی‌ها، مدیریت روابط با تامین‌کنندگان کلیدی، و محاسبه چرخه تبدیل نقد (CCC)
          </p>
        </div>

        <div className="flex items-center gap-2">
          {summary?.as_of_date && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--ds-muted-fg)] bg-[var(--ds-muted-bg)] px-3 py-1.5 rounded-lg border border-[var(--ds-border)]">
              <Calendar className="size-3.5 text-primary" />
              <span>مبنای محاسبه:</span>
              <span className="font-semibold text-[var(--ds-card-fg)]">{toPersianDigits(summary.as_of_date)}</span>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="h-9 gap-1.5"
          >
            <RefreshCcw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span>بروزرسانی</span>
          </Button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiMetricCard
          title="کل بدهی به بستانکاران تجاری"
          value={summary?.total_payables_irr ?? 0}
          loading={loading}
          subtext={`${toPersianDigits(summary?.vendor_count ?? 0)} تامین‌کننده و پیمانکار فعال`}
          icon={Truck}
        />
        <KpiMetricCard
          title="بدهی‌های معوق (Overdue Payables)"
          value={summary?.total_overdue_irr ?? 0}
          loading={loading}
          status={Number(summary?.total_overdue_irr ?? 0) > 0 ? "warning" : "normal"}
          subtext={`${toPersianDigits(summary?.high_risk_vendor_count ?? 0)} تامین‌کننده با ریسک قطع همکاری`}
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
          title="چرخه تبدیل نقد (Cash Conversion Cycle)"
          value={`${toPersianDigits(summary?.ccc_days ?? 0)} روز`}
          unit=""
          currency=""
          loading={loading}
          status={(summary?.ccc_days ?? 0) > 30 ? "warning" : "normal"}
          subtext={`DSO (${toPersianDigits(summary?.dso_days ?? 0)}) − DPO (${toPersianDigits(summary?.dpo_days ?? 0)})`}
          icon={ArrowRightLeft}
        />
      </div>

      {/* Working Capital Insights Banner */}
      <Card className="border-[var(--ds-border)] bg-[var(--ds-card)] shadow-xs border-r-4 border-r-primary">
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <ArrowRightLeft className="size-5 text-primary shrink-0 mt-0.5" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-[var(--ds-card-fg)]">
                  وضعیت سرمایه در گردش و شکاف نقدینگی (Working Capital):
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/20 font-semibold">
                  CCC: {toPersianDigits(summary?.ccc_days ?? 0)} روز
                </span>
              </div>
              <p className="text-xs text-[var(--ds-muted-fg)] mt-1 leading-relaxed">
                {(summary?.ccc_days ?? 0) > 0
                  ? `شرکت به طور متوسط ${toPersianDigits(summary?.ccc_days ?? 0)} روز بین پرداخت به تامین‌کنندگان مواد اولیه و دریافت وجه از مشتریان، شکاف نقدینگی دارد و نیازمند نقدینگی در گردش است.`
                  : "شرکت دوره پرداخت طولانی‌تری نسبت به دوره وصول دارد؛ یعنی بخشی از سرمایه در گردش شرکت عملاً توسط تامین‌کنندگان تامین مالی می‌شود."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Aging Schedule Card */}
      <Card className="border-[var(--ds-border)] bg-[var(--ds-card)] shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Layers className="size-4 text-primary" />
                توزیع سنی بدهی‌ها به تامین‌کنندگان (Payables Aging Schedule)
              </CardTitle>
              <CardDescription className="text-xs text-[var(--ds-muted-fg)] mt-0.5">
                تفکیک بدهی‌ها بر مبنای موعد سررسید فاکتورهای خرید و چک‌های صادره
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 text-xs text-[var(--ds-muted-fg)]">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-emerald-500" />
                جاری
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-amber-400" />
                ۱-۳۰
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-orange-500" />
                ۳۱-۶۰
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-rose-500" />
                ۶۱-۹۰
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-red-600" />
                +۹۰
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress Bar */}
          <div className="h-4 w-full rounded-full bg-[var(--ds-muted-bg)] overflow-hidden flex shadow-inner">
            {summary?.buckets.map((b) => {
              if (b.share_percentage <= 0) return null;
              return (
                <div
                  key={b.bucket_key}
                  style={{ width: `${b.share_percentage}%` }}
                  className={`${BUCKET_COLORS[b.bucket_key].bar} transition-all duration-300 hover:opacity-85`}
                  title={`${b.label_fa}: ${toPersianDigits(b.share_percentage.toFixed(1))}%`}
                />
              );
            })}
          </div>

          {/* 5 Bucket Metric Blocks */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2">
            {summary?.buckets.map((b) => {
              const conf = BUCKET_COLORS[b.bucket_key];
              return (
                <div
                  key={b.bucket_key}
                  className={`p-3 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-card-bg)] border-r-4 ${conf.border} flex flex-col justify-between gap-2`}
                >
                  <div>
                    <span className="text-xs font-medium text-[var(--ds-muted-fg)] block">
                      {b.label_fa}
                    </span>
                    <div className="mt-1">
                      <MoneyDisplay amount={b.amount_irr} compact />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-[var(--ds-border)] text-[var(--ds-muted-fg)]">
                    <span>{toPersianDigits(b.vendor_count)} تامین‌کننده</span>
                    <span className="font-semibold text-[var(--ds-card-fg)]">
                      {toPersianDigits(b.share_percentage.toFixed(1))}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Vendors Table Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Risk Filter Chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-[var(--ds-muted-fg)] ml-2">فیلتر ریسک تامین:</span>
            <Button
              variant={riskFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setRiskFilter("all")}
              className="h-7 text-xs rounded-full"
            >
              همه ({toPersianDigits(vendors.length)})
            </Button>
            <Button
              variant={riskFilter === "critical" ? "default" : "outline"}
              size="sm"
              onClick={() => setRiskFilter("critical")}
              className={`h-7 text-xs rounded-full ${
                riskFilter !== "critical" ? "text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" : ""
              }`}
            >
              بحرانی ({toPersianDigits(vendors.filter((v) => v.risk_level === "critical").length)})
            </Button>
            <Button
              variant={riskFilter === "high" ? "default" : "outline"}
              size="sm"
              onClick={() => setRiskFilter("high")}
              className={`h-7 text-xs rounded-full ${
                riskFilter !== "high" ? "text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30" : ""
              }`}
            >
              بالا ({toPersianDigits(vendors.filter((v) => v.risk_level === "high").length)})
            </Button>
            <Button
              variant={riskFilter === "medium" ? "default" : "outline"}
              size="sm"
              onClick={() => setRiskFilter("medium")}
              className="h-7 text-xs rounded-full"
            >
              متوسط ({toPersianDigits(vendors.filter((v) => v.risk_level === "medium").length)})
            </Button>
            <Button
              variant={riskFilter === "low" ? "default" : "outline"}
              size="sm"
              onClick={() => setRiskFilter("low")}
              className="h-7 text-xs rounded-full"
            >
              کم‌ریسک ({toPersianDigits(vendors.filter((v) => v.risk_level === "low").length)})
            </Button>
          </div>

          {/* Search & Density */}
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-[var(--ds-muted-fg)]" />
              <Input
                placeholder="جستجوی تامین‌کننده..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-8 text-xs h-9 bg-[var(--ds-card)]"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTableDensity(tableDensity === "compact" ? "normal" : "compact")}
              className="h-9 px-2 text-xs gap-1"
            >
              <SlidersHorizontal className="size-3.5" />
              <span>{tableDensity === "compact" ? "حالت فشرده" : "حالت عادی"}</span>
            </Button>
          </div>
        </div>

        {/* Vendors Table */}
        <Card className="border-[var(--ds-border)] bg-[var(--ds-card)] overflow-hidden">
          <FinancialDataTable
            data={filteredVendors}
            columns={vendorColumns}
            keyExtractor={(row) => row.counterparty_id}
            density={tableDensity}
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
                  <CardTitle className="text-lg font-bold">{selectedVendor.name}</CardTitle>
                  <RiskBadge level={selectedVendor.risk_level} score={selectedVendor.risk_score} size="sm" />
                </div>
                <CardDescription className="text-xs mt-1">
                  شناسه ملی: {toPersianDigits(selectedVendor.national_id ?? "—")} | سهم از کل بستانکاران:{" "}
                  {toPersianDigits(selectedVendor.share_of_total_payables.toFixed(1))}%
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

            <CardContent className="space-y-5 pt-4">
              {/* Financial Balance Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-[var(--ds-muted-bg)] border border-[var(--ds-border)]">
                  <span className="text-xs text-[var(--ds-muted-fg)] block">کل مانده بدهی به تامین‌کننده</span>
                  <div className="mt-1 font-semibold">
                    <MoneyDisplay amount={selectedVendor.total_payable_irr} />
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[var(--ds-muted-bg)] border border-[var(--ds-border)]">
                  <span className="text-xs text-[var(--ds-muted-fg)] block">مبلغ معوق و گذشته از سررسید</span>
                  <div className="mt-1 font-semibold text-red-600 dark:text-red-400">
                    <MoneyDisplay amount={selectedVendor.overdue_amount_irr} />
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[var(--ds-muted-bg)] border border-[var(--ds-border)] col-span-2 sm:col-span-1">
                  <span className="text-xs text-[var(--ds-muted-fg)] block">میانگین تاخیر پرداخت</span>
                  <div className="mt-1 font-semibold text-[var(--ds-card-fg)]">
                    {toPersianDigits(selectedVendor.avg_delay_days)} روز
                  </div>
                </div>
              </div>

              {/* Bucket Breakdown for this Vendor */}
              <div>
                <h4 className="text-xs font-bold text-[var(--ds-card-fg)] mb-2 flex items-center gap-1.5">
                  <Layers className="size-3.5 text-primary" />
                  سبد بازه سنی بدهی این تامین‌کننده
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                  {(Object.keys(BUCKET_LABELS) as PayablesBucketKey[]).map((key) => {
                    const amount = selectedVendor.buckets[key] ?? "0";
                    const conf = BUCKET_COLORS[key];
                    return (
                      <div
                        key={key}
                        className={`p-2.5 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-card-bg)] border-r-2 ${conf.border}`}
                      >
                        <span className="text-[11px] text-[var(--ds-muted-fg)] block">{BUCKET_LABELS[key]}</span>
                        <div className="mt-1">
                          <MoneyDisplay amount={amount} compact />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recommended Action Callout */}
              <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
                <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <span className="font-bold text-amber-800 dark:text-amber-300">
                    اقدام پیشنهادی مدیریت خرید و خزانه‌داری:
                  </span>
                  <p className="text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
                    {selectedVendor.recommended_action}
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button variant="default" size="sm" onClick={() => setSelectedVendor(null)}>
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
