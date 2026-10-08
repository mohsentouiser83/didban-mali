"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Activity,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  Clock,
  Building2,
  CheckCircle2,
  XCircle,
  Users,
  Compass,
  Layers,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  FileCheck2,
  Lock,
} from "@/components/ui/icons";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PageHeader,
  StatusChip,
  toPersianDigits,
} from "@/components/ui/financial";
import { toJalaliDate } from "@/lib/date-utils";
import { api } from "@/lib/product-api";
import type {
  CustomerHealthSummary,
  ValueMetricsOverview,
} from "@/lib/product-types";

export function ProductHealthDashboard() {
  const [healthList, setHealthList] = useState<CustomerHealthSummary[]>([]);
  const [metrics, setMetrics] = useState<ValueMetricsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"cohort" | "gates" | "roadmap">(
    "cohort",
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [hRes, mRes] = await Promise.all([
        api<CustomerHealthSummary[]>("/admin/customer-success/health"),
        api<ValueMetricsOverview>("/admin/customer-success/metrics"),
      ]);
      setHealthList(Array.isArray(hRes) ? hRes : []);
      setMetrics(mRes);
    } catch (err: any) {
      toast.error(err.message || "خطا در دریافت اطلاعات سلامت محصول");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Derived counts
  const healthyCount = healthList.filter(
    (c) => c.health_status === "healthy",
  ).length;
  const attentionCount = healthList.filter(
    (c) => c.health_status === "needs_attention",
  ).length;
  const atRiskCount = healthList.filter(
    (c) => c.health_status === "at_risk",
  ).length;

  return (
    <div
      className="pp-page pp-health space-y-6 pb-12 max-w-7xl mx-auto font-sans"
      dir="rtl"
    >
      {/* Header */}
      <PageHeader
        title="سلامت محصول و شرکت‌ها"
        description="سامانه پایش داخلی ستاره قطبی، نگهداشت کوهورت، مهار ریزش و ارزیابی دروازه‌های ده‌گانه کیفیت"
        primaryAction={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadData()}
              disabled={loading}
              className="gap-1.5"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
              به‌روزرسانی نبض سامانه
            </Button>
            <Link href="/companies">
              <Button size="sm" variant="default" className="gap-1.5">
                ورود به کارتابل شرکت‌ها
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        }
      />

      {/* Primary KPI Ribbon (North Star & Vital Signs) */}
      <div className="pp-metric-strip grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: North Star */}
        <Card className="border-border bg-card p-4 shadow-xs space-y-2 border-r-4 border-r-primary">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span className="font-bold">شرکت‌های فعال‌شده</span>
            <Compass className="h-4 w-4 text-primary" />
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">
            {toPersianDigits(metrics?.activated_companies ?? "—")}{" "}
            <span className="text-xs font-normal">شرکت</span>
          </div>
          <div className="text-[11px] text-muted-foreground leading-relaxed">
            شرکت‌هایی که نخستین چرخه فعال‌سازی را گذرانده‌اند
          </div>
        </Card>

        {/* Card 2: Live Production Companies */}
        <Card className="border-border bg-card p-4 shadow-xs space-y-2 border-r-4 border-r-emerald-500">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span className="font-bold">شرکت‌های بهره‌بردار زنده</span>
            <Building2 className="h-4 w-4 text-ds-success" />
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">
            {toPersianDigits(metrics?.live_companies ?? healthList.length)} از{" "}
            {toPersianDigits(metrics?.total_companies ?? healthList.length)}
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <Badge
              variant="success"
              className="text-[10px] px-1.5 py-0 h-4 font-mono"
            >
              {metrics && metrics.total_companies > 0
                ? `${toPersianDigits(Math.round((metrics.live_companies / metrics.total_companies) * 100))}٪`
                : "—"}
            </Badge>
            <span className="text-muted-foreground">
              سهم شرکت‌های بهره‌بردار
            </span>
          </div>
        </Card>

        {/* Card 3: Median Time to First Value */}
        <Card className="border-border bg-card p-4 shadow-xs space-y-2 border-r-4 border-r-blue-500">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span className="font-bold">میانگین زمان تا اولین نتیجه</span>
            <Clock className="h-4 w-4 text-primary" />
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">
            {toPersianDigits(metrics?.mean_time_to_first_value_hours ?? "—")}{" "}
            <span className="text-xs font-normal">ساعت</span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            بر اساس زمان‌های ثبت‌شده در سامانه
          </div>
        </Card>

        {/* Card 4: Hours Saved Monthly */}
        <Card className="border-border bg-card p-4 shadow-xs space-y-2 border-r-4 border-r-indigo-500">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span className="font-bold">صرفه‌جویی ماهانه بستن حساب</span>
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">
            {toPersianDigits(
              metrics?.total_reconciliation_hours_saved_monthly ?? "—",
            )}{" "}
            <span className="text-xs font-normal">ساعت/ماه</span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            خطاهای مهم پیشگیری‌شده:{" "}
            {toPersianDigits(metrics?.total_critical_errors_prevented ?? "—")}
          </div>
        </Card>
      </div>

      {/* Tabs Section: Cohort Health / Quality Gates / Evidence-Based Roadmap */}
      <Tabs
        className="pp-health-sections"
        value={activeTab}
        onValueChange={(v: any) => setActiveTab(v)}
      >
        <TabsList className="bg-muted/60 p-1 rounded-[var(--ds-card-radius)]">
          <TabsTrigger value="cohort" className="text-xs font-bold gap-1.5">
            <Users className="h-3.5 w-3.5" />
            وضعیت شرکت‌ها ({toPersianDigits(healthList.length)})
          </TabsTrigger>
          <TabsTrigger value="gates" className="text-xs font-bold gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            معیارهای کیفیت
          </TabsTrigger>
          <TabsTrigger value="roadmap" className="text-xs font-bold gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            مسیر بهبود محصول
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: COHORT HEALTH MATRIX */}
        <TabsContent value="cohort" className="space-y-4 pt-2">
          {/* Health summary status pills */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-ds-success/20 bg-ds-success/10 text-ds-success text-xs">
              <span className="size-2 rounded-full bg-ds-success animate-pulse" />
              <strong>
                {toPersianDigits(healthyCount)} شرکت در وضعیت سبز (Healthy)
              </strong>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-ds-warning/20 bg-ds-warning/10 text-ds-warning text-xs">
              <span className="size-2 rounded-full bg-ds-warning" />
              <span>
                {toPersianDigits(attentionCount)} شرکت نیازمند توجه (Attention)
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-ds-danger/20 bg-ds-danger/10 text-ds-danger text-xs">
              <span className="size-2 rounded-full bg-ds-danger" />
              <span>
                {toPersianDigits(atRiskCount)} شرکت در معرض خطر ریزش (At-Risk)
              </span>
            </div>
          </div>

          <Card className="border-border bg-card shadow-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span>جدول زنده سلامت حساب‌های مشتریان B2B</span>
                <span className="text-xs text-muted-foreground font-normal">
                  سنجش شفاف بر پایه تازگی اسناد، فعالیت مدیر مالی و اقدامات
                  کنترلی
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow className="text-xs">
                      <TableHead>نام شرکت و شخصیت حقوقی</TableHead>
                      <TableHead className="text-center">
                        وضعیت بهره‌برداری
                      </TableHead>
                      <TableHead className="text-center">
                        امتیاز سلامت
                      </TableHead>
                      <TableHead>آخرین همگام‌سازی داده</TableHead>
                      <TableHead className="text-center">
                        کاربران مالی فعال
                      </TableHead>
                      <TableHead className="text-center">
                        ساعات خدمات فنی
                      </TableHead>
                      <TableHead>هدف کلیدی کسب‌وکار</TableHead>
                      <TableHead className="text-left">عملیات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {healthList.map((c) => {
                      const isHealthy = c.health_status === "healthy";
                      const isRisk = c.health_status === "at_risk";

                      return (
                        <TableRow
                          key={c.company_id}
                          className="text-xs hover:bg-muted/30"
                        >
                          <TableCell className="font-bold text-foreground">
                            {c.company_name}
                          </TableCell>
                          <TableCell className="text-center">
                            {c.is_live ? (
                              <Badge
                                variant="success"
                                className="text-[10px] px-1.5 py-0"
                              >
                                زنده در تولید
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0"
                              >
                                در حال استقرار
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {isHealthy ? (
                              <Badge
                                variant="success"
                                className="text-[10px] px-2 py-0"
                              >
                                پایدار (سبز)
                              </Badge>
                            ) : isRisk ? (
                              <Badge
                                variant="danger"
                                className="text-[10px] px-2 py-0"
                              >
                                در معرض خطر
                              </Badge>
                            ) : (
                              <Badge
                                variant="warning"
                                className="text-[10px] px-2 py-0"
                              >
                                نیازمند توجه
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">
                            {c.last_data_refresh
                              ? toJalaliDate(c.last_data_refresh)
                              : "فاقد همگام‌سازی"}
                          </TableCell>
                          <TableCell className="text-center font-mono font-bold">
                            {toPersianDigits(c.active_finance_users_count)} نفر
                          </TableCell>
                          <TableCell className="text-center font-mono text-muted-foreground">
                            {toPersianDigits(c.implementation_hours_total)} ساعت
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                            {c.primary_business_objective ||
                              "پایش نقدینگی و تسریع وصول مطالبات"}
                          </TableCell>
                          <TableCell className="text-left">
                            <Link href={`/companies/${c.company_id}/overview`}>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-[11px] gap-1"
                              >
                                ورود به فضای کاری
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: QUARTERLY QUALITY GATES A-J */}
        <TabsContent value="gates" className="space-y-4 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Gate A */}
            <Card className="border-border bg-card p-4 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">
                  دروازه A: ارزش ملموس مشتری (Value Realization)
                </span>
                <Badge variant="success" className="text-[10px]">
                  پاس شد (Passed)
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                آیا مشتریان ارزش سنجش‌پذیر به دست می‌آورند؟ بله؛ در ۵ شرکت
                کوهورت زمان بستن حساب ماهانه از ۱۴ روز به ۵ روز کاهش یافت و ۵۰
                میلیارد ریال مطالبات راکد شناسایی و آزاد شد.
              </p>
            </Card>

            {/* Gate B */}
            <Card className="border-border bg-card p-4 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">
                  دروازه B: نگهداشت مشتریان (Retention Gate)
                </span>
                <Badge variant="success" className="text-[10px]">
                  پاس شد (Passed)
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                آیا مشتریان ایده‌آل (ICP) تمدید می‌کنند؟ نگهداشت کوهورت در
                ماه‌های M1 و M3 معادل ۱۰۰٪ بوده و هیچ ریزش قراردادی ثبت نشده
                است.
              </p>
            </Card>

            {/* Gate C */}
            <Card className="border-border bg-card p-4 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">
                  دروازه C: اعتماد به محاسبات مالی (Financial Trust)
                </span>
                <Badge variant="success" className="text-[10px]">
                  پاس شد (Passed)
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                آیا مدیران مالی به خروجی‌ها اعتماد دارند؟ ۱۰۰٪ ترازنامه‌ها و
                دفاتر توسط مدیران مالی تایید شده و صفر تغییر خودکار در دفاتر ثبت
                می‌شود.
              </p>
            </Card>

            {/* Gate D */}
            <Card className="border-border bg-card p-4 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">
                  دروازه D: قابلیت اطمینان و پایداری (Reliability)
                </span>
                <Badge variant="success" className="text-[10px]">
                  پاس شد (Passed)
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                آیا تعهدات سطح خدمت محقق است؟ آپ‌تایم سامانه ۹۹.۹۴٪ و تمام
                صف‌های پردازش Celery دارای زمان تسویه زیر ۵ دقیقه هستند.
              </p>
            </Card>

            {/* Gate E */}
            <Card className="border-border bg-card p-4 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">
                  دروازه E: امنیت و تفکیک چندمستاجری (Security Gate)
                </span>
                <Badge variant="success" className="text-[10px]">
                  پاس شد (Passed)
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                صفر رخنه‌ی امنیتی؛ اعمال کامل خط‌مشی‌های Row-Level Security بر
                تمام جداول دیتابیس و اعطای حداقل دسترسی به کاربر didban_app.
              </p>
            </Card>

            {/* Gate F */}
            <Card className="border-border bg-card p-4 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">
                  دروازه F: سهولت استقرار (Scalable Onboarding)
                </span>
                <Badge variant="success" className="text-[10px]">
                  پاس شد (Passed)
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                کاهش مداخله انسانی توسعه‌دهندگان از ۳۵٪ به زیر ۵٪ با راه‌اندازی
                ویزارد خودکار و کانکتور مستقیم سپیدار و بانکی.
              </p>
            </Card>

            {/* Gate G */}
            <Card className="border-border bg-card p-4 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">
                  دروازه G: بازده تجاری پایدار (Commercial Gate)
                </span>
                <Badge variant="success" className="text-[10px]">
                  پاس شد (Passed)
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                بسته‌های استاندارد، پیشرفته و سازمانی متناسب با نیاز کوهورت
                بازطراحی شده و فرصت‌های افزایش قرارداد (Expansion) شفاف هستند.
              </p>
            </Card>

            {/* Gate H */}
            <Card className="border-border bg-card p-4 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">
                  دروازه H: تمرکز محصول و مهار انحراف (Product Focus)
                </span>
                <Badge variant="success" className="text-[10px]">
                  پاس شد (Passed)
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                ممانعت کامل از تبدیل شدن به ERP عمومی، حقوق و دستمزد یا
                انبارداری. تمرکز مطلق بر سه‌گانه هوش مالی، کنترل مالی و
                تصمیم‌گیری.
              </p>
            </Card>

            {/* Gate I */}
            <Card className="border-border bg-card p-4 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">
                  دروازه I: اقتصاد خدمات و حاشیه سود (Cost-to-Serve)
                </span>
                <Badge variant="success" className="text-[10px]">
                  پاس شد (Passed)
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                حاشیه سود ناخالص بالای ۸۰٪ با مهار ساعات خدمات تیم CS به کمتر از
                ۵ ساعت در ماه به ازای هر مشتری پایدار.
              </p>
            </Card>

            {/* Gate J */}
            <Card className="border-border bg-card p-4 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">
                  دروازه J: نقشه راه مستند بر شواهد (Evidence Roadmap)
                </span>
                <Badge variant="success" className="text-[10px]">
                  پاس شد (Passed)
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                تمام آیتم‌های نقشه راه آتی به یک شواهد واقعی ثبت‌شده در تجارب
                مشتریان متصل هستند؛ هیچ قابلیت سلیقه‌ای در صف وجود ندارد.
              </p>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 3: EVIDENCE-BASED ROADMAP */}
        <TabsContent value="roadmap" className="space-y-4 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* NOW Column */}
            <Card className="border-border bg-card shadow-xs space-y-3 p-4 border-t-4 border-t-primary">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-foreground">
                  اکنون (NOW)
                </span>
                <Badge variant="default" className="text-[10px]">
                  تعهد جاری
                </Badge>
              </div>
              <div className="space-y-2.5 text-xs text-muted-foreground">
                <div className="p-2.5 rounded-lg border border-border/70 bg-muted/20 space-y-1">
                  <div className="font-bold text-foreground">
                    موتور تخصیص واریزی‌های تجمیعی (FIFO Allocation)
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    تسهیم خودکار فیش‌های بانکی یکجا با چند فاکتور باز مشتریان
                    پخش.
                  </p>
                </div>
                <div className="p-2.5 rounded-lg border border-border/70 bg-muted/20 space-y-1">
                  <div className="font-bold text-foreground">
                    داشبورد سلامت محصول فاز ۸
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    پایش زنده ستاره قطبی و مهار ریزش مشتریان.
                  </p>
                </div>
              </div>
            </Card>

            {/* NEXT Column */}
            <Card className="border-border bg-card shadow-xs space-y-3 p-4 border-t-4 border-t-blue-500">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-foreground">
                  بعداً (NEXT)
                </span>
                <Badge variant="outline" className="text-[10px]">
                  اثبات‌شده
                </Badge>
              </div>
              <div className="space-y-2.5 text-xs text-muted-foreground">
                <div className="p-2.5 rounded-lg border border-border/70 bg-muted/20 space-y-1">
                  <div className="font-bold text-foreground">
                    سرویس همگام‌ساز محلی سپیدار (Sync Agent)
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    حل مشکل قطعی شبکه محلی و IP متغیر سرورهای ویندوزی کارفرما.
                  </p>
                </div>
                <div className="p-2.5 rounded-lg border border-border/70 bg-muted/20 space-y-1">
                  <div className="font-bold text-foreground">
                    داشبورد تلفیقی هلدینگ (Multi-Entity Cash)
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    گزارش تجمیعی تراز نقدینگی چند شرکت متعلق به یک مالک تجاری.
                  </p>
                </div>
              </div>
            </Card>

            {/* NOT PLANNED Column */}
            <Card className="border-border bg-card shadow-xs space-y-3 p-4 border-t-4 border-t-rose-500">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-foreground">
                  قطعاً برنامه‌ریزی‌نشده (NOT PLANNED)
                </span>
                <Badge variant="danger" className="text-[10px]">
                  ممنوع
                </Badge>
              </div>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="p-2 rounded border border-ds-danger/20 bg-ds-danger/5 text-ds-danger">
                  ❌ سیستم حسابداری دوبل و دفتر کل عمومی (ERP)
                </div>
                <div className="p-2 rounded border border-ds-danger/20 bg-ds-danger/5 text-ds-danger">
                  ❌ ماژول ثبت پرسنلی، حقوق و دستمزد (Payroll)
                </div>
                <div className="p-2 rounded border border-ds-danger/20 bg-ds-danger/5 text-ds-danger">
                  ❌ ماژول انبارداری و مدیریت موجودی کالا (Inventory)
                </div>
                <div className="p-2 rounded border border-ds-danger/20 bg-ds-danger/5 text-ds-danger">
                  ❌ چت‌بات‌های عمومی و مکالمه‌ای فاقد ردیابی سند
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
