"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertOctagon,
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Code,
  Copy,
  ExternalLink,
  Plus,
  Radio,
  RefreshCcw,
  Send,
  ShieldAlert,
  SlidersHorizontal,
  Terminal,
  Trash2,
  X,
  Zap,
} from "@/components/ui/icons";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { SelectField, SelectOption } from "./select-field";

const CATEGORY_META: Record<
  AlertCategory,
  { label: string; icon: typeof AlertTriangle; color: string }
> = {
  liquidity: {
    label: "نقدینگی و تاب‌آوری",
    icon: Zap,
    color: "text-ds-warning bg-ds-warning/10 border-ds-warning/20",
  },
  credit_risk: {
    label: "ریسک اعتباری و وصول",
    icon: ShieldAlert,
    color: "text-ds-danger bg-ds-danger/10 border-ds-danger/20",
  },
  supply_chain: {
    label: "زنجیره تامین و بدهی‌ها",
    icon: AlertOctagon,
    color: "text-ds-warning bg-ds-warning/10 border-ds-warning/20",
  },
  compliance: {
    label: "انطباق و مغایرت بانکی",
    icon: AlertTriangle,
    color: "text-primary bg-primary/10 border-primary/20",
  },
};

export function AlertsWorkspace({ company }: { company: Company }) {
  const [activeTab, setActiveTab] = useState<"alerts" | "webhooks">("alerts");
  const [severityFilter, setSeverityFilter] = useState<"all" | AlertSeverity>(
    "all",
  );
  const [categoryFilter, setCategoryFilter] = useState<"all" | AlertCategory>(
    "all",
  );
  const [summary, setSummary] = useState<AlertsSummaryResponse | null>(null);
  const [webhooks, setWebhooks] = useState<AlertWebhookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modals / Actions
  const [acknowledgingAlert, setAcknowledgingAlert] =
    useState<EarlyWarningAlertItem | null>(null);
  const [acknowledgeNote, setAcknowledgeNote] = useState("");
  const [resolvingAlert, setResolvingAlert] =
    useState<EarlyWarningAlertItem | null>(null);
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
  const [testResult, setTestResult] = useState<AlertWebhookTestResult | null>(
    null,
  );
  const [copiedPayload, setCopiedPayload] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [sumRes, whRes] = await Promise.all([
        api<AlertsSummaryResponse>(`/companies/${company.id}/alerts/summary`),
        api<AlertWebhooksListResponse>(
          `/companies/${company.id}/alerts/webhooks`,
        ),
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
    toast.success(
      "وضعیت هشدارهای زودهنگام با داده‌های جدید پایش و به‌روزرسانی شد.",
    );
  };

  const handleAcknowledge = async () => {
    if (!acknowledgingAlert) return;
    setSubmittingAction(true);
    try {
      await api(
        `/companies/${company.id}/alerts/${acknowledgingAlert.id}/acknowledge`,
        {
          method: "POST",
          body: JSON.stringify({ note: acknowledgeNote.trim() || undefined }),
        },
      );
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
      await api(
        `/companies/${company.id}/alerts/${resolvingAlert.id}/resolve`,
        {
          method: "POST",
          body: JSON.stringify({ action_note: resolveNote.trim() }),
        },
      );
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
      setNewWebhook({
        name: "",
        url: "",
        secret_token: "",
        min_severity: "warning",
      });
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
        { method: "POST" },
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
      if (severityFilter !== "all" && a.severity !== severityFilter)
        return false;
      if (categoryFilter !== "all" && a.category !== categoryFilter)
        return false;
      return true;
    });
  }, [summary, severityFilter, categoryFilter]);

  if (loading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3">
        <RefreshCcw className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          در حال پایش و ارزیابی هشدارهای زودهنگام مالی...
        </p>
      </div>
    );
  }

  return (
    <div className="pp-page pp-alerts space-y-6" dir="rtl">
      {/* Header section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-normal">
              مرکز پایش هشدارهای مالی
            </h1>
            <Badge
              variant="outline"
              className="text-xs bg-ds-warning/10 text-ds-warning border-ds-warning/30"
            >
              سامانه هشدار زودهنگام
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border bg-muted p-1 text-xs">
            <Button
              variant="surface"
              size="auto"
              motion="none"
              onClick={() => setActiveTab("alerts")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all ${
                activeTab === "alerts"
                  ? "bg-background text-foreground shadow-[var(--ds-shadow-sm)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Bell className="h-3.5 w-3.5" />
              هشدارهای فعال (
              {summary ? toPersianDigits(summary.total_active) : 0})
            </Button>
            <Button
              variant="surface"
              size="auto"
              motion="none"
              onClick={() => setActiveTab("webhooks")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all ${
                activeTab === "webhooks"
                  ? "bg-background text-foreground shadow-[var(--ds-shadow-sm)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Radio className="h-3.5 w-3.5" />
              وب‌هوک و کانال‌ها ({toPersianDigits(webhooks.length)})
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="gap-1.5"
          >
            <RefreshCcw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            <span>پایش مجدد</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="pp-metric-strip grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiMetricCard
          currency=""
          title="کل هشدارهای نیازمند اقدام"
          value={summary ? toPersianDigits(summary.total_active) : "۰"}
          unit="هشدار"
          status={
            summary && summary.critical_count > 0
              ? "critical"
              : summary && summary.warning_count > 0
                ? "warning"
                : "normal"
          }
          subtext="موارد فعال نیازمند توجه مشاور یا مدیر مالی"
          icon={Bell}
        />
        <KpiMetricCard
          currency=""
          title="هشدارهای سطح بحرانی"
          value={summary ? toPersianDigits(summary.critical_count) : "۰"}
          unit="مورد"
          status={summary && summary.critical_count > 0 ? "critical" : "normal"}
          subtext="خطرات فوری نیازمند مداخله زیر ۷ روز"
          icon={ShieldAlert}
        />
        <KpiMetricCard
          currency=""
          title="هشدارهای تاب‌آوری و نقدینگی"
          value={summary ? toPersianDigits(summary.liquidity_count) : "۰"}
          unit="مورد"
          status={summary && summary.liquidity_count > 0 ? "warning" : "normal"}
          subtext="شاخص‌های Runway و چرخه تبدیل وجه نقد"
          icon={Zap}
        />
        <KpiMetricCard
          currency=""
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
              <span className="text-xs font-semibold text-muted-foreground">
                شدت ریسک:
              </span>
              <Button
                variant="surface"
                size="auto"
                motion="none"
                onClick={() => setSeverityFilter("all")}
                className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                  severityFilter === "all"
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                همه ({toPersianDigits(summary?.total_active ?? 0)})
              </Button>
              <Button
                variant="surface"
                size="auto"
                motion="none"
                onClick={() => setSeverityFilter("critical")}
                className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                  severityFilter === "critical"
                    ? "bg-ds-danger text-white font-semibold"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                بحرانی ({toPersianDigits(summary?.critical_count ?? 0)})
              </Button>
              <Button
                variant="surface"
                size="auto"
                motion="none"
                onClick={() => setSeverityFilter("warning")}
                className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                  severityFilter === "warning"
                    ? "bg-ds-warning text-white font-semibold"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                هشدار ({toPersianDigits(summary?.warning_count ?? 0)})
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">
                دسته موضوعی:
              </span>
              <Button
                variant="surface"
                size="auto"
                motion="none"
                onClick={() => setCategoryFilter("all")}
                className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                  categoryFilter === "all"
                    ? "bg-secondary text-secondary-foreground font-semibold"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                همه
              </Button>
              {(Object.keys(CATEGORY_META) as AlertCategory[]).map((cat) => (
                <Button
                  variant="surface"
                  size="auto"
                  motion="none"
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                    categoryFilter === cat
                      ? "bg-secondary text-secondary-foreground font-semibold"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {CATEGORY_META[cat].label}
                </Button>
              ))}
            </div>
          </div>

          {/* Alerts List */}
          {filteredAlerts.length === 0 ? (
            <Card className="p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ds-success/10 text-ds-success">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-base font-semibold">
                هیچ هشدار فعالی در این دسته‌بندی یافت نشد
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                فیلترها را بررسی کنید؛ نبود هشدار در این فهرست به‌تنهایی وضعیت
                مالی را تأیید نمی‌کند.
              </p>
            </Card>
          ) : (
            <div className="pp-alert-list grid grid-cols-1 gap-4">
              {filteredAlerts.map((alert) => {
                const catInfo = CATEGORY_META[alert.category];
                const CatIcon = catInfo.icon;
                const isCritical = alert.severity === "critical";

                return (
                  <Card
                    key={alert.id}
                    className={`group relative overflow-hidden border hover:border-primary/50   transition-all duration-200 ${
                      isCritical
                        ? "border-ds-danger/30 bg-ds-danger/5"
                        : "border-ds-warning/30 bg-ds-warning/5"
                    }`}
                  >
                    <div className="p-5">
                      {/* Top row */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/50">
                        <div className="flex items-center gap-2">
                          <RiskBadge
                            level={
                              alert.severity === "critical"
                                ? "critical"
                                : "high"
                            }
                          />
                          <span
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-transform duration-200  ${catInfo.color}`}
                          >
                            <CatIcon className="h-3 w-3" />
                            {catInfo.label}
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(alert.triggered_at).toLocaleTimeString(
                              "fa-IR",
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </span>
                        </div>

                        {alert.status === "acknowledged" && (
                          <Badge
                            variant="outline"
                            className="bg-primary/10 text-primary border-primary/30 text-xs"
                          >
                            مشاهده و در دست پیگیری مشاور
                          </Badge>
                        )}
                      </div>

                      {/* Main narrative */}
                      <div className="mt-3 space-y-2">
                        <h3 className="text-base font-bold tracking-normal text-foreground">
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
                            <span className="text-muted-foreground">
                              مقدار فعلی محاسبه‌شده:
                            </span>
                            <strong className="text-sm font-semibold tabular-nums text-foreground">
                              {alert.metric_unit === "IRR" ? (
                                <MoneyDisplay amount={alert.current_value} />
                              ) : (
                                `${toPersianDigits(alert.current_value)} ${alert.metric_unit}`
                              )}
                            </strong>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">
                              آستانه هشدار سامانه:
                            </span>
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
                      <div className="mt-3 rounded-lg border border-ds-warning/20 bg-ds-warning/10 p-3 text-xs">
                        <strong className="block font-semibold text-ds-warning mb-1">
                          اقدام پیشنهادی خزانه‌داری / مشاور مالی:
                        </strong>
                        <p className="text-ds-warning leading-relaxed">
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
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                        >
                          <Link
                            href={`/companies/${company.id}${alert.target_route}`}
                          >
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
                              className=""
                            >
                              مشاهده و پیگیری
                            </Button>
                          )}
                          <Button
                            variant="success"
                            size="sm"
                            onClick={() => {
                              setResolvingAlert(alert);
                              setResolveNote("");
                            }}
                            className=""
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
                  <CardTitle className="text-base font-bold">
                    افزودن وب‌هوک ارسال هشدار
                  </CardTitle>
                </div>
                <Radio className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => void handleCreateWebhook(e)}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold">
                      نام سامانه گیرنده
                    </label>
                    <Input
                      placeholder="مثلاً: وب‌هوک بات تلگرام مدیر مالی"
                      value={newWebhook.name}
                      onChange={(e) =>
                        setNewWebhook({ ...newWebhook, name: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold">
                      آدرس وب‌هوک (Endpoint URL)
                    </label>
                    <Input
                      dir="ltr"
                      placeholder="https://api.telegram.org/... یا https://erp.company.com/webhook"
                      value={newWebhook.url}
                      onChange={(e) =>
                        setNewWebhook({ ...newWebhook, url: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold">
                      کلید محرمانه (اختیاری)
                    </label>
                    <Input
                      dir="ltr"
                      placeholder="Bearer token یا امضای اختصاصی"
                      value={newWebhook.secret_token}
                      onChange={(e) =>
                        setNewWebhook({
                          ...newWebhook,
                          secret_token: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold">
                      حداقل سطح هشدار جهت ارسال
                    </label>
                    <SelectField
                      className="w-full"
                      value={newWebhook.min_severity}
                      onChange={(e) =>
                        setNewWebhook({
                          ...newWebhook,
                          min_severity: e.target.value as AlertSeverity,
                        })
                      }
                    >
                      <SelectOption value="critical">
                        فقط موارد بحرانی (Critical)
                      </SelectOption>
                      <SelectOption value="warning">
                        موارد هشدار و بالاتر (Warning & Critical)
                      </SelectOption>
                      <SelectOption value="info">
                        تمام اطلاعیه‌ها (همه سطوح)
                      </SelectOption>
                    </SelectField>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    disabled={creatingWebhook}
                    className="gap-1.5"
                  >
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
                  ? "border-ds-success/30 bg-ds-success/10 text-ds-success"
                  : "border-ds-danger/30 bg-ds-danger/10 text-ds-danger"
              }`}
            >
              <div className="space-y-1">
                <strong className="block font-semibold">
                  {testResult.is_success
                    ? "نتیجه تست ارسال: موفقیت‌آمیز"
                    : "نتیجه تست ارسال: عدم موفقیت"}
                </strong>
                <p>{testResult.message}</p>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
                  <span>
                    کد وضعیت HTTP: {testResult.status_code ?? "نامشخص"}
                  </span>
                  <span>
                    زمان پاسخ: {toPersianDigits(testResult.duration_ms)}{" "}
                    میلی‌ثانیه
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTestResult(null)}
                className="w-6"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Configured Webhooks List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold">
                وب‌هوک‌های فعال
              </CardTitle>
            </CardHeader>
            <CardContent>
              {webhooks.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  هنوز هیچ کانال وب‌هوکی تعریف نشده است. از فرم بالا برای اتصال
                  استفاده کنید.
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
                          <strong className="text-sm font-semibold">
                            {wh.name}
                          </strong>
                          <Badge variant="outline" className="text-[11px]">
                            حداقل:{" "}
                            {wh.min_severity === "critical"
                              ? "بحرانی"
                              : "هشدار"}
                          </Badge>
                          <span className="flex items-center gap-1 text-[11px] text-ds-success">
                            <span className="h-2 w-2 rounded-full bg-ds-success" />
                            فعال
                          </span>
                        </div>
                        <p
                          className="text-xs font-mono text-muted-foreground"
                          dir="ltr"
                        >
                          {wh.url.length > 50
                            ? `${wh.url.slice(0, 48)}...`
                            : wh.url}
                        </p>
                        {wh.last_triggered_at && (
                          <span className="block text-[11px] text-muted-foreground">
                            آخرین شلیک:{" "}
                            {new Date(wh.last_triggered_at).toLocaleDateString(
                              "fa-IR",
                            )}{" "}
                            (وضعیت:{" "}
                            {wh.last_delivery_status === "success"
                              ? "موفق"
                              : "ناموفق"}
                            )
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={testingWebhookId === wh.id}
                          onClick={() => void handleTestWebhook(wh.id)}
                          className="gap-1.5"
                        >
                          <Send
                            className={`h-3.5 w-3.5 ${testingWebhookId === wh.id ? "animate-pulse text-ds-warning" : ""}`}
                          />
                          <span>
                            {testingWebhookId === wh.id
                              ? "در حال ارسال تست..."
                              : "تست اتصال (Ping)"}
                          </span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void handleDeleteWebhook(wh.id)}
                          className="text-ds-danger hover:text-ds-danger"
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

          {/* Webhook JSON Payload Simulator Card */}
          <Card className="border-[var(--ds-border)] bg-[var(--ds-card)] shadow-xs overflow-hidden">
            <CardHeader className="p-4 pb-3 border-b border-[var(--ds-border)] flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Code className="size-4" />
                </div>
                <div>
                  <CardTitle className="text-xs sm:text-sm font-bold text-[var(--ds-card-fg)]">
                    پیش‌نمایش بدنه ارسالی وب‌هوک (Webhook Payload Schema)
                  </CardTitle>
                  <p className="text-[11px] text-[var(--ds-muted-fg)]">
                    نمونه ساختار داده ارسالی از سامانه دیدبان مالی به سمت سرور
                    یا اتوماسیون شما
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const samplePayload = JSON.stringify(
                    {
                      event: "financial_alert.triggered",
                      company_id: company.id,
                      alert_id: "alt_demo_9824",
                      severity: "critical",
                      category: "liquidity",
                      title_fa: "ریسک کسری نقدینگی و فرسایش بافر امن خزانه",
                      affected_amount_irr: 850000000,
                      recommended_action:
                        "تسریع وصول فاکتورهای معوق مشتریان عمده و توقف تعهدات غیرضروری",
                      triggered_at: new Date().toISOString(),
                    },
                    null,
                    2,
                  );
                  try {
                    await navigator.clipboard.writeText(samplePayload);
                    setCopiedPayload(true);
                    toast.success("نمونه بدنه وب‌هوک در کلیپ‌بورد کپی شد.");
                    setTimeout(() => setCopiedPayload(false), 2000);
                  } catch {
                    toast.error("کپی ناموفق بود.");
                  }
                }}
                className="gap-1"
              >
                {copiedPayload ? (
                  <Check className="size-3 text-ds-success" />
                ) : (
                  <Copy className="size-3" />
                )}
                <span>{copiedPayload ? "کپی شد" : "کپی ساختار JSON"}</span>
              </Button>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div
                className="relative rounded-lg bg-zinc-950 p-4 font-mono text-xs text-ds-success overflow-x-auto shadow-inner border border-zinc-800"
                dir="ltr"
              >
                <pre>{`{
  "event": "financial_alert.triggered",
  "company_id": "${company.id}",
  "alert_id": "alt_demo_9824",
  "severity": "critical",
  "category": "liquidity",
  "title_fa": "ریسک کسری نقدینگی و فرسایش بافر امن خزانه",
  "affected_amount_irr": 850000000,
  "recommended_action": "تسریع وصول فاکتورهای معوق مشتریان عمده و توقف تعهدات غیرضروری",
  "triggered_at": "${new Date().toISOString()}"
}`}</pre>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 text-xs text-[var(--ds-muted-fg)] border-t border-[var(--ds-border)]/60">
                <div className="flex items-center gap-2">
                  <Terminal className="size-3.5 text-primary" />
                  <span>پشتیبانی از هدر اختصاصی امضا:</span>
                  <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono">
                    X-Didban-Signature: sha256=...
                  </code>
                </div>
                <Link href={`/companies/${company.id}/control-policies`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 hover:bg-transparent"
                  >
                    <SlidersHorizontal className="size-3" />
                    <span>تنظیم آستانه‌ها و سیاست‌های کنترلی</span>
                    <ExternalLink className="size-3" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Acknowledge Modal Dialog */}
      <Dialog
        open={!!acknowledgingAlert}
        onOpenChange={(open) => !open && setAcknowledgingAlert(null)}
      >
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              تایید و پیگیری هشدار مالی
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {acknowledgingAlert?.title_fa}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                یادداشت پیگیری اولیه (اختیاری):
              </label>
              <Input
                size="sm"
                placeholder="مثلاً: با واحد فروش و خزانه‌داری هماهنگ شد."
                value={acknowledgeNote}
                onChange={(e) => setAcknowledgeNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="flex-row items-center justify-end gap-2 border-t border-border pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAcknowledgingAlert(null)}
              className=""
            >
              انصراف
            </Button>
            <Button
              size="sm"
              disabled={submittingAction}
              onClick={() => void handleAcknowledge()}
              className=""
            >
              تایید مشاهده
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve Modal Dialog */}
      <Dialog
        open={!!resolvingAlert}
        onOpenChange={(open) => !open && setResolvingAlert(null)}
      >
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              ثبت رفع مشکل و بستن هشدار
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {resolvingAlert?.title_fa}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                شرح اقدام انجام‌شده (الزامی):
              </label>
              <Textarea
                className="w-full"
                rows={3}
                placeholder="مثلاً: وصول کامل فاکتور معوق انجام شد و مانده نقد به بافر امن بازگشت."
                value={resolveNote}
                onChange={(e) => setResolveNote(e.target.value)}
                required
              />
            </div>
          </div>
          <DialogFooter className="flex-row items-center justify-end gap-2 border-t border-border pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setResolvingAlert(null)}
              className=""
            >
              انصراف
            </Button>
            <Button
              variant="success"
              size="sm"
              disabled={submittingAction}
              onClick={() => void handleResolve()}
              className=""
            >
              ثبت اقدام و بستن هشدار
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
