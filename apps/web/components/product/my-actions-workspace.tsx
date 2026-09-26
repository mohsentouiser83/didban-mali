"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ClipboardCheck,
  CheckCircle2,
  Clock,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  Calendar,
  Layers,
  FileCheck2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MoneyDisplay,
  toPersianDigits,
  RiskBadge,
  StatusChip,
  PageHeader,
  EmptyState,
} from "@/components/ui/financial";
import { toJalaliDate } from "@/lib/date-utils";
import { api } from "@/lib/product-api";
import type { Company, FindingListItem, MyActionQueue } from "@/lib/product-types";

function faDate(value: string | null | undefined) {
  if (!value) return "نامشخص";
  return toJalaliDate(value);
}

export function MyActionsWorkspace({ company }: { company: Company }) {
  const [queue, setQueue] = useState<MyActionQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"assigned" | "verification">("assigned");
  const base = `/companies/${company.id}`;

  const loadQueue = useCallback(async () => {
    try {
      const data = await api<MyActionQueue>(`/companies/${company.id}/actions/my-queue`);
      setQueue(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "دریافت کارتابل اقدامات با خطا مواجه شد.");
    } finally {
      setLoading(false);
    }
  }, [company.id]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse" dir="rtl">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <Skeleton className="h-12 w-96 rounded-xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const assigned = queue?.assigned_findings || [];
  const verification = queue?.verification_queue || [];

  return (
    <div className="space-y-6 pb-12" dir="rtl">
      {/* Header */}
      <PageHeader
        title="کارتابل وظایف و اقدامات من"
        description="مغایرت‌های تخصیص‌یافته به شما جهت پیگیری، و پرونده‌های حل‌شده در انتظار تایید مستقل (Maker-Checker)"
        badge={
          <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
            <ClipboardCheck className="size-3.5" />
            کارتابل مالی
          </span>
        }
        secondaryActions={
          <Button variant="outline" size="sm" asChild className="h-8 gap-1.5 text-xs font-bold rounded-xl">
            <Link href={`${base}/control`}>
              <ShieldCheck className="size-3.5 text-primary" />
              <span>داشبورد کنترل مالی</span>
            </Link>
          </Button>
        }
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="w-full">
        <TabsList className="w-full sm:w-auto border-b border-border/80 gap-3 justify-start bg-transparent p-0">
          <TabsTrigger
            value="assigned"
            className="gap-2 text-xs sm:text-sm py-2 px-3 font-bold data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
          >
            <ClipboardCheck className="size-4 text-primary" />
            <span>وظایف محول‌شده به من</span>
            <span className="text-[11px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-primary/10 text-primary">
              {toPersianDigits(assigned.length)}
            </span>
          </TabsTrigger>

          <TabsTrigger
            value="verification"
            className="gap-2 text-xs sm:text-sm py-2 px-3 font-bold data-[state=active]:border-b-2 data-[state=active]:border-emerald-600 rounded-none"
          >
            <FileCheck2 className="size-4 text-emerald-600" />
            <span>صف تایید و صحه‌گذاری (Maker-Checker)</span>
            <span className="text-[11px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-600">
              {toPersianDigits(verification.length)}
            </span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Assigned Findings */}
        <TabsContent value="assigned" className="pt-4 focus-visible:outline-none">
          {assigned.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="همه وظایف شما انجام شده است!"
              description="در حال حاضر پرونده یا مغایرت بازی به شما ارجاع داده نشده است."
              action={{
                label: "مشاهده همه یافته‌ها",
                href: `${base}/findings`,
              }}
            />
          ) : (
            <div className="space-y-3">
              {assigned.map((f: FindingListItem) => (
                <div
                  key={f.id}
                  className="p-4 rounded-2xl border border-border bg-card/70 hover:border-primary/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <RiskBadge level={f.severity} size="sm" />
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-muted text-foreground border border-border/60">
                        {f.rule_code}
                      </span>
                      <StatusChip status={f.status as any} size="sm" />
                      {f.due_date && (
                        <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                          <Calendar className="size-3" />
                          <span>مهلت اقدام: {faDate(f.due_date)}</span>
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-extrabold text-foreground truncate">
                      {f.title_fa}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {f.summary_fa}
                    </p>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-4 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-border/60">
                    {f.financial_impact_irr ? (
                      <div className="text-start md:text-end">
                        <span className="text-[10px] text-muted-foreground block">اثر مالی</span>
                        <MoneyDisplay
                          amount={f.financial_impact_irr}
                          currency="ریال"
                          size="sm"
                          className="font-bold text-foreground"
                        />
                      </div>
                    ) : null}

                    <Button asChild size="sm" className="h-8 gap-1 text-xs font-bold rounded-xl shadow-xs">
                      <Link href={`${base}/findings/${f.id}`}>
                        <span>بررسی و حل‌وفصل</span>
                        <ChevronLeft className="size-3.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Verification Queue (Maker-Checker) */}
        <TabsContent value="verification" className="pt-4 focus-visible:outline-none">
          <div className="mb-4 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-xs text-emerald-950 dark:text-emerald-200 flex items-start gap-2.5">
            <ShieldCheck className="size-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold">سازوکار تفکیک وظایف (Maker-Checker Principle):</strong>
              <p className="mt-0.5 leading-relaxed text-[11px] text-muted-foreground">
                این پرونده‌ها توسط اعضای تیم مالی بررسی و راه‌حل آن‌ها ثبت شده است. جهت پایبندی به استانداردهای حاکمیت شرکتی و کنترل‌های داخلی، بسته‌شدن قطعی آن‌ها نیازمند تایید دوم توسط مدیر مالی یا مالک شرکت است. فرد حل‌کننده نمی‌تواند پرونده خود را تایید کند.
              </p>
            </div>
          </div>

          {verification.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="صف تایید خالی است"
              description="پرونده‌ای منتظر بررسی دو امضایی و تایید نهایی شما نیست."
            />
          ) : (
            <div className="space-y-3">
              {verification.map((f: FindingListItem) => (
                <div
                  key={f.id}
                  className="p-4 rounded-2xl border border-border bg-card/70 hover:border-emerald-500/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <RiskBadge level={f.severity} size="sm" />
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-muted text-foreground border border-border/60">
                        {f.rule_code}
                      </span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600">
                        {f.resolution_type ? `حل‌شده (${f.resolution_type})` : "حل‌شده"}
                      </span>
                    </div>
                    <h3 className="text-sm font-extrabold text-foreground truncate">
                      {f.title_fa}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {f.summary_fa}
                    </p>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-4 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-border/60">
                    {f.financial_impact_irr ? (
                      <div className="text-start md:text-end">
                        <span className="text-[10px] text-muted-foreground block">اثر مالی</span>
                        <MoneyDisplay
                          amount={f.financial_impact_irr}
                          currency="ریال"
                          size="sm"
                          className="font-bold text-foreground"
                        />
                      </div>
                    ) : null}

                    <Button asChild size="sm" className="h-8 gap-1 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs">
                      <Link href={`${base}/findings/${f.id}`}>
                        <span>بررسی و تایید نهایی</span>
                        <ChevronLeft className="size-3.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
