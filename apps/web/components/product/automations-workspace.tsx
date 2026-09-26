"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRightLeft,
  Bot,
  CheckCircle2,
  Clock,
  Cpu,
  History,
  Info,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Workflow,
  Zap,
} from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { PageHeader, StatusChip, toPersianDigits } from "@/components/ui/financial";
import { api } from "@/lib/product-api";
import type { AutomationRule, AutomationRun, Company } from "@/lib/product-types";

interface AutomationsWorkspaceProps {
  company: Company;
}

export function AutomationsWorkspace({ company }: AutomationsWorkspaceProps) {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [selectedRule, setSelectedRule] = useState<AutomationRule | null>(null);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const loadRules = async () => {
    try {
      setLoading(true);
      const data = await api<AutomationRule[]>(`/companies/${company.id}/automations`);
      setRules(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to load automation rules:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, [company.id]);

  const handleToggleRule = async (rule: AutomationRule) => {
    try {
      await api(`/companies/${company.id}/automations/${rule.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_enabled: !rule.is_enabled }),
      });
      await loadRules();
    } catch (e: any) {
      alert(e.message || "خطا در تغییر وضعیت اتوماسیون");
    }
  };

  const handleExecuteRule = async (ruleId: string) => {
    setRunningId(ruleId);
    try {
      await api<AutomationRun>(`/companies/${company.id}/automations/${ruleId}/run`, {
        method: "POST",
      });
      await loadRules();
    } catch (e: any) {
      alert(e.message || "خطا در اجرای اتوماسیون");
    } finally {
      setRunningId(null);
    }
  };

  const handleOpenHistory = async (rule: AutomationRule) => {
    setSelectedRule(rule);
    setHistoryOpen(true);
    try {
      const data = await api<AutomationRun[]>(`/companies/${company.id}/automations/${rule.id}/runs`);
      setRuns(data);
    } catch (e) {
      console.error("Failed to load runs history:", e);
    }
  };

  return (
    <div dir="rtl" className="space-y-6">
      <PageHeader
        title="مرکز اتوماسیون‌های مالی تکراری"
        description="اجرای قاعده‌مند چرخه‌های شبانه همگام‌سازی، محاسبه شاخص‌ها، تطبیق بانکی و کشف یافته‌ها"
        badge={
          <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
            <Cpu className="h-3.5 w-3.5" />
            اتوماسیون تکرار
          </span>
        }
      />

      {/* Principle Callout */}
      <Alert className="border-indigo-500/20 bg-indigo-500/10 text-indigo-900 dark:text-indigo-200 text-xs">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong>اصل بنیادین اتوماسیون در دیدبان مالی:</strong> ما تکرارها و فرآیندهای محاسباتی را خودکار می‌کنیم، اما
            مسئولیت حسابداری و تصمیمات انسانی را جایگزین نمی‌سازیم. هیچ اتوماسیونی مجاز به اصلاح اسناد دفاتر یا تایید
            بدون‌ناظر پرداخت نیست.
          </div>
        </div>
      </Alert>

      {/* Rules List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">چرخه‌های فعال فرآیندی</h3>
          <span className="text-xs text-muted-foreground">
            {toPersianDigits(rules.filter((r) => r.is_enabled).length)} اتوماسیون فعال
          </span>
        </div>

        {loading ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-xs text-muted-foreground">
            در حال بارگذاری قوانین اتوماسیون...
          </div>
        ) : rules.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-xs text-muted-foreground">
            هیچ قانون اتوماسیونی ثبت نشده است.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rules.map((rule) => {
              const isMorningCycle = rule.action_type === "daily_morning_cycle";

              return (
                <Card key={rule.id} className="border-border bg-card shadow-xs flex flex-col justify-between">
                  <CardHeader className="pb-3 border-b border-border/50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                          {isMorningCycle ? <Workflow className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                        </div>
                        <div>
                          <CardTitle className="text-sm font-bold text-foreground">{rule.name}</CardTitle>
                          <CardDescription className="text-xs text-muted-foreground font-mono">
                            زمان‌بندی: {rule.schedule_cron} (هر روز ساعت ۰۷:۰۰)
                          </CardDescription>
                        </div>
                      </div>
                      <Switch
                        checked={rule.is_enabled}
                        onCheckedChange={() => handleToggleRule(rule)}
                        title={rule.is_enabled ? "فعال" : "غیرفعال"}
                      />
                    </div>
                  </CardHeader>

                  <CardContent className="pt-3 pb-3 space-y-3 text-xs text-muted-foreground">
                    <div className="rounded-lg bg-muted/40 p-2.5 space-y-1.5 border border-border/40">
                      <div className="font-bold text-foreground text-[11px]">مراحل اجرایی خودکار:</div>
                      <ul className="list-disc list-inside space-y-1 text-[11px]">
                        <li>سینک داده از اتصالات فعال (سپیدار / بانک)</li>
                        <li>محاسبه مجدد موقعیت نقدینگی و سن‌سنجی مطالبات</li>
                        <li>اجرای موتور تطبیق قطعی دفاتر و صورتحساب‌ها</li>
                        <li>کشف مغایرت‌های جدید و ارجاع خودکار به کارشناس مسئول</li>
                      </ul>
                    </div>

                    <div className="flex items-center justify-between border-b border-border/40 pb-2">
                      <span>آخرین اجرای موفق:</span>
                      <strong className="text-foreground font-mono">
                        {rule.last_run_at ? new Date(rule.last_run_at).toLocaleTimeString("fa-IR") : "هنوز اجرا نشده"}
                      </strong>
                    </div>

                    <div className="flex items-center justify-between">
                      <span>وضعیت آخرین چرخه:</span>
                      <StatusChip
                        status={rule.last_status === "success" ? "completed" : rule.last_status === "failed" ? "failed" : "ready"}
                        label={rule.last_status === "success" ? "موفق" : rule.last_status === "failed" ? "خطا" : "آماده"}
                      />
                    </div>
                  </CardContent>

                  <CardFooter className="pt-2 border-t border-border/50 flex items-center justify-between">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5"
                      disabled={runningId === rule.id}
                      onClick={() => handleExecuteRule(rule.id)}
                    >
                      <Play className={`h-3 w-3 ${runningId === rule.id ? "animate-spin" : ""}`} />
                      {runningId === rule.id ? "در حال اجرا..." : "اجرای فوری چرخه"}
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => handleOpenHistory(rule)}
                    >
                      سوابق اجرا
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Run History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl font-sans" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">
              سوابق اجرای اتوماسیون — {selectedRule?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              مشاهده تفصیلی گام‌های طی‌شده و مدت‌زمان پردازش در هر چرخه خودکار
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[380px] overflow-y-auto space-y-3">
            {runs.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                هیچ سابقه‌ای برای این اتوماسیون ثبت نشده است.
              </div>
            ) : (
              runs.map((run) => (
                <div key={run.id} className="rounded-xl border border-border bg-card p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between border-b border-border/50 pb-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={run.status === "succeeded" ? "success" : "danger"}
                        className="text-[10px]"
                      >
                        {run.status === "succeeded" ? "اجرای موفق" : "ناموفق"}
                      </Badge>
                      <span className="text-muted-foreground">
                        {run.trigger_type === "scheduled" ? "چرخه خودکار شبانه" : "اجرای دستی کاربر"}
                      </span>
                    </div>
                    <span className="font-mono text-muted-foreground">
                      زمان: {toPersianDigits(run.duration_ms)} میلی‌ثانیه
                    </span>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    {run.steps_executed.map((step, idx) => (
                      <div key={idx} className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          <span>{step.title_fa}</span>
                        </div>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">تکمیل شد</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
