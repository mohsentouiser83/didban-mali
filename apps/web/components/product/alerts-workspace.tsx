"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertOctagon,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  ExternalLink,
  Plus,
  Radio,
  RefreshCcw,
  Send,
  ShieldAlert,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  KpiMetricCard,
  MoneyDisplay,
  RiskBadge,
  toPersianDigits,
} from "@/components/ui/financial";

import { api } from "@/lib/product-api";
import type {
  AlertCategory,
  AlertSeverity,
  AlertsSummaryResponse,
  AlertWebhookCreateRequest,
  AlertWebhookItem,
  AlertWebhookTestResult,
  AlertWebhooksListResponse,
  Company,
  EarlyWarningAlertItem,
} from "@/lib/product-types";

const CATEGORY_META: Record<AlertCategory, { label: string; icon: typeof AlertTriangle; color: string }> = {
  liquidity: { label: "نقدینگی و تاب‌آوری", icon: Zap, color: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
  credit_risk: { label: "ریسک اعتباری و وصول", icon: ShieldAlert, color: "text-red-500 bg-red-500/10 border-red-500/20" },
  supply_chain: { label: "زنجیره تامین و بدهی‌ها", icon: AlertOctagon, color: "text-orange-500 bg-orange-500/10 border-orange-500/20" },
  compliance: { label: "انطباق و مغایرت بانکی", icon: AlertTriangle, color: "text-cyan-500 bg-cyan-500/10 border-cyan-500/20" },
};

export function AlertsWorkspace({ company }: { company: Company }) {
  const [activeTab, setActiveTab] = useState<"alerts" | "webhooks">("alerts");
  const [severityFilter, setSeverityFilter] = useState<"all" | AlertSeverity>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | AlertCategory>("all");
  const [summary, setSummary] = useState<AlertsSummaryResponse | null>(null);
  const [webhooks, setWebhooks] = useState<AlertWebhookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modals / Actions
  const [acknowledgingAlert, setAcknowledgingAlert] = useState<EarlyWarningAlertItem | null>(null);
  const [acknowledgeNote, setAcknowledgeNote] = useState("");
  const [resolvingAlert, setResolvingAlert] = useState<EarlyWarningAlertItem | null>(null);
  const [resolveNote, setResolveNote] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);

  // Webhooks
  const [newWebhook, setNewWebhook] = useState<AlertWebhookCreateRequest>({
    name: "",
    url: "",
    secret_token: "",
    min_severity: "warning",
  });
  const [creatingWebhook, setCreatingWebhook] = useState(false);
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<AlertWebhookTestResult | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [sumRes, whRes] = await Promise.all([
        api<AlertsSummaryResponse>(`/companies/${company.id}/alerts/summary`),
        api<AlertWebhooksListResponse>(`/companies/${company.id}/alerts/webhooks`),
      ]);
      setSummary(sumRes);
      setWebhooks(whRes.items);
    } catch {
      toast.error("خطا در بارگذاری اطلاعات هشدارهای زودهنگام");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [company.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    toast.success("وضعیت هشدارهای زودهنگام با داده‌های جدید پایش و به‌روزرسانی شد.");
  };

  const handleAcknowledge = async () => {
    if (!acknowledgingAlert) return;
    setSubmittingAction(true);
    try {
      await api(`/companies/${company.id}/alerts/${acknowledgingAlert.id}/acknowledge`, {
        method: "POST",
        body: JSON.stringify({ note: acknowledgeNote.trim() || undefined }),
      });
      toast.success("هشدار با موفقیت مشاهده و تایید شد.");
      setAcknowledgingAlert(null);
      setAcknowledgeNote("");
      await loadData();
    } catch {
      toast.error("خطا در تایید هشدار");
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleResolve = async () => {
    if (!resolvingAlert) return;
    if (!resolveNote.trim()) {
      toast.error("لطفاً یادداشت اقدام انجام‌شده را درج فرمایید.");
      return;
    }
    setSubmittingAction(true);
    try {
      await api(`/companies/${company.id}/alerts/${resolvingAlert.id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ action_note: resolveNote.trim() }),
      });
      toast.success("هشدار برطرف شده علامت‌گذاری شد.");
      setResolvingAlert(null);
      setResolveNote("");
      await loadData();
    } catch {
      toast.error("خطا در رفع هشدار");
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWebhook.name.trim() || !newWebhook.url.trim()) {
      toast.error("لطفاً نام و آدرس وب‌هوک را وارد فرمایید.");
      return;
    }
    setCreatingWebhook(true);
    try {
      await api(`/companies/${company.id}/alerts/webhooks`, {
        method: "POST",
        body: JSON.stringify({
          name: newWebhook.name.trim(),
          url: newWebhook.url.trim(),
          secret_token: newWebhook.secret_token?.trim() || undefined,
          min_severity: newWebhook.min_severity,
        }),
      });
      toast.success("کانال وب‌هوک جدید با موفقیت ثبت گردید.");
      setNewWebhook({ name: "", url: "", secret_token: "", min_severity: "warning" });
      await loadData();
    } catch {
      toast.error("خطا در ایجاد وب‌هوک");
    } finally {
      setCreatingWebhook(false);
    }
  };

  const handleDeleteWebhook = async (webhookId: string) => {
    if (!confirm("آیا از حذف این کانال اطلاع‌رسانی اطمینان دارید؟")) return;
    try {
      await api(`/companies/${company.id}/alerts/webhooks/${webhookId}`, {
        method: "DELETE",
      });
      toast.success("کانال وب‌هوک حذف شد.");
      await loadData();
    } catch {
      toast.error("خطا در حذف وب‌هوک");
    }
  };

  const handleTestWebhook = async (webhookId: string) => {
    setTestingWebhookId(webhookId);
    setTestResult(null);
    try {
      const res = await api<AlertWebhookTestResult>(
        `/companies/${company.id}/alerts/webhooks/${webhookId}/test`,
        { method: "POST" }
      );
      setTestResult(res);
      if (res.is_success) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
      await loadData();
    } catch {
      toast.error("ارتباط با وب‌هوک هدف برقرار نشد.");
    } finally {
      setTestingWebhookId(null);
    }
  };

  const filteredAlerts = useMemo(() => {
    if (!summary?.active_alerts) return [];
    return summary.active_alerts.filter((a) => {
      if (severityFilter !== "all" && a.severity !== severityFilter) return false;
      if (categoryFilter !== "all" && a.category !== categoryFilter) return false;
      return true;
    });
  }, [summary, severityFilter, categoryFilter]);

  if (loading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3">
        <RefreshCcw className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">در حال پایش و ارزیابی هشدارهای زودهنگام مالی...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">مرکز پایش هشدارهای زودهنگام مالی</h1>
            <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
              Early Warning System
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            پایش خودکار و پیش‌دستانه مخاطرات نقدینگی، ریسک‌های اعتباری مشتریان، بحران بستانکاران و مغایرت‌ها
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border bg-muted p-1 text-xs">
            <button
              onClick={() => setActiveTab("alerts")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all ${
                activeTab === "alerts"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Bell className="h-3.5 w-3.5" />
              هشدارهای فعال ({summary ? toPersianDigits(summary.total_active) : 0})
            </button>
            <button
              onClick={() => setActiveTab("webhooks")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all ${
                activeTab === "webhooks"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Radio className="h-3.5 w-3.5" />
              وب‌هوک و کانال‌ها ({toPersianDigits(webhooks.length)})
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="gap-1.5"
          >
            <RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            <span>پایش مجدد</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiMetricCard
          title="کل هشدارهای نیازمند اقدام"
          value={summary ? toPersianDigits(summary.total_active) : "۰"}
          unit="هشدار"
          status={summary && summary.critical_count > 0 ? "critical" : summary && summary.warning_count > 0 ? "warning" : "normal"}
          subtext="موارد فعال نیازمند توجه مشاور یا مدیر مالی"
          icon={Bell}
        />
        <KpiMetricCard
          title="هشدارهای سطح بحرانی"
          value={summary ? toPersianDigits(summary.critical_count) : "۰"}
          unit="مورد"
          status={summary && summary.critical_count > 0 ? "critical" : "normal"}
          subtext="خطرات فوری نیازمند مداخله زیر ۷ روز"
          icon={ShieldAlert}
        />
        <KpiMetricCard
          title="هشدارهای تاب‌آوری و نقدینگی"
          value={summary ? toPersianDigits(summary.liquidity_count) : "۰"}
          unit="مورد"
          status={summary && summary.liquidity_count > 0 ? "warning" : "normal"}
          subtext="شاخص‌های Runway و چرخه تبدیل وجه نقد"
          icon={Zap}
        />
        <KpiMetricCard
          title="کانال‌های وب‌هوک متصل"
          value={toPersianDigits(webhooks.length)}
          unit="کانال"
          status="normal"
          subtext="ارسال خودکار اعلان‌ها به سامانه‌های خارجی"
          icon={Radio}
        />
      </div>

      {activeTab === "alerts" ? (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">شدت ریسک:</span>
              <button
                onClick={() => setSeverityFilter("all")}
                className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                  severityFilter === "all" ? "bg-primary text-primary-foreground font-semibold" : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                همه ({toPersianDigits(summary?.total_active ?? 0)})
              </button>
              <button
                onClick={() => setSeverityFilter("critical")}
                className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                  severityFilter === "critical" ? "bg-red-600 text-white font-semibold" : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                بحرانی ({toPersianDigits(summary?.critical_count ?? 0)})
              </button>
              <button
                onClick={() => setSeverityFilter("warning")}
                className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                  severityFilter === "warning" ? "bg-amber-500 text-white font-semibold" : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                هشدار ({toPersianDigits(summary?.warning_count ?? 0)})
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">دسته موضوعی:</span>
              <button
                onClick={() => setCategoryFilter("all")}
                className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                  categoryFilter === "all" ? "bg-secondary text-secondary-foreground font-semibold" : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                همه
              </button>
              {(Object.keys(CATEGORY_META) as AlertCategory[]).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                    categoryFilter === cat ? "bg-secondary text-secondary-foreground font-semibold" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {CATEGORY_META[cat].label}
                </button>
              ))}
            </div>
          </div>

          {/* Alerts List */}
          {filteredAlerts.length === 0 ? (
            <Card className="p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-base font-semibold">هیچ هشدار فعالی در این دسته‌بندی یافت نشد</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                شاخص‌های مالی شرکت در این حوزه در محدوده بافر امن قرار دارند.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredAlerts.map((alert) => {
                const catInfo = CATEGORY_META[alert.category];
                const CatIcon = catInfo.icon;
                const isCritical = alert.severity === "critical";

                return (
                  <Card
                    key={alert.id}
                    className={`relative overflow-hidden border transition-all ${
                      isCritical
                        ? "border-red-500/30 bg-red-500/5 dark:bg-red-950/10"
                        : "border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/10"
                    }`}
                  >
                    <div className="p-5">
                      {/* Top row */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/50">
                        <div className="flex items-center gap-2">
                          <RiskBadge level={alert.severity === "critical" ? "critical" : "high"} />
                          <span
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${catInfo.color}`}
                          >
                            <CatIcon className="h-3 w-3" />
                            {catInfo.label}
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(alert.triggered_at).toLocaleTimeString("fa-IR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>

                        {alert.status === "acknowledged" && (
                          <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30 text-xs">
                            مشاهده و در دست پیگیری مشاور
                          </Badge>
                        )}
                      </div>

                      {/* Main narrative */}
                      <div className="mt-3 space-y-2">
                        <h3 className="text-base font-bold tracking-tight text-foreground">
                          {alert.title_fa}
                        </h3>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {alert.summary_fa}
                        </p>
                      </div>

                      {/* Numerical Threshold Comparison Box */}
                      {alert.current_value && alert.threshold_value && (
                        <div className="mt-4 rounded-lg border bg-card/80 p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">مقدار فعلی محاسبه‌شده:</span>
                            <strong className="text-sm font-semibold tabular-nums text-foreground">
                              {alert.metric_unit === "IRR" ? (
                                <MoneyDisplay amount={alert.current_value} />
                              ) : (
                                `${toPersianDigits(alert.current_value)} ${alert.metric_unit}`
                              )}
                            </strong>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">آستانه هشدار سامانه:</span>
                            <span className="font-semibold tabular-nums text-muted-foreground">
                              {alert.metric_unit === "IRR" ? (
                                <MoneyDisplay amount={alert.threshold_value} />
                              ) : (
                                `${toPersianDigits(alert.threshold_value)} ${alert.metric_unit}`
                              )}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Suggested Action Box */}
                      <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs">
                        <strong className="block font-semibold text-amber-900 dark:text-amber-200 mb-1">
                          اقدام پیشنهادی خزانه‌داری / مشاور مالی:
                        </strong>
                        <p className="text-amber-800 dark:text-amber-300 leading-relaxed">
                          {alert.suggested_action_fa}
                        </p>
                      </div>

                      {/* Action note if present */}
                      {alert.action_note && (
                        <div className="mt-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                          <strong>یادداشت مشاور:</strong> {alert.action_note}
                        </div>
                      )}

                      {/* Bottom action buttons */}
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-border/50">
                        <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
                          <Link href={`/companies/${company.id}${alert.target_route}`}>
                            <span>ورود به میزکار تخصصی</span>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </Button>

                        <div className="flex items-center gap-2">
                          {alert.status === "active" && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setAcknowledgingAlert(alert);
                                setAcknowledgeNote("");
                              }}
                              className="text-xs"
                            >
                              مشاهده و پیگیری
                            </Button>
                          )}
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => {
                              setResolvingAlert(alert);
                              setResolveNote("");
                            }}
                            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            ثبت رفع مشکل
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Webhooks & Integration View */
        <div className="space-y-6">
          {/* Create Webhook Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold">افزودن کانال وب‌هوک جدید (Webhook Dispatcher)</CardTitle>
                  <CardDescription className="text-xs">
                    ارسال خودکار هشدارهای نقدینگی و ریسک به تلگرام، بله، ایتا، اسلک یا سیستم مالی مرکزی (ERP)
                  </CardDescription>
                </div>
                <Radio className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => void handleCreateWebhook(e)} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold">نام کانال / سامانه گیرنده</label>
                    <Input
                      placeholder="مثلاً: وب‌هوک بات تلگرام مدیر مالی"
                      value={newWebhook.name}
                      onChange={(e) => setNewWebhook({ ...newWebhook, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold">آدرس اینترنتی وب‌هوک (Endpoint URL)</label>
                    <Input
                      dir="ltr"
                      placeholder="https://api.telegram.org/... یا https://erp.company.com/webhook"
                      value={newWebhook.url}
                      onChange={(e) => setNewWebhook({ ...newWebhook, url: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold">کلید محرمانه / توکن احراز هویت (اختیاری)</label>
                    <Input
                      dir="ltr"
                      placeholder="Bearer token یا امضای اختصاصی"
                      value={newWebhook.secret_token}
                      onChange={(e) => setNewWebhook({ ...newWebhook, secret_token: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold">حداقل سطح هشدار جهت ارسال</label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none"
                      value={newWebhook.min_severity}
                      onChange={(e) =>
                        setNewWebhook({ ...newWebhook, min_severity: e.target.value as AlertSeverity })
                      }
                    >
                      <option value="critical">فقط موارد بحرانی (Critical)</option>
                      <option value="warning">موارد هشدار و بالاتر (Warning & Critical)</option>
                      <option value="info">تمام اطلاعیه‌ها (همه سطوح)</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={creatingWebhook} className="gap-1.5 text-xs">
                    <Plus className="h-4 w-4" />
                    <span>افزودن و فعال‌سازی وب‌هوک</span>
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Test result banner if active */}
          {testResult && (
            <div
              className={`rounded-lg border p-4 text-xs flex items-start justify-between gap-3 ${
                testResult.is_success
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                  : "border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-300"
              }`}
            >
              <div className="space-y-1">
                <strong className="block font-semibold">
                  {testResult.is_success ? "نتیجه تست ارسال: موفقیت‌آمیز" : "نتیجه تست ارسال: عدم موفقیت"}
                </strong>
                <p>{testResult.message}</p>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
                  <span>کد وضعیت HTTP: {testResult.status_code ?? "نامشخص"}</span>
                  <span>زمان پاسخ: {toPersianDigits(testResult.duration_ms)} میلی‌ثانیه</span>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setTestResult(null)} className="h-6 w-6">
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Configured Webhooks List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold">کانال‌های وب‌هوک فعال شرکت</CardTitle>
              <CardDescription className="text-xs">
                فهرست سامانه‌های متصل برای دریافت زنده هشدارهای مالی
              </CardDescription>
            </CardHeader>
            <CardContent>
              {webhooks.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  هنوز هیچ کانال وب‌هوکی تعریف نشده است. از فرم بالا برای اتصال استفاده کنید.
                </div>
              ) : (
                <div className="space-y-3">
                  {webhooks.map((wh) => (
                    <div
                      key={wh.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <strong className="text-sm font-semibold">{wh.name}</strong>
                          <Badge variant="outline" className="text-[11px]">
                            حداقل: {wh.min_severity === "critical" ? "بحرانی" : "هشدار"}
                          </Badge>
                          <span className="flex items-center gap-1 text-[11px] text-emerald-600">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            فعال
                          </span>
                        </div>
                        <p className="text-xs font-mono text-muted-foreground" dir="ltr">
                          {wh.url.length > 50 ? `${wh.url.slice(0, 48)}...` : wh.url}
                        </p>
                        {wh.last_triggered_at && (
                          <span className="block text-[11px] text-muted-foreground">
                            آخرین شلیک: {new Date(wh.last_triggered_at).toLocaleDateString("fa-IR")} (وضعیت: {wh.last_delivery_status === "success" ? "موفق" : "ناموفق"})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={testingWebhookId === wh.id}
                          onClick={() => void handleTestWebhook(wh.id)}
                          className="gap-1.5 text-xs"
                        >
                          <Send className={`h-3.5 w-3.5 ${testingWebhookId === wh.id ? "animate-pulse text-amber-500" : ""}`} />
                          <span>{testingWebhookId === wh.id ? "در حال ارسال تست..." : "تست اتصال (Ping)"}</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void handleDeleteWebhook(wh.id)}
                          className="text-red-500 hover:text-red-600"
                          title="حذف کانال"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Acknowledge Modal Dialog */}
      {acknowledgingAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-base font-bold">تایید و پیگیری هشدار</CardTitle>
              <CardDescription className="text-xs">
                ثبت مشاهده هشدار «{acknowledgingAlert.title_fa}» توسط مشاور مالی
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">یادداشت پیگیری اولیه (اختیاری)</label>
                <Input
                  placeholder="مثلاً: با واحد فروش و خزانه‌داری هماهنگ شد."
                  value={acknowledgeNote}
                  onChange={(e) => setAcknowledgeNote(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setAcknowledgingAlert(null)}>
                  انصراف
                </Button>
                <Button size="sm" disabled={submittingAction} onClick={() => void handleAcknowledge()}>
                  تایید مشاهده
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Resolve Modal Dialog */}
      {resolvingAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-base font-bold">ثبت رفع مشکل و بستن هشدار</CardTitle>
              <CardDescription className="text-xs">
                مستندسازی اقدام اصلاحی برای هشدار «{resolvingAlert.title_fa}»
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">شرح اقدام انجام‌شده (الزامی)</label>
                <textarea
                  className="w-full rounded-md border border-input bg-background p-3 text-xs shadow-sm focus:outline-none"
                  rows={3}
                  placeholder="مثلاً: وصول کامل فاکتور معوق انجام شد و مانده نقد به بافر امن بازگشت."
                  value={resolveNote}
                  onChange={(e) => setResolveNote(e.target.value)}
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setResolvingAlert(null)}>
                  انصراف
                </Button>
                <Button
                  size="sm"
                  disabled={submittingAction}
                  onClick={() => void handleResolve()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  ثبت اقدام و بستن هشدار
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
