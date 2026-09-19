"use client";

import { useState } from "react";
import {
  BarChart3,
  Bell,
  Building2,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Download,
  FileCheck2,
  Gauge,
  LayoutDashboard,
  Menu,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  WalletCards,
  Receipt,
  Copy,
  Layers,
  SlidersHorizontal,
  CheckCircle2,
  MoreHorizontal,
  FileText,
  Send,
  Trash2,
  Info,
} from "lucide-react";
import { toast, Toaster } from "sonner";

import { CashflowChart } from "@/components/design-system/cashflow-chart";
import { ThemeToggle } from "@/components/design-system/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Field, FieldLabel, FieldDescription, FieldError } from "@/components/ui/field";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  type TableDensity,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import {
  MoneyDisplay,
  RiskBadge,
  StatusChip,
  EvidenceSourceTag,
  KpiMetricCard,
  FinancialHealthBanner,
  FinancialDataTable,
  EvidenceDrawer,
  ReviewActionBar,
  FindingEvidenceDetail,
  Column,
} from "@/components/ui/financial";

const navigation = [
  { label: "داشبورد مدیریت", icon: LayoutDashboard, active: true },
  { label: "کنترل و تطبیق", icon: FileCheck2 },
  { label: "هوشمندی مطالبات", icon: Receipt },
  { label: "جریان نقدینگی", icon: BarChart3 },
  { label: "مرکز بستن دوره", icon: Gauge, count: "۳" },
];

interface SampleFindingRow {
  id: string;
  ruleCode: string;
  title: string;
  riskLevel: "critical" | "high" | "medium" | "low";
  status: "potential_match" | "amount_mismatch" | "duplicate" | "unmatched_bank" | "confirmed" | "resolved";
  amount: number;
  priorityScore: number;
  source: string;
  date: string;
  rawFinding: FindingEvidenceDetail;
}

const sampleFindings: SampleFindingRow[] = [
  {
    id: "f-1",
    ruleCode: "DUP-PAY-003",
    title: "احتمال پرداخت تکراری به تأمین‌کننده",
    riskLevel: "critical",
    status: "potential_match",
    amount: 850000000,
    priorityScore: 92,
    source: "بانک ملت + سند ۷۰۴",
    date: "۱۴۰۵/۰۶/۱۸",
    rawFinding: {
      id: "f-1",
      title: "احتمال پرداخت تکراری به شرکت بهداد تجارت",
      riskLevel: "critical",
      status: "potential_match",
      priorityScore: 92,
      amount: 850000000,
      ratioToRevenue: 0.26,
      ruleCode: "DUP-PAY-003",
      ruleDescription: "شناسایی دو خروجی بانکی با مبلغ یکسان و فاصله زمانی کمتر از ۲۴ ساعت به یک حساب متناظر",
      factors: {
        impact: { score: 95, weight: 0.4, reason: "مبلغ ۸۵۰ میلیون ریال دارای اثر نقدینگی آنی" },
        materiality: { score: 90, weight: 0.25, reason: "۲۶٪ درآمد ماهانه دوره" },
        confidence: { score: 92, weight: 0.2, reason: "تطابق کامل شبا و مبلغ بایت‌به‌بایت" },
        urgency: { score: 88, weight: 0.15, reason: "عدم تطبیق در آستانه بستن دوره مالی" },
      },
      evidenceItems: [
        {
          id: "ev-1",
          sourceType: "bank",
          title: "تراکنش بانکی اول — بانک ملت",
          description: "واریز به حساب شبا IR5401... به مبلغ ۸۵۰٬۰۰۰٬۰۰۰ ریال با کد پیگیری ۷۸۴۱۲",
          fileName: "bank-mellat-1405-06.xlsx",
          sheetName: "گردش حساب",
          rowNumber: 142,
          sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        },
        {
          id: "ev-2",
          sourceType: "bank",
          title: "تراکنش بانکی دوم — بانک ملت (۱۷ ساعت بعد)",
          description: "واریز مجدد به همان شبا با شناسه واریز مشابه به مبلغ ۸۵۰٬۰۰۰٬۰۰۰ ریال",
          fileName: "bank-mellat-1405-06.xlsx",
          sheetName: "گردش حساب",
          rowNumber: 189,
          sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        },
        {
          id: "ev-3",
          sourceType: "accounting",
          title: "سند حسابداری معادل در سپیدار",
          description: "فقط یک آرتیکل بدهکار در سند ۷۰۴ ثبت شده و سند برای تراکنش دوم وجود ندارد.",
          fileName: "gl-vouchers-1405.csv",
          rowNumber: 704,
        },
      ],
    },
  },
  {
    id: "f-2",
    ruleCode: "REC-MIS-001",
    title: "مغایرت مبلغ فاکتور فروش با واریز بانکی",
    riskLevel: "high",
    status: "amount_mismatch",
    amount: 140000000,
    priorityScore: 78,
    source: "فاکتور ۱۱۴ + پاسارگاد",
    date: "۱۴۰۵/۰۶/۱۹",
    rawFinding: {
      id: "f-2",
      title: "مغایرت مبلغ فاکتور ۱۱۴ با صورت‌حساب بانکی",
      riskLevel: "high",
      status: "amount_mismatch",
      priorityScore: 78,
      amount: 140000000,
      ratioToRevenue: 0.04,
      ruleCode: "REC-MIS-001",
      ruleDescription: "مبلغ واریزی بانک پاسارگاد ۱۴۰ میلیون ریال کمتر از مبلغ ناخالص فاکتور فروش است",
      factors: {
        impact: { score: 75, weight: 0.4, reason: "کسری وصول در مطالبات جاری" },
        materiality: { score: 70, weight: 0.25, reason: "۴٪ درآمد دوره" },
        confidence: { score: 85, weight: 0.2, reason: "تطابق شماره پیگیری فاکتور در شرح واریز" },
        urgency: { score: 82, weight: 0.15, reason: "نیاز به بررسی کسر سپرده بیمه یا مالیات تکلیفی" },
      },
      evidenceItems: [
        {
          id: "ev-4",
          sourceType: "sales",
          title: "فاکتور فروش رسمی",
          description: "فاکتور شماره ۱۱۴ به ارزش ۱٬۴۰۰٬۰۰۰٬۰۰۰ ریال به طرف‌حساب شرکت پارس",
          fileName: "sales-invoices-1405.xlsx",
          rowNumber: 114,
        },
        {
          id: "ev-5",
          sourceType: "bank",
          title: "واریز بانکی پاسارگاد",
          description: "واریز ۱٬۲۶۰٬۰۰۰٬۰۰۰ ریال (۱۰٪ کسری احتمالی بیمه ماده ۳۸)",
          fileName: "bank-pasargad-1405.xlsx",
          rowNumber: 56,
        },
      ],
    },
  },
  {
    id: "f-3",
    ruleCode: "BNK-UNM-002",
    title: "تراکنش بانکی فاقد سند در حسابداری",
    riskLevel: "medium",
    status: "unmatched_bank",
    amount: 62000000,
    priorityScore: 61,
    source: "بانک سامان",
    date: "۱۴۰۵/۰۶/۲۰",
    rawFinding: {
      id: "f-3",
      title: "تراکنش بانکی ۶۲ میلیون ریال بدون سند دوبل",
      riskLevel: "medium",
      status: "unmatched_bank",
      priorityScore: 61,
      amount: 62000000,
      ratioToRevenue: 0.02,
      ruleCode: "BNK-UNM-002",
      ruleDescription: "واریز شاپرکی بدون ثبت سند شناسایی درآمد در دفاتر",
      factors: {
        impact: { score: 60, weight: 0.4, reason: "مبلغ ۶۲ میلیون ریال" },
        materiality: { score: 55, weight: 0.25, reason: "۲٪ درآمد دوره" },
        confidence: { score: 70, weight: 0.2, reason: "عدم وجود رکورد متناظر در بازه ±۵ روز" },
        urgency: { score: 60, weight: 0.15, reason: "پیگیری با متصدی فروشگاه اینترنتی" },
      },
      evidenceItems: [
        {
          id: "ev-6",
          sourceType: "bank",
          title: "صورت‌حساب بانک سامان",
          description: "واریز تجمیعی دستگاه پوز / درگاه پرداخت",
          fileName: "bank-saman-1405.csv",
          rowNumber: 88,
        },
      ],
    },
  },
];

function BrandMark() {
  return (
    <span
      className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--ds-foreground)] text-[var(--ds-background)] shadow-[var(--ds-shadow-glow)]"
      aria-hidden="true"
    >
      <span className="absolute inset-0 bg-[linear-gradient(135deg,transparent_25%,var(--ds-primary)_140%)]" />
      <BarChart3 className="relative size-5" />
    </span>
  );
}

export function Showcase() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState<FindingEvidenceDetail | null>(null);
  const [tableDensity, setTableDensity] = useState<TableDensity>("normal");
  const [labTableDensity, setLabTableDensity] = useState<TableDensity>("compact");
  const [labSelectedId, setLabSelectedId] = useState<string>("DOC-7041");
  const [selectedRowCount, setSelectedRowCount] = useState(1);
  const [isBtnLoading, setIsBtnLoading] = useState(false);
  const [isInputError, setIsInputError] = useState(false);

  const columns: Column<SampleFindingRow>[] = [
    {
      key: "ruleCode",
      header: "کد قاعده",
      width: "120px",
      render: (row) => <span className="font-mono text-xs font-bold text-muted-foreground">{row.ruleCode}</span>,
    },
    {
      key: "title",
      header: "عنوان یافته و ریسک شناسایی‌شده",
      render: (row) => (
        <div className="flex items-center gap-2">
          <RiskBadge level={row.riskLevel} size="sm" />
          <strong className="text-xs font-bold text-foreground truncate max-w-xs">{row.title}</strong>
        </div>
      ),
    },
    {
      key: "status",
      header: "وضعیت تطبیق",
      width: "160px",
      render: (row) => <StatusChip status={row.status} size="sm" />,
    },
    {
      key: "source",
      header: "مبدا داده",
      render: (row) => <EvidenceSourceTag source="bank" label={row.source} size="sm" />,
    },
    {
      key: "amount",
      header: "مبلغ درگیر",
      numeric: true,
      render: (row) => <MoneyDisplay amount={row.amount} currency="ریال" size="sm" direction="negative" />,
    },
    {
      key: "priorityScore",
      header: "امتیاز اولویت",
      numeric: true,
      render: (row) => <RiskBadge level={row.riskLevel} score={row.priorityScore} size="sm" showIcon={false} />,
    },
  ];

  return (
    <TooltipProvider delayDuration={250}>
      <div className="ds-root ds-grid-bg min-h-screen bg-[var(--ds-background)] text-[var(--ds-foreground)] font-sans antialiased">
        <a
          href="#design-content"
          className="ds-focus fixed start-4 top-4 z-[70] -translate-y-24 rounded-lg bg-[var(--ds-foreground)] px-4 py-2 text-sm text-[var(--ds-background)] focus:translate-y-0"
        >
          پرش به محتوای اصلی
        </a>

        <div className="flex min-h-screen">
          {mobileOpen && (
            <Button
              className="fixed inset-0 z-30 bg-black/40 lg:hidden"
              aria-label="بستن منو"
              onClick={() => setMobileOpen(false)}
            />
          )}

          {/* Main Sidebar */}
          <aside
            className={cn(
              "ds-glass fixed inset-y-0 start-0 z-40 flex flex-col border-e border-[var(--ds-border)] transition-[width,transform] duration-300 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
              collapsed ? "w-[84px]" : "w-[280px]",
              mobileOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
            )}
          >
            <div className="flex h-20 items-center gap-3 border-b border-[var(--ds-border)] px-5">
              <BrandMark />
              {!collapsed && (
                <div className="min-w-0">
                  <strong className="block truncate text-base font-extrabold">دیدبان مالی</strong>
                  <span className="block truncate text-xs text-[var(--ds-foreground-faint)]">
                    Financial Intelligence OS
                  </span>
                </div>
              )}
            </div>

            <nav className="flex-1 space-y-1.5 overflow-y-auto p-3" aria-label="ناوبری اصلی">
              {!collapsed && (
                <p className="px-3 pb-2 pt-3 text-xs font-bold text-[var(--ds-foreground-faint)]">فضای تحلیل و کنترل</p>
              )}
              {navigation.map((item) => (
                <Tooltip key={item.label}>
                  <TooltipTrigger asChild>
                    <Button
                      className={cn(
                        "ds-focus flex min-h-11 w-full items-center rounded-xl text-sm font-bold transition-colors",
                        collapsed ? "justify-center px-0" : "gap-3 px-3",
                        item.active
                          ? "bg-[var(--ds-accent-soft)] text-[var(--ds-accent)]"
                          : "text-[var(--ds-foreground-soft)] hover:bg-[var(--ds-muted)] hover:text-[var(--ds-foreground)]"
                      )}
                    >
                      <item.icon className="size-[18px] shrink-0" />
                      <span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>
                      {item.count && !collapsed && (
                        <Badge variant="danger" className="ms-auto">
                          {item.count}
                        </Badge>
                      )}
                    </Button>
                  </TooltipTrigger>
                  {collapsed && <TooltipContent side="left">{item.label}</TooltipContent>}
                </Tooltip>
              ))}
            </nav>

            <div className="border-t border-[var(--ds-border)] p-3">
              <Button
                className={cn(
                  "ds-focus flex min-h-12 w-full items-center rounded-xl bg-[var(--ds-muted)] transition-[background-color,transform] duration-200 active:scale-[0.96]",
                  collapsed ? "justify-center" : "gap-3 px-3"
                )}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--ds-accent-soft)] text-xs font-extrabold text-[var(--ds-accent)]">
                  مت
                </span>
                {!collapsed && (
                  <span className="min-w-0 text-start">
                    <strong className="block truncate text-sm">مهدی تهرانی</strong>
                    <small className="block truncate text-xs text-[var(--ds-foreground-faint)]">مدیر ارشد مالی</small>
                  </span>
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="mt-2 hidden w-full lg:flex"
                aria-label={collapsed ? "بازکردن نوار کناری" : "جمع‌کردن نوار کناری"}
                onClick={() => setCollapsed(!collapsed)}
              >
                {collapsed ? <ChevronsLeft /> : <ChevronsRight />}
              </Button>
            </div>
          </aside>

          {/* Main Content Area */}
          <div className="min-w-0 flex-1">
            {/* Top Navbar */}
            <header className="ds-glass sticky top-0 z-20 flex h-20 items-center gap-3 border-b border-[var(--ds-border)] px-4 md:px-6 xl:px-8">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="بازکردن منو"
                onClick={() => setMobileOpen(true)}
              >
                <Menu />
              </Button>
              <div className="hidden min-w-0 md:block">
                <p className="text-xs text-[var(--ds-foreground-faint)]">سیستم طراحی پایه / ویترین کامپوننت‌های مالی</p>
                <h1 className="truncate text-base font-extrabold">مرکز هوشمندی و کنترل مالی</h1>
              </div>

              <div className="relative me-auto hidden w-full max-w-sm lg:block">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ds-foreground-faint)]" />
                <Input
                  className="ps-10 pe-14"
                  aria-label="جست‌وجوی سراسری"
                  placeholder="جست‌وجوی سند، ردیف بانکی یا مغایرت…"
                />
                <kbd className="absolute end-3 top-1/2 -translate-y-1/2 rounded-md border border-[var(--ds-border)] px-1.5 py-0.5 text-xs text-[var(--ds-foreground-faint)]">
                  ⌘ K
                </kbd>
              </div>

              <ThemeToggle />
              <Button variant="outline" size="icon" aria-label="اعلان‌ها" className="relative">
                <Bell />
                <span className="absolute end-2 top-2 size-1.5 rounded-full bg-[var(--ds-danger)]" />
              </Button>

              <Select defaultValue="arya" dir="rtl">
                <SelectTrigger className="hidden w-56 md:flex" aria-label="انتخاب شرکت">
                  <Building2 className="size-4 text-[var(--ds-primary)]" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="arya">شرکت بازرگانی پارس آریا</SelectItem>
                  <SelectItem value="dorsa">صنایع تولیدی درسا</SelectItem>
                </SelectContent>
              </Select>
            </header>

            <main id="design-content" className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6 xl:p-8">
              {/* Hero Banner */}
              <section
                className="relative overflow-hidden rounded-[var(--ds-p-radius-xl)] border border-[var(--ds-border)] bg-[var(--ds-background-raised)] p-6 shadow-[var(--ds-shadow-md)] md:p-8"
                aria-labelledby="hero-title"
              >
                <div className="pointer-events-none absolute -start-20 -top-28 size-72 rounded-full bg-[var(--ds-primary)] opacity-[.12] blur-3xl" />
                <div className="pointer-events-none absolute -bottom-28 end-0 size-80 rounded-full bg-[var(--ds-accent)] opacity-[.12] blur-3xl" />
                <div className="relative flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
                  <div className="max-w-3xl">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <Badge variant="accent">
                        <Sparkles /> نسخه پایه سیستم طراحی ۱.۰
                      </Badge>
                      <Badge variant="outline">RTL Native</Badge>
                      <Badge variant="outline">Light + Dark</Badge>
                    </div>
                    <h2
                      id="hero-title"
                      className="text-[length:var(--ds-font-display)] font-extrabold leading-[1.35] tracking-[-.035em]"
                    >
                      تصمیم مالی، با{" "}
                      <span className="bg-[linear-gradient(90deg,var(--ds-primary),var(--ds-accent))] bg-clip-text text-transparent">
                        وضوح عملیاتی
                      </span>
                      .
                    </h2>
                    <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--ds-foreground-soft)] md:text-base">
                      نمای زنده سیستم طراحی دیدبان مالی؛ استانداردهای بصری و تعاملی برای داشبوردها، تطبیق تراکنش‌ها، کشف ریسک و شواهد مالی.
                    </p>
                  </div>
                </div>
              </section>

              {/* Section 1: 2-Dimensional Health Banner */}
              <FinancialHealthBanner
                financialHealth="attention"
                dataQuality="limited"
                reliabilityScore={88}
                actionableFindingsCount={3}
                periodLabel="شهریور ۱۴۰۵"
              />

              {/* Section 2: Executive KPI Metrics (Tremor / Ramp style) */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="شاخص‌های کلیدی مدیریت مالی">
                <KpiMetricCard
                  title="موجودی نقد قابل اتکا"
                  value={12850000000}
                  currency="ریال"
                  icon={WalletCards}
                  trend={{ value: "+۸٫۴٪", label: "نسبت به ماه قبل", direction: "up", isPositive: true }}
                  coveragePercent={100}
                />
                <KpiMetricCard
                  title="درآمد ناخالص عملیاتی"
                  value={327960000}
                  currency="ریال"
                  icon={TrendingUp}
                  trend={{ value: "+۱۲٫۱٪", label: "رشد فروش", direction: "up", isPositive: true }}
                  coveragePercent={100}
                />
                <KpiMetricCard
                  title="مطالبات در سررسید گذشته (>۹۰ روز)"
                  value={140000000}
                  currency="ریال"
                  icon={TriangleAlert}
                  status="warning"
                  trend={{ value: "+۱۵٪", label: "افزایش ریسک وصول", direction: "up", isPositive: false }}
                  coveragePercent={85}
                />
                <KpiMetricCard
                  title="حساب‌های پرداختنی تجاری"
                  value={null}
                  status="limited"
                  limitedReason="تفکیک‌نشده از سایر بدهی‌های جاری در دفاتر"
                  icon={Receipt}
                />
              </div>

              {/* Section 3: Visual Cashflow & Controls */}
              <section className="grid gap-4 xl:grid-cols-[1.45fr_.75fr]">
                <Card>
                  <CardHeader className="flex-row items-start justify-between">
                    <div>
                      <CardTitle>جریان نقدینگی و تحلیل واریز/برداشت</CardTitle>
                      <CardDescription>مقایسه قطعی گردش بانک در برابر اسناد حسابداری — میلیارد ریال</CardDescription>
                    </div>
                    <div className="flex gap-3 text-xs text-[var(--ds-foreground-soft)]">
                      <span className="flex items-center gap-1.5">
                        <i className="size-2 rounded-full bg-[var(--ds-primary)]" />
                        ورودی قطعی
                      </span>
                      <span className="flex items-center gap-1.5">
                        <i className="size-2 rounded-full bg-[var(--ds-accent)]" />
                        خروجی کنترل‌شده
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CashflowChart />
                  </CardContent>
                </Card>

                <Card className="overflow-hidden">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <span className="grid size-11 place-items-center rounded-xl bg-[var(--ds-accent-soft)] text-[var(--ds-accent)]">
                        <ShieldCheck className="size-5" />
                      </span>
                      <StatusChip status="ready" label="کنترل‌ها فعال" />
                    </div>
                    <CardTitle className="mt-3">آمادگی بستن دوره (Closing Readiness)</CardTitle>
                    <CardDescription>پیشرفت چک‌لیست بستن حساب‌های پایان دوره</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div>
                      <div className="mb-2 flex justify-between text-sm">
                        <span>تطبیق دفاتر و ۳ حساب بانکی</span>
                        <strong className="font-mono">۸۸٪</strong>
                      </div>
                      <Progress value={88} />
                    </div>
                    <div>
                      <div className="mb-2 flex justify-between text-sm">
                        <span>تراز اسناد دوبل و آرتیکل‌ها</span>
                        <strong className="font-mono">۱۰۰٪</strong>
                      </div>
                      <Progress value={100} />
                    </div>
                    <div>
                      <div className="mb-2 flex justify-between text-sm">
                        <span>کنترل فاکتورهای سامانه مودیان</span>
                        <strong className="font-mono">۹۲٪</strong>
                      </div>
                      <Progress value={92} />
                    </div>
                    <div className="rounded-xl border border-[var(--ds-border)] bg-[var(--ds-muted)] p-3 text-xs leading-relaxed text-[var(--ds-foreground-soft)]">
                      <Sparkles className="me-1.5 inline size-4 text-[var(--ds-accent)]" />
                      <strong>Evidence before conclusion:</strong> تمام نتایج مستقیماً تا ردیف شیت اکسل و فایل اولیه
                      متصل و قابل ردیابی هستند.
                    </div>
                  </CardContent>
                </Card>
              </section>

              {/* Section 4: High Density Financial Data Table with Row Drilldown */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-extrabold text-foreground">
                      صف یافته‌های نیازمند اقدام و مغایرت‌ها
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      برای مشاهده زنجیره شواهد (Lineage) و ثبت تصمیم مشاور، روی هر ردیف کلیک کنید.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={tableDensity === "compact" ? "default" : "outline"}
                      className="text-xs gap-1.5"
                      onClick={() => setTableDensity("compact")}
                    >
                      <SlidersHorizontal className="size-3.5" />
                      تراکم فشرده (حسابداران)
                    </Button>
                    <Button
                      size="sm"
                      variant={tableDensity === "normal" ? "default" : "outline"}
                      className="text-xs gap-1.5"
                      onClick={() => setTableDensity("normal")}
                    >
                      <Layers className="size-3.5" />
                      تراکم استاندارد (مدیران)
                    </Button>
                  </div>
                </div>

                <FinancialDataTable
                  data={sampleFindings}
                  columns={columns}
                  keyExtractor={(row) => row.id}
                  density={tableDensity}
                  tableAriaLabel="نمونه جدول تطبیق تراکنش‌ها"
                  onRowClick={(row) => setSelectedFinding(row.rawFinding)}
                />
              </div>

              {/* Section 5: Base Button & ButtonGroup Redesign Showcase */}
              <section id="button-showcase" className="scroll-mt-24 space-y-4 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Badge variant="accent">کامپوننت پایه ۱: دکمه و تعاملات</Badge>
                    <h2 className="mt-2 text-xl font-extrabold md:text-2xl">آزمایشگاه دکمه‌ها (Button & ButtonGroup)</h2>
                    <p className="mt-1 text-xs text-[var(--ds-foreground-soft)]">
                      گونه‌های معنایی، لودینگ بومی، ابعاد متراکم مالی، و چیدمان گروهی راست‌به‌چپ
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsBtnLoading(!isBtnLoading)}
                    className="gap-2 text-xs"
                  >
                    <RefreshCw className={cn("size-3.5", isBtnLoading && "animate-spin")} />
                    <span>{isBtnLoading ? "توقف تست لودینگ" : "تست وضعیت لودینگ"}</span>
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {/* Card 1: Variants */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-bold">گونه‌های معنایی (Variants)</CardTitle>
                      <CardDescription className="text-xs">تطبیق کارکرد با رنگ‌های سیستم طراحی</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="default" loading={isBtnLoading} loadingText="در حال ثبت...">
                          اصلی (Default)
                        </Button>
                        <Button variant="accent" loading={isBtnLoading} loadingText="تحلیل هوشمند...">
                          <Sparkles className="size-4" />
                          هوشمندی (Accent)
                        </Button>
                        <Button variant="secondary" loading={isBtnLoading}>
                          ثانویه (Secondary)
                        </Button>
                        <Button variant="outline" loading={isBtnLoading}>
                          کادردار (Outline)
                        </Button>
                        <Button variant="ghost" loading={isBtnLoading}>
                          بی‌کادر (Ghost)
                        </Button>
                        <Button variant="destructive-subtle" loading={isBtnLoading}>
                          رد ملایم (Subtle)
                        </Button>
                        <Button variant="destructive" loading={isBtnLoading}>
                          حذف قطعی (Danger)
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Card 2: Sizes */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-bold">مقیاس اندازه و تراکم مالی (Sizes)</CardTitle>
                      <CardDescription className="text-xs">از ابعاد متراکم جدول‌های حسابداری تا صفحات لمسی</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-end gap-2.5">
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-[10px] text-muted-foreground font-bold">XS (۲۸px - جدول)</span>
                        <Button size="xs" variant="default" loading={isBtnLoading}>
                          ثبت سند
                        </Button>
                      </div>
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-[10px] text-muted-foreground font-bold">SM (۳۶px - ابزاربار)</span>
                        <Button size="sm" variant="default" loading={isBtnLoading}>
                          فیلتر پیشرفته
                        </Button>
                      </div>
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-[10px] text-muted-foreground font-bold">Default (۴۴px - لمسی)</span>
                        <Button size="default" variant="default" loading={isBtnLoading}>
                          تأیید نهایی
                        </Button>
                      </div>
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-[10px] text-muted-foreground font-bold">LG (۴۸px - شاخص)</span>
                        <Button size="lg" variant="default" loading={isBtnLoading}>
                          شروع اسکن
                        </Button>
                      </div>
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-[10px] text-muted-foreground font-bold">آیکن SM و MD</span>
                        <div className="flex gap-1.5">
                          <Button size="icon-sm" variant="outline" aria-label="دانلود">
                            <Download className="size-3.5" />
                          </Button>
                          <Button size="icon" variant="secondary" aria-label="افزودن">
                            <Plus className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Card 3: ButtonGroup in RTL */}
                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-sm font-bold">دکمه‌های گروهی (ButtonGroup در RTL)</CardTitle>
                      <CardDescription className="text-xs">اتصال دقیق گوشه‌ها و هم‌پوشانی خطوط مرزی در زبان فارسی</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center gap-6">
                      <div className="space-y-1.5">
                        <span className="block text-xs font-bold text-muted-foreground">بازه زمانی مالی (کنترل تک‌انتخابی):</span>
                        <ButtonGroup>
                          <Button size="sm" variant="default">ماه جاری</Button>
                          <Button size="sm" variant="outline">فصل اخیر</Button>
                          <Button size="sm" variant="outline">شش ماهه</Button>
                          <Button size="sm" variant="outline">کل سال مالی</Button>
                        </ButtonGroup>
                      </div>

                      <div className="space-y-1.5">
                        <span className="block text-xs font-bold text-muted-foreground">دکمه دوگانه اقدام و منو (Split Action):</span>
                        <ButtonGroup>
                          <Button size="sm" variant="accent" loading={isBtnLoading}>
                            <Sparkles className="size-3.5" />
                            صدور پیش‌نویس سند
                          </Button>
                          <Button size="sm" variant="accent" className="px-2" aria-label="سایر گزینه‌ها">
                            <ChevronDown className="size-3.5" />
                          </Button>
                        </ButtonGroup>
                      </div>

                      <div className="space-y-1.5">
                        <span className="block text-xs font-bold text-muted-foreground">عملیات دسته‌جمعی سطرها:</span>
                        <ButtonGroup>
                          <Button size="xs" variant="outline">انتخاب همه</Button>
                          <Button size="xs" variant="destructive-subtle">رد موارد انتخابی</Button>
                        </ButtonGroup>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </section>

              {/* Section 6: Base Input & Form Primitives Showcase */}
              <section id="input-showcase" className="scroll-mt-24 space-y-4 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Badge variant="accent">کامپوننت پایه ۲: ورودی‌ها و فرم‌ها</Badge>
                    <h2 className="mt-2 text-xl font-extrabold md:text-2xl">
                      آزمایشگاه ورودی‌ها (Input, Textarea & Form)
                    </h2>
                    <p className="mt-1 text-xs text-[var(--ds-foreground-soft)]">
                      مبالغ ریالی با ارقام جدولی، شبا با جهت LTR، مدیریت خطای اعتبارسنجی و ابعاد متراکم
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={isInputError ? "destructive-subtle" : "outline"}
                    onClick={() => setIsInputError(!isInputError)}
                    className="gap-2 text-xs"
                  >
                    <span>{isInputError ? "رفع خطای شبیه‌سازی‌شده" : "شبیه‌سازی خطای اعتبارسنجی"}</span>
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {/* Card 1: Financial Inputs (Currency & IBAN) */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-bold">ورودی‌های مبالغ مالی و شبا (Financial Inputs)</CardTitle>
                      <CardDescription className="text-xs">
                        تراز ارقام جدولی فارسی و پیشوند/پسوندهای تخصصی بانکی
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Currency Amount Field */}
                      <Field>
                        <div className="flex items-center justify-between">
                          <FieldLabel required>مبلغ پرداختی به تأمین‌کننده</FieldLabel>
                          <span className="text-[11px] font-bold text-[var(--ds-primary)]">معادل ۸۵ میلیون تومان</span>
                        </div>
                        <InputGroup isInvalid={isInputError}>
                          <input
                            defaultValue="۸۵۰٬۰۰۰٬۰۰۰"
                            className="ds-persian-numerals flex-1 border-0 bg-transparent px-3 text-sm font-bold text-foreground outline-none"
                            placeholder="مبلغ به ریال..."
                          />
                          <InputGroupAddon
                            align="inline-end"
                            className="bg-[var(--ds-muted)] border-s border-[var(--ds-border)] px-3 text-xs font-bold"
                          >
                            ریال
                          </InputGroupAddon>
                        </InputGroup>
                        {isInputError ? (
                          <FieldError>مبلغ واریزی فراتر از سقف مصوب تنخواه‌گردان (۵۰۰ میلیون ریال) است.</FieldError>
                        ) : (
                          <FieldDescription>مبلغ بر مبنای ریال درج شده و در سند حسابداری ثبت خواهد شد.</FieldDescription>
                        )}
                      </Field>

                      {/* Sheba Field */}
                      <Field>
                        <div className="flex items-center justify-between">
                          <FieldLabel optional>شماره شبا مقصد (IR)</FieldLabel>
                          <span className="text-[11px] text-[var(--ds-foreground-faint)]">بانک ملت</span>
                        </div>
                        <InputGroup dir="ltr">
                          <InputGroupAddon
                            align="inline-start"
                            className="bg-[var(--ds-muted)] border-e border-[var(--ds-border)] px-3 font-mono text-xs font-bold text-[var(--ds-primary)]"
                          >
                            IR
                          </InputGroupAddon>
                          <input
                            defaultValue="54-0120-0000-0000-1234-5678-90"
                            className="ds-latin flex-1 border-0 bg-transparent px-3 font-mono text-xs tracking-wider text-foreground outline-none"
                            placeholder="۲۴ رقم شبا..."
                          />
                          <button
                            type="button"
                            onClick={() => toast.success("شماره شبا در حافظه کپی شد.")}
                            className="flex items-center px-3 text-[var(--ds-foreground-soft)] hover:text-[var(--ds-primary)] transition-colors"
                            title="کپی شبا"
                          >
                            <Copy className="size-3.5" />
                          </button>
                        </InputGroup>
                      </Field>
                    </CardContent>
                  </Card>

                  {/* Card 2: Search, Shortcut & Textarea */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-bold">جست‌وجوی فوری و یادداشت مشاور (Memo)</CardTitle>
                      <CardDescription className="text-xs">
                        فیلتر با کلید میانبر و استدلال رفع مغایرت در اسناد
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Search Input with Shortcut */}
                      <Field>
                        <FieldLabel>جست‌وجوی اسناد و آرتیکل‌ها</FieldLabel>
                        <InputGroup>
                          <InputGroupAddon align="inline-start" className="text-[var(--ds-foreground-faint)]">
                            <Search className="size-4" />
                          </InputGroupAddon>
                          <input
                            className="flex-1 border-0 bg-transparent px-2 text-sm text-foreground outline-none placeholder:text-[var(--ds-foreground-faint)]"
                            placeholder="جست‌وجوی شماره سند، شرح یا کد ملی..."
                          />
                          <InputGroupAddon align="inline-end">
                            <kbd className="rounded border border-[var(--ds-border)] bg-[var(--ds-muted)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ds-foreground-soft)]">
                              ⌘ K
                            </kbd>
                          </InputGroupAddon>
                        </InputGroup>
                      </Field>

                      {/* Textarea for Memo */}
                      <Field>
                        <div className="flex items-center justify-between">
                          <FieldLabel required>استدلال حسابدار / پیوست شواهد</FieldLabel>
                          <span className="text-[10px] font-mono text-[var(--ds-foreground-faint)]">۲۱۴ / ۵۰۰</span>
                        </div>
                        <Textarea
                          rows={3}
                          isInvalid={isInputError}
                          defaultValue="بر اساس استعلام از واحد تدارکات، فاکتور خرید مواد اولیه به تاریخ ۱۷ شهریور هنوز در سامانه مودیان تایید نهایی نشده و پس از وصول تاییدیه مالیاتی در سند تجمیعی ماهانه ثبت خواهد شد."
                          placeholder="دلیل عدم تطابق گردش حساب با سند حسابداری را توضیح دهید..."
                        />
                        {isInputError ? (
                          <FieldError>درج استدلال مکتوب برای رفع این مغایرت الزامی است.</FieldError>
                        ) : (
                          <FieldDescription>این یادداشت مستقیماً به زنجیره شواهد (Audit Trail) پیوست می‌شود.</FieldDescription>
                        )}
                      </Field>
                    </CardContent>
                  </Card>

                  {/* Card 3: Density & Sizes */}
                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-sm font-bold">مقیاس ابعاد فیلدها (Input Sizes)</CardTitle>
                      <CardDescription className="text-xs">
                        تراکم فشرده SM (۳۶px) برای ابزاربارها تا ابعاد استاندارد Default (۴۴px) و شاخص LG (۴۸px)
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid sm:grid-cols-3 gap-4 items-end">
                      <div className="space-y-1.5">
                        <Label>SM (۳۶px) - فیلتر سریع جداول</Label>
                        <Input size="sm" placeholder="فیلتر حساب معین..." />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Default (۴۴px) - استاندارد فرم‌ها</Label>
                        <Input size="default" placeholder="نام شعبه بانکی صادرکننده..." />
                      </div>
                      <div className="space-y-1.5">
                        <Label>LG (۴۸px) - ورود و CTA</Label>
                        <Input size="lg" placeholder="شناسه ملی ۱۱ رقمی شرکت..." />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </section>

              {/* Section 7: Design Tokens / Atoms & Badges Showcase */}
              <section id="component-lab" className="scroll-mt-24 space-y-4 pt-6">
                <div>
                  <Badge variant="accent">کامپوننت پایه ۳: نشان‌ها و وضعیت‌ها</Badge>
                  <h2 className="mt-2 text-xl font-extrabold md:text-2xl">
                    کاتالوگ نشان‌ها و وضعیت‌های مالی (Badge, Status & Risk)
                  </h2>
                  <p className="mt-1 text-xs text-[var(--ds-foreground-soft)]">
                    نشان‌های ریسک مالی با ارقام فارسی، وضعیت‌های چرخه تطبیق، نقاط پالس‌دار و تگ‌های مبدا داده
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {/* Card 1: Badge Variants & Sizes */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-bold">انواع نشان‌های پایه (Badge Variants & Sizes)</CardTitle>
                      <CardDescription className="text-xs">
                        رنگ‌های معنایی سیستم طراحی به همراه سایزهای متراکم جدول و قابلیت حذف
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Variants */}
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="default">اصلی (Default)</Badge>
                        <Badge variant="accent">هوشمندی (Accent)</Badge>
                        <Badge variant="secondary">خنثی (Secondary)</Badge>
                        <Badge variant="outline">کادردار (Outline)</Badge>
                        <Badge variant="success">موفق (Success)</Badge>
                        <Badge variant="warning">هشدار (Warning)</Badge>
                        <Badge variant="danger">خطر (Danger)</Badge>
                        <Badge variant="info">اطلاعاتی (Info)</Badge>
                      </div>

                      {/* Dot & Pulse & Removable */}
                      <div className="pt-2 border-t border-[var(--ds-border)] flex flex-wrap items-center gap-2.5">
                        <Badge variant="success" dot pulse>
                          اتصال به بانک ملت فعال
                        </Badge>
                        <Badge variant="accent" dot pulse>
                          مدل هوش مصنوعی آنلاین
                        </Badge>
                        <Badge
                          variant="secondary"
                          onRemove={() => toast.info("فیلتر تاریخ بازنشانی شد.")}
                        >
                          شهریور ۱۴۰۵
                        </Badge>
                        <Badge
                          variant="outline"
                          onRemove={() => toast.info("فیلتر بانک سامان حذف شد.")}
                        >
                          بانک سامان
                        </Badge>
                      </div>

                      {/* Sizes */}
                      <div className="pt-2 border-t border-[var(--ds-border)] flex items-end gap-3">
                        <div className="space-y-1">
                          <span className="block text-[10px] text-muted-foreground font-bold">XS (۲۰px)</span>
                          <Badge size="xs" variant="accent">بستن دوره</Badge>
                        </div>
                        <div className="space-y-1">
                          <span className="block text-[10px] text-muted-foreground font-bold">SM (۲۴px)</span>
                          <Badge size="sm" variant="default">تأییدیه</Badge>
                        </div>
                        <div className="space-y-1">
                          <span className="block text-[10px] text-muted-foreground font-bold">Default (۲۸px)</span>
                          <Badge size="default" variant="secondary">کنترل فعال</Badge>
                        </div>
                        <div className="space-y-1">
                          <span className="block text-[10px] text-muted-foreground font-bold">LG (۳۴px)</span>
                          <Badge size="lg" variant="outline">شاخص اصلی</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Card 2: StatusChip Matrix */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-bold">وضعیت‌های چرخه تطبیق (StatusChip)</CardTitle>
                      <CardDescription className="text-xs">
                        تفکیک مراحل جریان کاری با آیکون‌های استاندارد و نقطه پالس
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusChip status="exact_match" size="sm" />
                        <StatusChip status="potential_match" size="sm" />
                        <StatusChip status="amount_mismatch" size="sm" />
                        <StatusChip status="duplicate" size="sm" />
                        <StatusChip status="processing" size="sm" />
                        <StatusChip status="confirmed" size="sm" />
                        <StatusChip status="resolved" size="sm" />
                        <StatusChip status="dismissed" size="sm" />
                      </div>

                      {/* Sizes in row */}
                      <div className="pt-3 border-t border-[var(--ds-border)] space-y-2">
                        <span className="text-[11px] font-bold text-muted-foreground">مقایسه تراکم در سطرهای جدول:</span>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusChip status="exact_match" size="xs" />
                          <StatusChip status="potential_match" size="sm" />
                          <StatusChip status="confirmed" size="md" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Card 3: 4-Level Risk Badges */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-bold">نشان‌های ۴ سطح ریسک (RiskBadge)</CardTitle>
                      <CardDescription className="text-xs">
                        رنگ‌های کنتراست‌بالا با امتیاز اولویت با ارقام فارسی
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <RiskBadge level="critical" score={92} size="sm" />
                        <RiskBadge level="high" score={78} size="sm" />
                        <RiskBadge level="medium" score={55} size="sm" />
                        <RiskBadge level="low" score={20} size="sm" />
                      </div>
                      <div className="pt-2 border-t border-[var(--ds-border)] flex flex-wrap gap-2">
                        <span className="text-[11px] font-bold text-muted-foreground self-center">سایز فوق فشرده XS:</span>
                        <RiskBadge level="critical" score={92} size="xs" />
                        <RiskBadge level="high" score={78} size="xs" />
                        <RiskBadge level="medium" score={55} size="xs" />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Card 4: Evidence Source Tags & Money */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-bold">مبدا داده‌ها و شواهد (EvidenceSourceTag)</CardTitle>
                      <CardDescription className="text-xs">
                        اتصال به سند حسابداری، ردیف بانک و فاکتور سامانه مودیان
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <EvidenceSourceTag source="accounting" detail="سند ۷۰۴" size="sm" />
                        <EvidenceSourceTag source="bank" label="بانک ملت" detail="سطر ۱۴۲" size="sm" />
                        <EvidenceSourceTag source="tax" detail="فاکتور ۱۸۰۲۴" size="sm" />
                        <EvidenceSourceTag source="sales" detail="فاکتور ۸۸" size="sm" />
                      </div>
                      <div className="pt-2 border-t border-[var(--ds-border)] flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">نمایش مبلغ متناظر:</span>
                        <MoneyDisplay amount={850000000} currency="ریال" size="sm" direction="negative" showSign />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </section>

              {/* Section 8: Cards & Surfaces Showcase */}
              <section id="card-lab" className="scroll-mt-24 space-y-4 pt-6">
                <div>
                  <Badge variant="default">کامپوننت پایه ۴: کارت‌ها و سطوح مالی</Badge>
                  <h2 className="mt-2 text-xl font-extrabold md:text-2xl">
                    گونه‌های سطوح داده و محفظه‌ها (Card Variants & Surfaces)
                  </h2>
                  <p className="mt-1 text-xs text-[var(--ds-foreground-soft)]">
                    سطوح استاندارد، برجسته، تعاملی، دستیار هوش مصنوعی و هشدارهای مالی با خط نشانگر اختصاصی
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  {/* Default / Base Card */}
                  <Card variant="default">
                    <CardHeader>
                      <CardTitle className="text-sm font-bold">سطح استاندارد (Default)</CardTitle>
                      <CardDescription className="text-xs">
                        کارت تخت با بردر ملایم و پس‌زمینه کارت
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground leading-relaxed">
                      مناسب برای بلوک‌های اطلاعاتی عمومی، بخش‌بندی‌های داده در داشبورد و گروه‌بندی فرم‌ها بدون ایجاد وزن بصری اضافی.
                    </CardContent>
                    <CardFooter className="pt-2 border-t border-[var(--ds-border)] flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">وضعیت: عادی</span>
                      <Button variant="ghost" size="xs">مشاهده</Button>
                    </CardFooter>
                  </Card>

                  {/* Elevated Card */}
                  <Card variant="elevated">
                    <CardHeader>
                      <CardTitle className="text-sm font-bold">سطح برجسته (Elevated)</CardTitle>
                      <CardDescription className="text-xs">
                        عمق سایه نرم و تفکیک بصری در پس‌زمینه شلوغ
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground leading-relaxed">
                      بهینه‌سازی شده برای پنل‌های آماری، نمودارهای تعاملی و ابزارک‌های تحلیلی که نیاز به تاکید بصری بالاتر دارند.
                    </CardContent>
                    <CardFooter className="pt-2 border-t border-[var(--ds-border)] flex justify-between items-center text-xs">
                      <Badge variant="outline" size="xs">سایه ۳بعدی</Badge>
                      <Button variant="secondary" size="xs">تنظیمات</Button>
                    </CardFooter>
                  </Card>

                  {/* Interactive Card */}
                  <Card variant="interactive" onClick={() => toast.info("کارت تعاملی انتخاب شد.")}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-bold">سطح تعاملی (Interactive)</CardTitle>
                        <Badge variant="default" size="xs">کلیک‌پذیر</Badge>
                      </div>
                      <CardDescription className="text-xs">
                        حرکت نرم عمودی (-۲px) و هاله فوکوس در هوور
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground leading-relaxed">
                      مناسب برای کارت‌های انتخاب سناریو، ردیف‌های بازشدنی شواهد و کاشی‌های ناوبری سریع در کارتابل مغایرت‌ها.
                    </CardContent>
                    <CardFooter className="pt-2 border-t border-[var(--ds-border)] flex justify-between items-center text-xs">
                      <span className="text-primary font-medium">کلیک جهت اقدام ←</span>
                      <Button variant="default" size="xs">ورود</Button>
                    </CardFooter>
                  </Card>

                  {/* AI Card */}
                  <Card variant="ai">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-bold text-accent">دستیار هوش دیدبان (AI Card)</CardTitle>
                        <Sparkles className="h-4 w-4 text-accent animate-pulse" />
                      </div>
                      <CardDescription className="text-xs">
                        حاشیه رنگی ارغوانی با هاله نوری ملایم بنفش
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground leading-relaxed">
                      پیشنهاد مدل تحلیلی: ۳ مغایرت با الگوی کارمزد پنهان بانکی در اسناد شهریورماه با احتمال ۹۲٪ شناسایی شد.
                    </CardContent>
                    <CardFooter className="pt-2 border-t border-[var(--ds-accent)]/20 flex justify-between items-center text-xs">
                      <Badge variant="accent" size="xs">پیشنهاد هوشمند</Badge>
                      <Button variant="accent" size="xs">بررسی تطبیق خودکار</Button>
                    </CardFooter>
                  </Card>

                  {/* Danger Card */}
                  <Card variant="danger">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-bold text-danger">مغایرت بحرانی (Danger)</CardTitle>
                        <TriangleAlert className="h-4 w-4 text-danger" />
                      </div>
                      <CardDescription className="text-xs">
                        خط نشانگر قرمز در لبه راست (RTL) با زمینه هشدار
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground leading-relaxed">
                      کسری واریز نقدی در بانک صادرات نسبت به سند حسابداری به ارزش ۱،۲۵۰،۰۰۰،۰۰۰ ریال نیازمند رفع فوری است.
                    </CardContent>
                    <CardFooter className="pt-2 border-t border-danger/20 flex justify-between items-center text-xs">
                      <RiskBadge level="critical" score={95} size="xs" />
                      <Button variant="destructive" size="xs">ارجاع به بازرس</Button>
                    </CardFooter>
                  </Card>

                  {/* Warning Card */}
                  <Card variant="warning">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-bold text-warning">عدم تطابق تاریخ (Warning)</CardTitle>
                        <TriangleAlert className="h-4 w-4 text-warning" />
                      </div>
                      <CardDescription className="text-xs">
                        خط نشانگر کهربایی با تمپلیت گزارش تاخیر
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground leading-relaxed">
                      چک صیادی شماره ۹۰۴ با ۴۸ ساعت اختلاف زمانی میان تاریخ سررسید و ثبت بانکی وصول شده است.
                    </CardContent>
                    <CardFooter className="pt-2 border-t border-warning/20 flex justify-between items-center text-xs">
                      <RiskBadge level="medium" score={50} size="xs" />
                      <Button variant="outline" size="xs">ثبت تاییدیه</Button>
                    </CardFooter>
                  </Card>
                </div>
              </section>

              {/* Section 9: Tabs & Segmented Control Showcase */}
              <section id="tabs-lab" className="scroll-mt-24 space-y-4 pt-6">
                <div>
                  <Badge variant="accent">کامپوننت پایه ۵: تب‌ها و کنترل سگمنت مالی</Badge>
                  <h2 className="mt-2 text-xl font-extrabold md:text-2xl">
                    سامانه تب‌ها و کنترل سگمنت (Tabs & Segmented Control)
                  </h2>
                  <p className="mt-1 text-xs text-[var(--ds-foreground-soft)]">
                    کنترل سگمنت کپسولی، نوار تب‌های خطی، فیلترهای پیوسته چیپستی و مقیاس ابعاد ۴ گانه با سازگاری کامل RTL
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {/* Card 1: Segmented Control (Period & View) */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-bold">۱. سگمنت کنترل دوره‌های مالی (Segmented)</CardTitle>
                      <CardDescription className="text-xs">
                        کپسول پیوسته با پس‌زمینه فرورفته و کارت اکتیو شناور
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <span className="block text-xs font-bold text-muted-foreground mb-2">
                          سوئیچ بازه زمانی در سرصفحه گزارشات (سایز SM: ۳۶px):
                        </span>
                        <Tabs defaultValue="monthly">
                          <TabsList variant="segmented" size="sm">
                            <TabsTrigger value="daily">روزانه</TabsTrigger>
                            <TabsTrigger value="weekly">هفتگی</TabsTrigger>
                            <TabsTrigger value="monthly">ماهانه</TabsTrigger>
                            <TabsTrigger value="quarterly">فصلی</TabsTrigger>
                            <TabsTrigger value="yearly">سالانه</TabsTrigger>
                          </TabsList>
                          <TabsContent value="daily" className="text-xs text-muted-foreground pt-1">
                            📊 ۱۸ سند بانکی در ۲۴ ساعت گذشته به طور کامل تسویه شدند.
                          </TabsContent>
                          <TabsContent value="weekly" className="text-xs text-muted-foreground pt-1">
                            📊 گردش هفتگی: ۲۴،۳۵۰،۰۰۰،۰۰۰ ریال با ۹۹٪ تطابق قطعی.
                          </TabsContent>
                          <TabsContent value="monthly" className="text-xs text-muted-foreground pt-1">
                            📊 اسناد شهریورماه ۱۴۰۵: بستن حساب‌های پایان دوره آماده بررسی است.
                          </TabsContent>
                          <TabsContent value="quarterly" className="text-xs text-muted-foreground pt-1">
                            📊 گزارش سود و زیان تجمیعی دوره تابستان.
                          </TabsContent>
                          <TabsContent value="yearly" className="text-xs text-muted-foreground pt-1">
                            📊 مقایسه تراز افتتاحیه و اختتامیه سال مالی.
                          </TabsContent>
                        </Tabs>
                      </div>

                      <div className="pt-3 border-t border-[var(--ds-border)]">
                        <span className="block text-xs font-bold text-muted-foreground mb-2">
                          تغییر حالت احراز هویت یا نما (سایز Default: ۴۴px لمسی):
                        </span>
                        <Tabs defaultValue="login" className="w-full">
                          <TabsList variant="segmented" size="default" className="w-full grid grid-cols-2">
                            <TabsTrigger value="login">ورود به حساب</TabsTrigger>
                            <TabsTrigger value="register">ثبت شرکت جدید</TabsTrigger>
                          </TabsList>
                          <TabsContent value="login" className="text-xs text-muted-foreground pt-1">
                            🔒 ورود امن با رمز یکبار مصرف یا احراز هویت دومرحله‌ای سازمانی.
                          </TabsContent>
                          <TabsContent value="register" className="text-xs text-muted-foreground pt-1">
                            🏢 ساخت فضای کاری جدید و اتصال درگاه‌های بانکی و سامانه مودیان.
                          </TabsContent>
                        </Tabs>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Card 2: Line / Underline Tabs with Badges */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-bold">۲. نوار تب‌های خطی صفحه و کارتابل (Line Tabs)</CardTitle>
                      <CardDescription className="text-xs">
                        خط نشانگر زیرین با شمارنده‌های عددی و تب اختصاصی هوش دیدبان
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Tabs defaultValue="all">
                        <TabsList variant="line" size="default">
                          <TabsTrigger value="all">
                            <span>همه اسناد</span>
                            <Badge variant="secondary" size="xs">۱۴۲</Badge>
                          </TabsTrigger>
                          <TabsTrigger value="diff">
                            <span>مغایرت‌ها</span>
                            <Badge variant="danger" size="xs">۱۴</Badge>
                          </TabsTrigger>
                          <TabsTrigger value="matched">
                            <span>تطبیق قطعی</span>
                            <Badge variant="success" size="xs">۱۲۴</Badge>
                          </TabsTrigger>
                          <TabsTrigger value="ai" variant="accent">
                            <Sparkles className="size-3.5 text-[var(--ds-accent)]" />
                            <span>دیدبان AI</span>
                            <Badge variant="accent" size="xs">۴</Badge>
                          </TabsTrigger>
                        </TabsList>
                        <TabsContent value="all" className="text-xs text-muted-foreground pt-2">
                          📋 نمایش فهرست کامل ۱۴۲ ردیف تراکنش بانکی و اسناد دفتر روزنامه.
                        </TabsContent>
                        <TabsContent value="diff" className="text-xs text-danger pt-2">
                          ⚠️ ۱۴ ردیف با اختلاف مبلغ یا شناسه پیگیری نامنطبق نیازمند رسیدگی کارشناس.
                        </TabsContent>
                        <TabsContent value="matched" className="text-xs text-success pt-2">
                          ✅ ۱۲۴ سند حسابداری با مغایرت صفر ریال به طور خودکار تطبیق داده شدند.
                        </TabsContent>
                        <TabsContent value="ai" className="text-xs text-accent pt-2">
                          ✨ پیشنهاد هوش دیدبان: ۴ مغایرت کارمزد پنهان با اطمینان ۹۶٪ کشف شد.
                        </TabsContent>
                      </Tabs>
                    </CardContent>
                  </Card>

                  {/* Card 3: Filter Pills */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-bold">۳. فیلترهای چیپستی پیوسته (Filter Pills)</CardTitle>
                      <CardDescription className="text-xs">
                        کپسول‌های گرد منفرد برای اعمال سریع فیلترها بالای جدول مالی
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Tabs defaultValue="all-banks">
                        <TabsList variant="pills" size="sm">
                          <TabsTrigger value="all-banks">همه بانک‌ها</TabsTrigger>
                          <TabsTrigger value="mellat">
                            <span>بانک ملت</span>
                            <Badge variant="outline" size="xs">۴۲</Badge>
                          </TabsTrigger>
                          <TabsTrigger value="saderat">
                            <span>بانک صادرات</span>
                            <Badge variant="outline" size="xs">۲۸</Badge>
                          </TabsTrigger>
                          <TabsTrigger value="tax">
                            <span>سامانه مودیان</span>
                            <Badge variant="outline" size="xs">۱۵</Badge>
                          </TabsTrigger>
                          <TabsTrigger value="suspicious" variant="accent">
                            <span className="size-1.5 rounded-full bg-[var(--ds-accent)] animate-pulse" />
                            <span>مشکوک</span>
                          </TabsTrigger>
                        </TabsList>
                        <TabsContent value="all-banks" className="text-xs text-muted-foreground pt-1">
                          🔍 فیلتر فعال: تمام درگاه‌ها و حساب‌های متصل.
                        </TabsContent>
                        <TabsContent value="mellat" className="text-xs text-muted-foreground pt-1">
                          🏦 نمایش اسناد مربوط به حساب جاری بانک ملت شعبه مرکزی.
                        </TabsContent>
                        <TabsContent value="saderat" className="text-xs text-muted-foreground pt-1">
                          🏦 نمایش اسناد مربوط به حساب ارزی صادرات.
                        </TabsContent>
                        <TabsContent value="tax" className="text-xs text-muted-foreground pt-1">
                          🧾 تطابق صورتحساب‌های الکترونیکی سامانه مودیان مالیاتی.
                        </TabsContent>
                        <TabsContent value="suspicious" className="text-xs text-accent pt-1">
                          🚨 ۳ تراکنش با الگوی غیرمتعارف جهت استعلام ماده ۱۶۹ مکرر.
                        </TabsContent>
                      </Tabs>
                    </CardContent>
                  </Card>

                  {/* Card 4: Sizes Scale */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-bold">۴. مقیاس ابعاد و تراکم مالی (Sizes)</CardTitle>
                      <CardDescription className="text-xs">
                        از سایز فوق‌فشرده ۲۸px جداول تا سایز ۴۸px صفحات لمسی
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-muted-foreground w-28">XS (۲۸px - جدول):</span>
                        <Tabs defaultValue="t1">
                          <TabsList variant="segmented" size="xs">
                            <TabsTrigger value="t1">فعال</TabsTrigger>
                            <TabsTrigger value="t2">بایگانی</TabsTrigger>
                          </TabsList>
                        </Tabs>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-muted-foreground w-28">SM (۳۶px - ابزارها):</span>
                        <Tabs defaultValue="t1">
                          <TabsList variant="segmented" size="sm">
                            <TabsTrigger value="t1">حسابداری</TabsTrigger>
                            <TabsTrigger value="t2">خزانه‌داری</TabsTrigger>
                          </TabsList>
                        </Tabs>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-muted-foreground w-28">Default (۴۴px):</span>
                        <Tabs defaultValue="t1">
                          <TabsList variant="segmented" size="default">
                            <TabsTrigger value="t1">صورت مغایرت</TabsTrigger>
                            <TabsTrigger value="t2">ترازنامه</TabsTrigger>
                          </TabsList>
                        </Tabs>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-muted-foreground w-28">LG (۴۸px - لمسی):</span>
                        <Tabs defaultValue="t1">
                          <TabsList variant="segmented" size="lg">
                            <TabsTrigger value="t1">داشبورد ارشد</TabsTrigger>
                            <TabsTrigger value="t2">گزارش مدیریتی</TabsTrigger>
                          </TabsList>
                        </Tabs>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </section>

              {/* Section 10: Select & DropdownMenu Showcase */}
              <section id="select-lab" className="scroll-mt-24 space-y-4 pt-6">
                <div>
                  <Badge variant="accent">کامپوننت پایه ۶: انتخابگرها و منوهای کشویی</Badge>
                  <h2 className="mt-2 text-xl font-extrabold md:text-2xl">
                    سامانه انتخابگرها و منوهای کشویی مالی (Select & DropdownMenu)
                  </h2>
                  <p className="mt-1 text-xs text-[var(--ds-foreground-soft)]">
                    انتخابگر غنی حساب بانکی با شماره شبا و موجودی زنده، وضعیت‌های اعتبارسنجی خطا و منوی عملیات با زیرمنوهای RTL
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {/* Card 1: Rich Bank Account Picker */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-bold">۱. انتخابگر غنی حساب بانکی (Bank Account Picker)</CardTitle>
                      <CardDescription className="text-xs">
                        سایز Default (۴۴px) با تفکیک لوگو، شبای LTR و ارقام ریالی
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold">حساب بانکی مبدا تطبیق:</Label>
                        <Select defaultValue="mellat">
                          <SelectTrigger size="default">
                            <SelectValue placeholder="انتخاب حساب بانکی" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectLabel>حساب‌های ریالی و ارزی فعال</SelectLabel>
                              <SelectItem value="mellat">
                                <div className="flex items-center justify-between gap-4 w-full">
                                  <div className="flex items-center gap-2">
                                    <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-rose-600 text-[9px] font-bold text-white">
                                      ملت
                                    </div>
                                    <span className="font-bold">بانک ملت — جاری ارزی</span>
                                    <span className="font-mono text-[11px] text-muted-foreground" style={{ direction: "ltr" }}>
                                      IR12 0120...8493
                                    </span>
                                  </div>
                                  <Badge variant="outline" size="xs">۴۵.۲ میلیارد ریال</Badge>
                                </div>
                              </SelectItem>
                              <SelectItem value="saderat">
                                <div className="flex items-center justify-between gap-4 w-full">
                                  <div className="flex items-center gap-2">
                                    <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white">
                                      صادر
                                    </div>
                                    <span className="font-bold">بانک صادرات — تنخواه</span>
                                    <span className="font-mono text-[11px] text-muted-foreground" style={{ direction: "ltr" }}>
                                      IR88 0190...1204
                                    </span>
                                  </div>
                                  <Badge variant="outline" size="xs">۸.۷ میلیارد ریال</Badge>
                                </div>
                              </SelectItem>
                              <SelectItem value="saman">
                                <div className="flex items-center justify-between gap-4 w-full">
                                  <div className="flex items-center gap-2">
                                    <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[9px] font-bold text-white">
                                      سامان
                                    </div>
                                    <span className="font-bold">بانک سامان — درگاه فروش</span>
                                    <span className="font-mono text-[11px] text-muted-foreground" style={{ direction: "ltr" }}>
                                      IR56 0560...9942
                                    </span>
                                  </div>
                                  <Badge variant="outline" size="xs">۱۲۸.۴ میلیارد ریال</Badge>
                                </div>
                              </SelectItem>
                            </SelectGroup>
                            <SelectSeparator />
                            <div className="p-1">
                              <Button
                                variant="ghost"
                                size="xs"
                                className="w-full justify-start text-primary text-xs"
                                onClick={() => toast.info("هدایت به پروتکل بانکداری باز (Open Banking)...")}
                              >
                                + اتصال حساب بانکی جدید
                              </Button>
                            </div>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Card 2: Density & Validation Error */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-bold">۲. ابعاد متراکم و وضعیت خطا (Sizes & Error)</CardTitle>
                      <CardDescription className="text-xs">
                        سایز متراکم SM (۳۶px) و مدیریت خطای فرم با `isInvalid`
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* SM Select */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-muted-foreground">دوره مالی (سایز متراکم SM: ۳۶px):</Label>
                        <Select defaultValue="m1">
                          <SelectTrigger size="sm">
                            <SelectValue placeholder="انتخاب دوره" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="m1">شهریور ۱۴۰۵ (دوره جاری)</SelectItem>
                            <SelectItem value="m2">مرداد ۱۴۰۵ (بسته‌شده)</SelectItem>
                            <SelectItem value="m3">تیر ۱۴۰۵ (حسابرسی‌شده)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Error Select */}
                      <div className="pt-2 border-t border-[var(--ds-border)] space-y-1.5">
                        <Label className="text-xs font-bold text-danger">حساب معین مقصد (دارای خطا):</Label>
                        <Select>
                          <SelectTrigger size="sm" isInvalid>
                            <SelectValue placeholder="کدینگ حساب معین انتخاب نشده است" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1020">۱۰۲۰ — موجودی نقد و بانک</SelectItem>
                            <SelectItem value="1030">۱۰۳۰ — اسناد دریافتنی تجاری</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-1.5 text-xs text-danger font-medium">
                          <TriangleAlert className="size-3.5" />
                          <span>انتخاب حساب معین برای صدور سند اصلاحی الزامی است.</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Card 3: Contextual Action DropdownMenu */}
                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-sm font-bold">۳. منوی عملیات مالی تراکنش (DropdownMenu)</CardTitle>
                      <CardDescription className="text-xs">
                        زیرمنوی سازگار با RTL (باز شدن به چپ)، کلیدهای میانبر، و تفکیک اقدامات تأیید و رد
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-[var(--ds-surface-subtle)] border border-[var(--ds-border)]">
                      <div>
                        <div className="text-sm font-bold">سند شماره ۷۸۰۲ — تسویه صورتحساب بازرگانی نوین</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          مبلغ: ۲,۴۰۰,۰۰۰,۰۰۰ ریال • تاریخ: ۱۴۰۵/۰۶/۲۸ • مغایرت باز
                        </div>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-2">
                            <span>عملیات تراکنش</span>
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel>اقدامات حسابرسی</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => toast.success("تطبیق قطعی سند ۷۸۰۲ ثبت شد.")}>
                            <CheckCircle2 className="size-4 text-success" />
                            <span>تأیید تطبیق قطعی</span>
                            <DropdownMenuShortcut>⌘↵</DropdownMenuShortcut>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toast.info("پنجره ثبت یادداشت باز شد.")}>
                            <FileText className="size-4 text-primary" />
                            <span>افزودن یادداشت</span>
                            <DropdownMenuShortcut>⌘N</DropdownMenuShortcut>
                          </DropdownMenuItem>

                          {/* Submenu */}
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              <Send className="size-4 text-muted-foreground" />
                              <span>ارجاع به کارشناس...</span>
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="w-48">
                              <DropdownMenuLabel>انتخاب کارشناس</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => toast.info("به مدیر حسابرسی ارجاع شد.")}>
                                مهندس احمدی (مدیر حسابرسی)
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => toast.info("به بازرس داخلی ارجاع شد.")}>
                                خانم دکتر راد (بازرس داخلی)
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => toast.info("به مسئول خزانه‌داری ارجاع شد.")}>
                                کارشناس خزانه‌داری
                              </DropdownMenuItem>
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>

                          <DropdownMenuSeparator />

                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => toast.warning("مغایرت رد و بی‌اثر شد.")}
                          >
                            <Trash2 className="size-4 text-danger" />
                            <span>رد و بی‌اثر کردن</span>
                            <DropdownMenuShortcut>⌫</DropdownMenuShortcut>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </CardContent>
                  </Card>
                </div>
              </section>

              {/* Section 11: High-Density Table Showcase */}
              <section id="table-lab" className="scroll-mt-24 space-y-4 pt-6">
                <div>
                  <Badge variant="accent">کامپوننت پایه ۷: جدول متراکم داده‌های مالی</Badge>
                  <h2 className="mt-2 text-xl font-extrabold md:text-2xl">
                    سامانه جدول داده‌های مالی متراکم (High-Density Table)
                  </h2>
                  <p className="mt-1 text-xs text-[var(--ds-foreground-soft)]">
                    کنترل تراکم ۳ سطحی (۳۶px تا ۵۲px)، سرستون چسبان، تراز عددی چپ‌چین و شاخص سطر انتخاب‌شده و ریسک در RTL
                  </p>
                </div>

                <Card>
                  <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-sm font-bold">دفتر روزنامه و کارتابل تطبیق اسناد بانکی</CardTitle>
                      <CardDescription className="text-xs">
                        روی سطرها کلیک کنید تا شاخص انتخاب فیروزه‌ای فعال شود
                      </CardDescription>
                    </div>

                    {/* Density Control Switcher */}
                    <div className="flex items-center gap-1.5 bg-[var(--ds-muted-bg)] p-1 rounded-xl border border-[var(--ds-border)]">
                      <span className="text-[11px] font-bold text-muted-foreground px-2">تراکم:</span>
                      <Button
                        variant={labTableDensity === "compact" ? "default" : "ghost"}
                        size="xs"
                        onClick={() => setLabTableDensity("compact")}
                      >
                        متراکم (۳۶px)
                      </Button>
                      <Button
                        variant={labTableDensity === "normal" ? "default" : "ghost"}
                        size="xs"
                        onClick={() => setLabTableDensity("normal")}
                      >
                        عادی (۴۴px)
                      </Button>
                      <Button
                        variant={labTableDensity === "spacious" ? "default" : "ghost"}
                        size="xs"
                        onClick={() => setLabTableDensity("spacious")}
                      >
                        جادار (۵۲px)
                      </Button>
                    </div>
                  </CardHeader>

                  <CardContent>
                    <Table density={labTableDensity}>
                      <TableHeader>
                        <TableRow>
                          <TableHead style={{ width: "95px" }}>شماره سند</TableHead>
                          <TableHead>تاریخ و شرح سند حسابداری</TableHead>
                          <TableHead style={{ width: "140px" }}>حساب بانکی مبدا</TableHead>
                          <TableHead style={{ width: "120px" }}>وضعیت تطبیق</TableHead>
                          <TableHead style={{ width: "150px" }} className="text-left">
                            بدهکار / برداشت (ریال)
                          </TableHead>
                          <TableHead style={{ width: "150px" }} className="text-left">
                            بستانکار / واریز (ریال)
                          </TableHead>
                          <TableHead style={{ width: "80px" }} className="text-center">
                            اقدام
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow
                          selected={labSelectedId === "DOC-7041"}
                          risk="critical"
                          onClick={() => setLabSelectedId("DOC-7041")}
                        >
                          <TableCell className="font-mono text-xs text-muted-foreground" style={{ direction: "ltr" }}>
                            DOC-7041
                          </TableCell>
                          <TableCell>
                            <div className="font-bold">واریز نقدی شعبه ارزی — پتروشیمی زاگرس</div>
                            <div className="text-[11px] text-muted-foreground">۱۴۰۵/۰۶/۲۸ • فاکتور صادراتی شماره ۹۲</div>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs">بانک ملت (جاری)</span>
                          </TableCell>
                          <TableCell>
                            <StatusChip status="amount_mismatch" size="xs" />
                          </TableCell>
                          <TableCell numeric className="text-muted-foreground">—</TableCell>
                          <TableCell numeric className="text-success">۲,۵۰۰,۰۰۰,۰۰۰</TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                toast.info("بررسی مغایرت سند DOC-7041");
                              }}
                            >
                              بررسی
                            </Button>
                          </TableCell>
                        </TableRow>

                        <TableRow
                          selected={labSelectedId === "DOC-7042"}
                          onClick={() => setLabSelectedId("DOC-7042")}
                        >
                          <TableCell className="font-mono text-xs text-muted-foreground" style={{ direction: "ltr" }}>
                            DOC-7042
                          </TableCell>
                          <TableCell>
                            <div className="font-bold">کارمزد حواله پایا بین‌بانکی</div>
                            <div className="text-[11px] text-muted-foreground">۱۴۰۵/۰۶/۲۸ • کارمزد انتقال تنخواه ماهانه</div>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs">بانک صادرات</span>
                          </TableCell>
                          <TableCell>
                            <StatusChip status="exact_match" size="xs" />
                          </TableCell>
                          <TableCell numeric className="text-danger">۲۵۰,۰۰۰</TableCell>
                          <TableCell numeric className="text-muted-foreground">—</TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                toast.success("سند منطبق است.");
                              }}
                            >
                              تأیید
                            </Button>
                          </TableCell>
                        </TableRow>

                        <TableRow
                          selected={labSelectedId === "DOC-7043"}
                          onClick={() => setLabSelectedId("DOC-7043")}
                        >
                          <TableCell className="font-mono text-xs text-muted-foreground" style={{ direction: "ltr" }}>
                            DOC-7043
                          </TableCell>
                          <TableCell>
                            <div className="font-bold">تسویه صورتحساب فولاد مبارکه</div>
                            <div className="text-[11px] text-muted-foreground">۱۴۰۵/۰۶/۲۷ • حواله ساتنا با تاییدیه مودیان</div>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs">بانک سامان</span>
                          </TableCell>
                          <TableCell>
                            <StatusChip status="exact_match" size="xs" />
                          </TableCell>
                          <TableCell numeric className="text-danger">۱۸,۲۰۰,۰۰۰,۰۰۰</TableCell>
                          <TableCell numeric className="text-muted-foreground">—</TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                toast.info("مشاهده سند در سامانه مودیان");
                              }}
                            >
                              شواهد
                            </Button>
                          </TableCell>
                        </TableRow>
                      </TableBody>

                      {/* Footer Totals */}
                      <TableFooter>
                        <TableRow>
                          <TableCell colSpan={4} className="text-start">
                            جمع کل اقلام (۳ سند) • اختلاف تراز:{" "}
                            <span className="font-mono text-danger" style={{ direction: "ltr", display: "inline-block" }}>
                              -۱۵,۷۰۰,۲۵۰,۰۰۰ ریال
                            </span>
                          </TableCell>
                          <TableCell numeric className="text-danger">۱۸,۲۰۰,۲۵۰,۰۰۰</TableCell>
                          <TableCell numeric className="text-success">۲,۵۰۰,۰۰۰,۰۰۰</TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </CardContent>
                </Card>
              </section>

              {/* Section 12: Alert, Dialog & AlertDialog Showcase */}
              <section id="alert-dialog-lab" className="scroll-mt-24 space-y-4 pt-6">
                <div>
                  <Badge variant="accent">کامپوننت پایه ۸: پیام‌ها و پنجره‌های گفتگو</Badge>
                  <h2 className="mt-2 text-xl font-extrabold md:text-2xl">
                    سامانه هشدارهای مالی و پنجره‌های گفتگو (Alert, Dialog & AlertDialog)
                  </h2>
                  <p className="mt-1 text-xs text-[var(--ds-foreground-soft)]">
                    ۵ گونه آلرت معنایی با رنگ‌های کنتراست‌بالا، پنجره‌های تایید حساس مالی (AlertDialog) و فرم‌های مدال در محیط RTL
                  </p>
                </div>

                {/* Part 1: Alerts Matrix */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-bold">۱. گونه‌های آلرت‌های سیستمی و مالی (Semantic Alerts)</CardTitle>
                    <CardDescription className="text-xs">
                      ۵ رنگ معنایی با آیکون‌های متناظر و پدینگ اصلاح‌شده در جهت راست‌به‌چپ
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Danger Alert */}
                    <Alert variant="danger">
                      <TriangleAlert className="size-5 text-danger" />
                      <AlertTitle>مغایرت بحرانی در موجودی نقد و بانک (واریز نامنطبق)</AlertTitle>
                      <AlertDescription>
                        کسری واریز به مبلغ ۱،۲۵۰،۰۰۰،۰۰۰ ریال میان صورت‌حساب بانک ملت و سند حسابداری شماره ۷۰۴ کشف شد.
                      </AlertDescription>
                    </Alert>

                    {/* Warning Alert */}
                    <Alert variant="warning">
                      <TriangleAlert className="size-5 text-warning" />
                      <AlertTitle>سررسید چک‌های صیادی پایان دوره</AlertTitle>
                      <AlertDescription>
                        ۳ فقره چک اسناد دریافتنی به ارزش ۴،۸۰۰،۰۰۰،۰۰۰ ریال تا ۴۸ ساعت آینده سررسید می‌شوند.
                      </AlertDescription>
                    </Alert>

                    {/* Success Alert */}
                    <Alert variant="success">
                      <CheckCircle2 className="size-5 text-success" />
                      <AlertTitle>تطبیق خودکار اسناد دوره با موفقیت نهایی شد</AlertTitle>
                      <AlertDescription>
                        تعداد ۱۲۴ سند حسابداری با خطای صفر ریال با تراکنش‌های بانک صادرات تطبیق قطعی داده شدند.
                      </AlertDescription>
                    </Alert>

                    {/* AI Alert */}
                    <Alert variant="ai">
                      <Sparkles className="size-5 text-accent" />
                      <AlertTitle>تحلیلگر هوشمند دیدبان (AI Financial Insight)</AlertTitle>
                      <AlertDescription>
                        الگوی تکرارشونده کارمزدهای پنهان بانکی در اسناد تنخواه کشف شد؛ تطبیق خودکار در دسترس است.
                      </AlertDescription>
                    </Alert>

                    {/* Info Alert */}
                    <Alert variant="info">
                      <Info className="size-5 text-primary" />
                      <AlertTitle>همگام‌سازی ابری درگاه بانکی فعال است</AlertTitle>
                      <AlertDescription>
                        اطلاعات گردش حساب هر ۱۰ دقیقه یک‌بار از وب‌سرویس پایا دریافت و ثبت می‌شود.
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>

                {/* Part 2: Interactive Dialogs */}
                <div className="grid gap-4 md:grid-cols-2">
                  {/* AlertDialog Demo */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-bold">۲. دیالوگ تایید عملیات حساس (AlertDialog)</CardTitle>
                      <CardDescription className="text-xs">
                        تایید قطعی بستن دفاتر مالی و قفل اسناد دوره
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        برای عملیات‌های غیرقابل بازگشت مالی، پنجره گفتگوی تاییدیه صریح با دکمه قرمز و ترنسلیت استاندارد RTL نمایش داده می‌شود.
                      </p>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm" className="gap-2">
                            <TriangleAlert className="size-4" />
                            <span>بستن قطعی دوره مالی و قفل دفاتر</span>
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>آیا از بستن قطعی دوره شهریور ۱۴۰۵ اطمینان دارید؟</AlertDialogTitle>
                            <AlertDialogDescription>
                              با بستن قطعی دوره، تمامی اسناد قفل شده و امکان ویرایش یا ثبت مغایرت جدید بدون تایید حسابرس مستقل سلب خواهد شد.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <div className="rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface-subtle)] p-3 text-xs text-foreground">
                            ⚠️ وضعیت نهایی: ۱۲۴ سند منطبق • ۱ مغایرت با مسئولیت مدیر مالی
                          </div>
                          <AlertDialogFooter>
                            <AlertDialogAction
                              variant="destructive"
                              onClick={() => toast.success("دوره مالی با موفقیت بسته و قفل شد.")}
                            >
                              تایید و بستن دفاتر
                            </AlertDialogAction>
                            <AlertDialogCancel>انصراف</AlertDialogCancel>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </CardContent>
                  </Card>

                  {/* Form Dialog Demo */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-bold">۳. پنجره فرم سند اصلاحی (Form Dialog)</CardTitle>
                      <CardDescription className="text-xs">
                        فرم ورود داده در قالب مدال با تمرکز کیبورد و دکمه‌های تراز RTL
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        مدال‌های ورودی داده با لایه بلور پس‌زمینه (`backdrop-blur-sm`)، دکمه بستن با کلید ESC و چیدمان استاندارد دکمه‌های اقدام.
                      </p>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="default" size="sm" className="gap-2">
                            <FileText className="size-4" />
                            <span>صدور سند تعدیل مغایرت بانکی</span>
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>صدور سند تعدیل مغایرت بانکی</DialogTitle>
                            <DialogDescription>
                              مشخصات سند اصلاحی را وارد کنید تا به طور خودکار در دفتر روزنامه ثبت شود.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <Label className="text-xs">شرح سند تعدیل:</Label>
                              <Input defaultValue="اصلاح واریز اشتباه کارمزد ساتنا" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs">حساب معین بدهکار:</Label>
                                <Input defaultValue="۱۰۲۰ — بانک ملت" />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">مبلغ تعدیل (ریال):</Label>
                                <Input defaultValue="۲۵۰,۰۰۰" style={{ direction: "ltr" }} />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">یادداشت مشاور حسابرسی:</Label>
                              <Textarea defaultValue="طبق رسید چاپی بانک ملت شعبه مرکزی مورخ ۱۴۰۵/۰۶/۲۸" />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button
                              variant="default"
                              onClick={() => toast.success("سند تعدیل در دفتر روزنامه صادر و ثبت شد.")}
                            >
                              ثبت سند در دفتر روزنامه
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </CardContent>
                  </Card>
                </div>
              </section>
            </main>
          </div>
        </div>

        {/* Side Evidence Drawer */}
        <EvidenceDrawer
          open={!!selectedFinding}
          onOpenChange={(open) => !open && setSelectedFinding(null)}
          finding={selectedFinding}
          onAction={(action) => {
            toast.success(`تصمیم مشاور (${action}) برای یافته ثبت شد.`);
            setSelectedFinding(null);
          }}
        />

        {/* Sticky Review Action Bar for Quick Decision Support */}
        <ReviewActionBar
          selectedCount={selectedRowCount}
          onConfirm={() => {
            toast.success("یافته با موفقیت تأیید شد.");
            setSelectedRowCount(0);
          }}
          onFollowUp={() => {
            toast.info("وضعیت یافته به «در حال پیگیری» تغییر کرد.");
            setSelectedRowCount(0);
          }}
          onResolve={() => {
            toast.success("مغایرت حل و نهایی شد.");
            setSelectedRowCount(0);
          }}
          onDismiss={() => {
            toast.warning("یافته رد / بی‌اثر شد.");
            setSelectedRowCount(0);
          }}
        />

        <Toaster position="bottom-left" dir="rtl" richColors closeButton />
      </div>
    </TooltipProvider>
  );
}
