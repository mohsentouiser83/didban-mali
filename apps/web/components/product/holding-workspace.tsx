"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Layers,
  WalletCards,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  TrendingUp,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Server,
} from "lucide-react";

import { api } from "@/lib/product-api";
import type { HoldingSummaryResponse } from "@/lib/product-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/financial/page-header";
import { KpiMetricCard } from "@/components/ui/financial/kpi-metric-card";
import { MoneyDisplay, formatFinancialNumber, toPersianDigits } from "@/components/ui/financial/money-display";

export function HoldingWorkspace() {
  const [data, setData] = useState<HoldingSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api<HoldingSummaryResponse>("/companies/holding/summary");
      setData(res);
    } catch (err: any) {
      setError(err?.message || "خطا در دریافت اطلاعات تجمیعی هلدینگ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="space-y-6 p-6 font-sans text-right" dir="rtl">
      <PageHeader
        title="دیدبان هلدینگ و شرکت‌های چندگانه"
        description="پایش و تجمیع نقدینگی، مطالبات، تعهدات و کنترل مالی کلیه شخصیت‌های حقوقی زیرمجموعه در یک نما"
        badge={
          <Badge variant="outline" className="gap-1 border-primary/40 bg-primary/10 text-primary">
            <Layers className="h-3.5 w-3.5" />
            {data ? `${toPersianDigits(data.companies_count)} شرکت تجمیع‌شده` : "چند شرکتی"}
          </Badge>
        }
        primaryAction={
          <Link href="/companies/new">
            <Button size="sm" className="gap-2">
              <Building2 className="h-4 w-4" />
              افزودن شرکت جدید
            </Button>
          </Link>
        }
        secondaryActions={
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            به‌روزرسانی لحظه‌ای
          </Button>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
          {error}
        </div>
      )}

      {/* Top 4 Consolidated KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiMetricCard
          title="مجموع نقدینگی تجمیعی هلدینگ"
          value={data?.total_cash_balance_irr}
          subtext="موجودی لحظه‌ای حساب‌های بانکی کلیه شرکت‌ها"
          status={data && data.total_cash_balance_irr > 0 ? "normal" : "warning"}
          icon={WalletCards}
        />
        <KpiMetricCard
          title="مجموع مطالبات تجاری هلدینگ"
          value={data?.total_receivables_irr}
          subtext="فاکتورهای باز و اسناد دریافتنی وصول‌نشده"
          status="normal"
          icon={ArrowDownLeft}
        />
        <KpiMetricCard
          title="مجموع تعهدات و بدهی‌های جاری"
          value={data?.total_payables_irr}
          subtext="چک‌ها و فاکتورهای پرداختنی سررسیدشده و آتی"
          status="normal"
          icon={ArrowUpRight}
        />
        <KpiMetricCard
          title="خالص نقدینگی در گردش هلدینگ"
          value={data?.total_net_liquidity_irr}
          subtext="نقدینگی + مطالبات منهای بدهی‌ها"
          status={data && data.total_net_liquidity_irr >= 0 ? "normal" : "critical"}
          icon={TrendingUp}
        />
      </div>

      {/* Critical Findings Alert Banner if any */}
      {data && data.total_critical_findings_count > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div>
              <span className="font-semibold">
                توجه مدیریت ارشد مالی: تعداد {toPersianDigits(data.total_critical_findings_count)} مغایرت بحرانی در کل شرکت‌های هلدینگ نیازمند بررسی است.
              </span>
              <p className="mt-0.5 text-xs text-red-600/80 dark:text-red-400/80">
                این مغایرت‌ها شامل چک‌های برگشتی، مبالغ نامنطبق بالای آستانه و واریزی‌های مجهول در شرکت‌های تابعه هستند.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Portfolio Companies Matrix Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold">
                تفکیک نقدینگی و وضعیت کنترل مالی شرکت‌های تابعه
              </CardTitle>
              <CardDescription>
                مقایسه مانده نقد، مطالبات، بدهی‌ها و ضریب انطباق کنترل مالی هر شخصیت حقوقی
              </CardDescription>
            </div>
            <span className="text-xs text-muted-foreground">
              {data ? `آخرین محاسبه: ${new Date(data.generated_at).toLocaleTimeString("fa-IR")}` : ""}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="border-b bg-muted/40 text-xs font-semibold text-muted-foreground">
                <tr>
                  <th className="p-3">نام شرکت</th>
                  <th className="p-3">شناسه ملی</th>
                  <th className="p-3">موجودی نقدینگی</th>
                  <th className="p-3">مطالبات</th>
                  <th className="p-3">بدهی‌ها</th>
                  <th className="p-3">خالص نقدینگی</th>
                  <th className="p-3">نرخ تطبیق بانکی</th>
                  <th className="p-3">مغایرت بحرانی</th>
                  <th className="p-3">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data?.companies.map((comp) => (
                  <tr key={comp.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary shrink-0" />
                        <div>
                          <div className="font-semibold">{comp.legal_name}</div>
                          {comp.is_live && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" /> فعال عملیاتی
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">
                      {comp.national_id ? toPersianDigits(comp.national_id) : "—"}
                    </td>
                    <td className="p-3 font-semibold text-emerald-600 dark:text-emerald-400">
                      <MoneyDisplay amount={comp.cash_balance_irr} showSign={false} />
                    </td>
                    <td className="p-3">
                      <MoneyDisplay amount={comp.receivables_irr} showSign={false} />
                    </td>
                    <td className="p-3">
                      <MoneyDisplay amount={comp.payables_irr} showSign={false} />
                    </td>
                    <td className={`p-3 font-semibold ${comp.net_liquidity_irr >= 0 ? "text-primary" : "text-red-500"}`}>
                      <MoneyDisplay amount={comp.net_liquidity_irr} showSign={true} />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${Math.min(100, comp.reconciliation_match_rate)}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono">
                          {toPersianDigits(comp.reconciliation_match_rate.toFixed(1))}%
                        </span>
                      </div>
                    </td>
                    <td className="p-3">
                      {comp.critical_findings_count > 0 ? (
                        <Badge variant="danger" className="text-xs">
                          {toPersianDigits(comp.critical_findings_count)} مورد
                        </Badge>
                      ) : (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> پاک
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <Link href={`/companies/${comp.id}/overview`}>
                        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
                          ورود به شرکت
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 13-Week Consolidated Forecast Trend */}
      {data && data.weekly_forecast.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  پیش‌بینی ۱۳ هفته‌ای نقدینگی کل هلدینگ
                </CardTitle>
                <CardDescription>
                  روند پیش‌بینی‌شده مانده نقد هلدینگ بر پایه مطالبات قطعی و تعهدات سررسیدشده
                </CardDescription>
              </div>
              <Badge variant="outline" className="border-primary/30 text-xs">
                مدل قطعی جریان وجوه نقد
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-7 lg:grid-cols-13 text-center">
              {data.weekly_forecast.map((wf) => (
                <div
                  key={wf.week_number}
                  className="rounded-lg border bg-card/60 p-2.5 transition-all hover:border-primary/50"
                >
                  <div className="text-[11px] font-semibold text-muted-foreground">
                    هفته {toPersianDigits(wf.week_number)}
                  </div>
                  <div
                    className={`mt-1.5 text-xs font-bold ${
                      wf.projected_cash_irr >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                    }`}
                  >
                    {formatFinancialNumber(wf.projected_cash_irr)}
                  </div>
                  <div className="mt-1 flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                    <span className="text-emerald-600">+{formatFinancialNumber(wf.inflow_irr)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* On-Premise Local Agent Sync Banner for Enterprise IT */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col md:flex-row items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <Server className="h-6 w-6" />
            </div>
            <div>
              <div className="font-bold text-sm">
                کلاینت همگام‌ساز محلی دیدبان مالی (Didban Local Sync Agent)
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                سرورهای داخلی سپیدار و راهکاران را بدون نیاز به باز کردن پورت اینترنت، از طریق کلاینت سبک محلی به صورت امن و خودکار متصل کنید.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <code className="text-xs font-mono bg-background/80 px-2 py-1 rounded border">
              python scripts/didban_sync_agent.py --config didban-agent.json --once
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
