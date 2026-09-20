"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  Building2,
  Calendar,
  ChevronLeft,
  Clock,
  Download,
  FileSpreadsheet,
  Filter,
  Layers,
  Receipt,
  RefreshCcw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Target,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Column,
  FinancialDataTable,
  KpiMetricCard,
  MoneyDisplay,
  RiskBadge,
  StatusChip,
  toPersianDigits,
} from "@/components/ui/financial";

import { api } from "@/lib/product-api";
import type {
  AgingBucketDetail,
  Company,
  CustomerReceivableItem,
  CustomersReceivablesResponse,
  InvoicesReceivablesResponse,
  ReceivableInvoiceItem,
  ReceivablesBucketKey,
  ReceivablesRiskLevel,
  ReceivablesSummaryResponse,
} from "@/lib/product-types";

const BUCKET_COLORS: Record<ReceivablesBucketKey, { bar: string; badge: string; border: string }> = {
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

const BUCKET_LABELS: Record<ReceivablesBucketKey, string> = {
  not_due: "جاری (قبل از سررسید)",
  "1_30": "۱ تا ۳۰ روز معوق",
  "31_60": "۳۱ تا ۶۰ روز معوق",
  "61_90": "۶۱ تا ۹۰ روز معوق",
  "90_plus": "بیش از ۹۰ روز معوق",
};

export function ReceivablesWorkspace({ company }: { company: Company }) {
  const [summary, setSummary] = useState<ReceivablesSummaryResponse | null>(null);
  const [customers, setCustomers] = useState<CustomerReceivableItem[]>([]);
  const [invoices, setInvoices] = useState<ReceivableInvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & Search
  const [riskFilter, setRiskFilter] = useState<"all" | ReceivablesRiskLevel>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Selected customer for detail drawer
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerReceivableItem | null>(null);

  const loadData = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      try {
        const [sumRes, custRes, invRes] = await Promise.allSettled([
          api<ReceivablesSummaryResponse>(`/companies/${company.id}/receivables/summary`),
          api<CustomersReceivablesResponse>(`/companies/${company.id}/receivables/customers`),
          api<InvoicesReceivablesResponse>(`/companies/${company.id}/receivables/invoices`),
        ]);

        if (sumRes.status === "fulfilled" && sumRes.value && Number(sumRes.value.total_receivables_irr) > 0) {
          setSummary(sumRes.value);
        } else {
          setSummary(null);
        }

        if (custRes.status === "fulfilled" && custRes.value && custRes.value.items?.length > 0) {
          setCustomers(custRes.value.items);
        } else {
          setCustomers([]);
        }

        if (invRes.status === "fulfilled" && invRes.value && invRes.value.items?.length > 0) {
          setInvoices(invRes.value.items);
        } else {
          setInvoices([]);
        }
      } catch {
        setSummary(null);
        setCustomers([]);
        setInvoices([]);
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

  // Filtered customers
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const matchesRisk = riskFilter === "all" || c.risk_level === riskFilter;
      const matchesSearch =
        !searchQuery.trim() ||
        c.name.includes(searchQuery.trim()) ||
        (c.national_id && c.national_id.includes(searchQuery.trim()));
      return matchesRisk && matchesSearch;
    });
  }, [customers, riskFilter, searchQuery]);

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchesSearch =
        !searchQuery.trim() ||
        inv.invoice_no.includes(searchQuery.trim()) ||
        inv.customer_name.includes(searchQuery.trim());
      return matchesSearch;
    });
  }, [invoices, searchQuery]);

  // Table Columns for Customers
  const customerColumns: Column<CustomerReceivableItem>[] = [
    {
      key: "name",
      header: "مشتری / طرف حساب",
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
      header: "سطح ریسک اعتباری",
      align: "center",
      render: (row) => <RiskBadge level={row.risk_level} score={row.risk_score} showIcon size="sm" />,
    },
    {
      key: "total_outstanding_irr",
      header: "کل مانده بدهی",
      numeric: true,
      align: "left",
      render: (row) => <MoneyDisplay amount={row.total_outstanding_irr} compact />,
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
          className={`font-mono text-xs font-semibold ${
            row.overdue_ratio > 0.5 ? "text-red-600 dark:text-red-400" : "text-[var(--ds-card-fg)]"
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
      header: "اقدام پیشنهادی وصول",
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
          onClick={() => setSelectedCustomer(row)}
        >
          سبد سنی
        </Button>
      ),
    },
  ];

  // Table Columns for Invoices
  const invoiceColumns: Column<ReceivableInvoiceItem>[] = [
    {
      key: "invoice_no",
      header: "شماره فاکتور",
      render: (row) => <span className="font-mono text-xs font-semibold">{toPersianDigits(row.invoice_no)}</span>,
    },
    {
      key: "customer_name",
      header: "مشتری",
      render: (row) => <span className="font-medium text-xs">{row.customer_name}</span>,
    },
    {
      key: "due_date",
      header: "تاریخ سررسید",
      align: "center",
      render: (row) => <span className="text-xs text-[var(--ds-muted-fg)]">{toPersianDigits(row.due_date)}</span>,
    },
    {
      key: "delay_days",
      header: "وضعیت تاخیر",
      align: "center",
      render: (row) => {
        if (!row.is_overdue) {
          return (
            <Badge variant="outline" className="text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200">
              سررسید جاری
            </Badge>
          );
        }
        return (
          <Badge variant="outline" className="text-[11px] bg-red-50 text-red-700 border-red-200 font-mono">
            {toPersianDigits(row.delay_days)} روز تاخیر
          </Badge>
        );
      },
    },
    {
      key: "bucket_key",
      header: "بازه سنی",
      align: "center",
      render: (row) => {
        const conf = BUCKET_COLORS[row.bucket_key];
        return (
          <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${conf.badge}`}>
            {BUCKET_LABELS[row.bucket_key]}
          </span>
        );
      },
    },
    {
      key: "gross_amount_irr",
      header: "مبلغ فاکتور",
      numeric: true,
      align: "left",
      render: (row) => <MoneyDisplay amount={row.gross_amount_irr} compact />,
    },
    {
      key: "remaining_amount_irr",
      header: "مانده تسویه‌نشده",
      numeric: true,
      align: "left",
      render: (row) => (
        <MoneyDisplay
          amount={row.remaining_amount_irr}
          compact
          direction={row.is_overdue ? "negative" : "neutral"}
        />
      ),
    },
  ];

  if (!loading && !summary && customers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--ds-border)] bg-[var(--ds-card)] p-12 text-center space-y-4 min-h-[380px]" dir="rtl">
        <div className="grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <Receipt className="size-7 text-primary" />
        </div>
        <div className="max-w-md space-y-1">
          <h3 className="text-lg font-bold text-foreground">هنوز مطالبه یا فاکتور فروشی برای این شرکت ثبت نشده است</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            برای پایش سن بدهکاران تجاری و ریسک وصول، فاکتورهای فروش را از بخش بارگذاری وارد کنید.
          </p>
        </div>
        <Link href={`/companies/${company.id}/imports`}>
          <Button className="gap-2">
            رفتن به بارگذاری داده‌های مالی
            <ChevronLeft className="size-4" />
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[var(--ds-border)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-bold tracking-tight text-[var(--ds-card-fg)]">
              هوشمندی و تحلیل سنی مطالبات
            </h1>
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-xs">
              کنترل وصول و ریسک اعتباری
            </Badge>
          </div>
          <p className="text-xs lg:text-sm text-[var(--ds-muted-fg)] mt-1">
            پایش ریسک مشتریان، تحلیل ۵ بازه سنی مطالبات و پیشنهاد اقدامات حقوقی و اعتباری
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

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiMetricCard
          title="کل مطالبات باز (Receivables)"
          value={summary?.total_receivables_irr ?? 0}
          loading={loading}
          subtext={`${toPersianDigits(summary?.customer_count ?? 0)} مشتری دارای مانده حساب`}
          icon={Building2}
        />
        <KpiMetricCard
          title="مطالبات معوق (Overdue)"
          value={summary?.total_overdue_irr ?? 0}
          loading={loading}
          status={Number(summary?.total_overdue_irr ?? 0) > 0 ? "critical" : "normal"}
          subtext={`${toPersianDigits(summary?.high_risk_customer_count ?? 0)} مشتری در وضعیت ریسک بالا`}
          icon={ShieldAlert}
        />
        <KpiMetricCard
          title="نسبت معوقات (Overdue Ratio)"
          value={`${toPersianDigits(((summary?.overdue_ratio ?? 0) * 100).toFixed(1))}%`}
          unit=""
          currency=""
          loading={loading}
          status={(summary?.overdue_ratio ?? 0) > 0.3 ? "warning" : "normal"}
          subtext="از کل سبد بدهکاران تجاری"
          icon={Target}
        />
        <KpiMetricCard
          title="دوره وصول مطالبات (DSO)"
          value={`${toPersianDigits(summary?.dso_days ?? 0)} روز`}
          unit=""
          currency=""
          loading={loading}
          subtext="میانگین زمان نقدشوندگی فاکتورها"
          icon={Clock}
        />
      </div>

      {/* Aging Distribution Visual Card */}
      <Card className="border-[var(--ds-border)] bg-[var(--ds-card)] shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Layers className="size-4 text-primary" />
                توزیع سنی مطالبات (Aging Schedule)
              </CardTitle>
              <CardDescription className="text-xs text-[var(--ds-muted-fg)] mt-0.5">
                تفکیک مانده بدهی بر اساس تاخیر از تاریخ سررسید رسمی فاکتورها
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
                    <span>{toPersianDigits(b.invoice_count)} فاکتور</span>
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

      {/* Tabs: Customer Credit Risk vs Invoices */}
      <Tabs defaultValue="customers" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <TabsList className="h-10 bg-[var(--ds-muted-bg)] p-1">
            <TabsTrigger value="customers" className="text-xs sm:text-sm gap-1.5">
              <Users className="size-3.5" />
              <span>ریسک اعتباری مشتریان ({toPersianDigits(customers.length)})</span>
            </TabsTrigger>
            <TabsTrigger value="invoices" className="text-xs sm:text-sm gap-1.5">
              <FileSpreadsheet className="size-3.5" />
              <span>فاکتورهای باز و معوق ({toPersianDigits(invoices.length)})</span>
            </TabsTrigger>
          </TabsList>

          {/* Search */}
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-[var(--ds-muted-fg)]" />
              <Input
                placeholder="جستجوی مشتری یا شماره..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-8 text-xs h-9 bg-[var(--ds-card)]"
              />
            </div>
          </div>
        </div>

        {/* Tab 1: Customers */}
        <TabsContent value="customers" className="space-y-4">
          {/* Risk Filter Chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-[var(--ds-muted-fg)] ml-2">فیلتر ریسک:</span>
            <Button
              variant={riskFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setRiskFilter("all")}
              className="h-7 text-xs rounded-full"
            >
              همه ({toPersianDigits(customers.length)})
            </Button>
            <Button
              variant={riskFilter === "critical" ? "default" : "outline"}
              size="sm"
              onClick={() => setRiskFilter("critical")}
              className={`h-7 text-xs rounded-full ${
                riskFilter !== "critical" ? "text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" : ""
              }`}
            >
              بحرانی ({toPersianDigits(customers.filter((c) => c.risk_level === "critical").length)})
            </Button>
            <Button
              variant={riskFilter === "high" ? "default" : "outline"}
              size="sm"
              onClick={() => setRiskFilter("high")}
              className={`h-7 text-xs rounded-full ${
                riskFilter !== "high" ? "text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30" : ""
              }`}
            >
              بالا ({toPersianDigits(customers.filter((c) => c.risk_level === "high").length)})
            </Button>
            <Button
              variant={riskFilter === "medium" ? "default" : "outline"}
              size="sm"
              onClick={() => setRiskFilter("medium")}
              className="h-7 text-xs rounded-full"
            >
              متوسط ({toPersianDigits(customers.filter((c) => c.risk_level === "medium").length)})
            </Button>
            <Button
              variant={riskFilter === "low" ? "default" : "outline"}
              size="sm"
              onClick={() => setRiskFilter("low")}
              className="h-7 text-xs rounded-full"
            >
              کم‌ریسک ({toPersianDigits(customers.filter((c) => c.risk_level === "low").length)})
            </Button>
          </div>

          {/* Customers Table */}
          <Card className="border-[var(--ds-border)] bg-[var(--ds-card)] overflow-hidden">
            <FinancialDataTable
              data={filteredCustomers}
              columns={customerColumns}
              keyExtractor={(row) => row.counterparty_id}
              density="compact"
              emptyMessage="هیچ مشتری با معیارهای جستجو یافت نشد."
            />
          </Card>
        </TabsContent>

        {/* Tab 2: Invoices */}
        <TabsContent value="invoices" className="space-y-4">
          <Card className="border-[var(--ds-border)] bg-[var(--ds-card)] overflow-hidden">
            <FinancialDataTable
              data={filteredInvoices}
              columns={invoiceColumns}
              keyExtractor={(row) => row.invoice_id}
              density="compact"
              emptyMessage="هیچ فاکتوری یافت نشد."
            />
          </Card>
        </TabsContent>
      </Tabs>

      {/* Customer Aging Drawer / Detail Dialog */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl border-[var(--ds-border)] bg-[var(--ds-card)] shadow-2xl animate-in fade-in-50 zoom-in-95">
            <CardHeader className="flex flex-row items-start justify-between pb-3 border-b border-[var(--ds-border)]">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg font-bold">{selectedCustomer.name}</CardTitle>
                  <RiskBadge level={selectedCustomer.risk_level} score={selectedCustomer.risk_score} size="sm" />
                </div>
                <CardDescription className="text-xs mt-1">
                  شناسه ملی: {toPersianDigits(selectedCustomer.national_id ?? "—")} | تعداد فاکتور باز:{" "}
                  {toPersianDigits(selectedCustomer.open_invoices_count)}
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 rounded-full"
                onClick={() => setSelectedCustomer(null)}
              >
                <X className="size-4" />
              </Button>
            </CardHeader>

            <CardContent className="space-y-5 pt-4">
              {/* Financial Balance Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-[var(--ds-muted-bg)] border border-[var(--ds-border)]">
                  <span className="text-xs text-[var(--ds-muted-fg)] block">کل مانده بدهی</span>
                  <div className="mt-1 font-semibold">
                    <MoneyDisplay amount={selectedCustomer.total_outstanding_irr} />
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[var(--ds-muted-bg)] border border-[var(--ds-border)]">
                  <span className="text-xs text-[var(--ds-muted-fg)] block">مبلغ معوق</span>
                  <div className="mt-1 font-semibold text-red-600 dark:text-red-400">
                    <MoneyDisplay amount={selectedCustomer.overdue_amount_irr} />
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[var(--ds-muted-bg)] border border-[var(--ds-border)] col-span-2 sm:col-span-1">
                  <span className="text-xs text-[var(--ds-muted-fg)] block">میانگین روزهای تاخیر</span>
                  <div className="mt-1 font-semibold text-[var(--ds-card-fg)]">
                    {toPersianDigits(selectedCustomer.avg_delay_days)} روز
                  </div>
                </div>
              </div>

              {/* Bucket Breakdown for this Customer */}
              <div>
                <h4 className="text-xs font-bold text-[var(--ds-card-fg)] mb-2 flex items-center gap-1.5">
                  <Layers className="size-3.5 text-primary" />
                  سبد بازه سنی بدهی این مشتری
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                  {(Object.keys(BUCKET_LABELS) as ReceivablesBucketKey[]).map((key) => {
                    const amount = selectedCustomer.buckets[key] ?? "0";
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
                    اقدام پیشنهادی جهت کنترل ریسک اعتباری:
                  </span>
                  <p className="text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
                    {selectedCustomer.recommended_action}
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button variant="default" size="sm" onClick={() => setSelectedCustomer(null)}>
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
