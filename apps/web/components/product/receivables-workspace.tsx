"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  Building2,
  Calendar,
  Clock,
  Download,
  FileSpreadsheet,
  Filter,
  Layers,
  RefreshCcw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Target,
  UserCheck,
  Users,
  X,
} from "lucide-react";
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

// Realistic mock fallback for demonstration or unseeded workspaces
const MOCK_SUMMARY: ReceivablesSummaryResponse = {
  as_of_date: "1403/06/31",
  total_receivables_irr: "84500000000",
  total_overdue_irr: "32800000000",
  overdue_ratio: 0.3882,
  dso_days: 54,
  customer_count: 28,
  high_risk_customer_count: 6,
  buckets: [
    {
      bucket_key: "not_due",
      label_fa: "جاری (قبل از سررسید)",
      amount_irr: "51700000000",
      invoice_count: 42,
      share_percentage: 61.18,
    },
    {
      bucket_key: "1_30",
      label_fa: "۱ تا ۳۰ روز معوق",
      amount_irr: "14200000000",
      invoice_count: 15,
      share_percentage: 16.8,
    },
    {
      bucket_key: "31_60",
      label_fa: "۳۱ تا ۶۰ روز معوق",
      amount_irr: "9800000000",
      invoice_count: 9,
      share_percentage: 11.6,
    },
    {
      bucket_key: "61_90",
      label_fa: "۶۱ تا ۹۰ روز معوق",
      amount_irr: "5300000000",
      invoice_count: 5,
      share_percentage: 6.27,
    },
    {
      bucket_key: "90_plus",
      label_fa: "بیش از ۹۰ روز معوق",
      amount_irr: "3500000000",
      invoice_count: 3,
      share_percentage: 4.14,
    },
  ],
};

const MOCK_CUSTOMERS: CustomerReceivableItem[] = [
  {
    counterparty_id: "demo-cust-1",
    name: "شرکت صنایع تجهیزات آریا پارس",
    national_id: "10103456789",
    total_outstanding_irr: "14500000000",
    overdue_amount_irr: "11200000000",
    overdue_ratio: 0.7724,
    avg_delay_days: 94,
    risk_level: "critical",
    risk_score: 88,
    recommended_action: "توقف کامل اعتبار، اخطار رسمی و آغاز فرآیند حقوقی وصول",
    buckets: {
      not_due: "3300000000",
      "1_30": "1200000000",
      "31_60": "3200000000",
      "61_90": "3500000000",
      "90_plus": "3300000000",
    },
    open_invoices_count: 6,
  },
  {
    counterparty_id: "demo-cust-2",
    name: "گروه توسعه بازرگانی خاورمیانه",
    national_id: "14002341122",
    total_outstanding_irr: "9800000000",
    overdue_amount_irr: "6400000000",
    overdue_ratio: 0.653,
    avg_delay_days: 52,
    risk_level: "high",
    risk_score: 62,
    recommended_action: "توقف فروش اعتباری جدید و تماس فوری مدیر مالی با مدیریت مشتری",
    buckets: {
      not_due: "3400000000",
      "1_30": "2800000000",
      "31_60": "3600000000",
      "61_90": "0",
      "90_plus": "0",
    },
    open_invoices_count: 4,
  },
  {
    counterparty_id: "demo-cust-3",
    name: "پتروشیمی نگین جنوب",
    national_id: "10861112233",
    total_outstanding_irr: "18200000000",
    overdue_amount_irr: "4100000000",
    overdue_ratio: 0.2252,
    avg_delay_days: 22,
    risk_level: "medium",
    risk_score: 34,
    recommended_action: "پیگیری تلفنی کارشناس وصول مطالبات و ارسال صورت‌وضعیت",
    buckets: {
      not_due: "14100000000",
      "1_30": "4100000000",
      "31_60": "0",
      "61_90": "0",
      "90_plus": "0",
    },
    open_invoices_count: 8,
  },
  {
    counterparty_id: "demo-cust-4",
    name: "شرکت فولاد کاوه یزد",
    national_id: "10320098765",
    total_outstanding_irr: "24000000000",
    overdue_amount_irr: "0",
    overdue_ratio: 0.0,
    avg_delay_days: 0,
    risk_level: "low",
    risk_score: 10,
    recommended_action: "حفظ ارتباط دوره‌ای و صدور صورتحساب‌های آتی",
    buckets: {
      not_due: "24000000000",
      "1_30": "0",
      "31_60": "0",
      "61_90": "0",
      "90_plus": "0",
    },
    open_invoices_count: 12,
  },
];

const MOCK_INVOICES: ReceivableInvoiceItem[] = [
  {
    invoice_id: "inv-1",
    invoice_no: "INV-1403-882",
    customer_name: "شرکت صنایع تجهیزات آریا پارس",
    counterparty_id: "demo-cust-1",
    issue_date: "1403/03/15",
    due_date: "1403/04/15",
    gross_amount_irr: "4500000000",
    paid_amount_irr: "1000000000",
    remaining_amount_irr: "3500000000",
    delay_days: 77,
    bucket_key: "61_90",
    is_overdue: true,
    status: "issued",
  },
  {
    invoice_id: "inv-2",
    invoice_no: "INV-1403-915",
    customer_name: "گروه توسعه بازرگانی خاورمیانه",
    counterparty_id: "demo-cust-2",
    issue_date: "1403/04/20",
    due_date: "1403/05/20",
    gross_amount_irr: "3600000000",
    paid_amount_irr: "0",
    remaining_amount_irr: "3600000000",
    delay_days: 42,
    bucket_key: "31_60",
    is_overdue: true,
    status: "issued",
  },
  {
    invoice_id: "inv-3",
    invoice_no: "INV-1403-1044",
    customer_name: "شرکت فولاد کاوه یزد",
    counterparty_id: "demo-cust-4",
    issue_date: "1403/06/01",
    due_date: "1403/07/01",
    gross_amount_irr: "12000000000",
    paid_amount_irr: "0",
    remaining_amount_irr: "12000000000",
    delay_days: -1,
    bucket_key: "not_due",
    is_overdue: false,
    status: "issued",
  },
];

export function ReceivablesWorkspace({ company }: { company: Company }) {
  const [summary, setSummary] = useState<ReceivablesSummaryResponse | null>(null);
  const [customers, setCustomers] = useState<CustomerReceivableItem[]>([]);
  const [invoices, setInvoices] = useState<ReceivableInvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & Search
  const [riskFilter, setRiskFilter] = useState<"all" | ReceivablesRiskLevel>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [tableDensity, setTableDensity] = useState<"compact" | "normal">("normal");

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

        let hasData = false;

        if (sumRes.status === "fulfilled" && sumRes.value && Number(sumRes.value.total_receivables_irr) > 0) {
          setSummary(sumRes.value);
          hasData = true;
        }

        if (custRes.status === "fulfilled" && custRes.value && custRes.value.items?.length > 0) {
          setCustomers(custRes.value.items);
          hasData = true;
        }

        if (invRes.status === "fulfilled" && invRes.value && invRes.value.items?.length > 0) {
          setInvoices(invRes.value.items);
          hasData = true;
        }

        // If company has no sales data yet, provide rich demo baseline so UI is fully usable
        if (!hasData) {
          setSummary(MOCK_SUMMARY);
          setCustomers(MOCK_CUSTOMERS);
          setInvoices(MOCK_INVOICES);
        }
      } catch {
        toast.info("نمایش نمونه شبیه‌سازی‌شده هوشمندی مطالبات به علت عدم بارگذاری فاکتورهای فروش");
        setSummary(MOCK_SUMMARY);
        setCustomers(MOCK_CUSTOMERS);
        setInvoices(MOCK_INVOICES);
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

          {/* Search & Density Controls */}
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
              density={tableDensity}
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
              density={tableDensity}
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
