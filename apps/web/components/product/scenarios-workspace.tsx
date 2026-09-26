"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  TrendingUp,
  TrendingDown,
  Shield,
  Zap,
  AlertTriangle,
  FileDown,
  BookmarkPlus,
  RefreshCw,
  Users,
  Clock,
  DollarSign,
  AlertOctagon,
  CheckCircle2,
  Bookmark,
  Calendar,
  Layers,
  ArrowRightLeft,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PageHeader,
  MoneyDisplay,
  toPersianDigits,
  StatusChip,
} from "@/components/ui/financial";
import { api } from "@/lib/product-api";
import type {
  Company,
  PresetScenarioItem,
  PresetScenariosResponse,
  SavedScenarioCreateRequest,
  SavedScenarioItem,
  SavedScenariosListResponse,
  SimulationParametersRequest,
  SimulationResultResponse,
} from "@/lib/product-types";

interface ScenariosWorkspaceProps {
  company: Company;
}

const DEFAULT_PARAMS: SimulationParametersRequest = {
  dso_change_days: 0,
  early_settlement_discount_pct: 0,
  discount_adoption_rate_pct: 0,
  new_hires_count: 0,
  avg_salary_monthly_irr: "150000000",
  fixed_cost_monthly_change_irr: "0",
  dpo_change_days: 0,
  shock_customer_id: null,
  shock_delay_days: 0,
  shock_default_pct: 0,
};

export function ScenariosWorkspace({ company }: ScenariosWorkspaceProps) {
  const [params, setParams] = useState<SimulationParametersRequest>(DEFAULT_PARAMS);
  const [presets, setPresets] = useState<PresetScenarioItem[]>([]);
  const [savedScenarios, setSavedScenarios] = useState<SavedScenarioItem[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [result, setResult] = useState<SimulationResultResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Save dialog state
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [scenarioName, setScenarioName] = useState("");
  const [scenarioDesc, setScenarioDesc] = useState("");
  const [savingScenario, setSavingScenario] = useState(false);

  // Load presets & saved scenarios
  const loadInitialData = useCallback(async () => {
    try {
      const [presetsRes, savedRes] = await Promise.all([
        api<PresetScenariosResponse>(`/companies/${company.id}/simulation/presets`),
        api<SavedScenariosListResponse>(`/companies/${company.id}/simulation/scenarios`),
      ]);
      setPresets(presetsRes.items || []);
      setSavedScenarios(savedRes.items || []);
    } catch {
      // Fallback silently if not available yet
    }
  }, [company.id]);

  // Run simulation calculation
  const executeSimulation = useCallback(
    async (overrideParams?: SimulationParametersRequest) => {
      setLoading(true);
      try {
        const payload = overrideParams || params;
        const res = await api<SimulationResultResponse>(
          `/companies/${company.id}/simulation/run`,
          {
            method: "POST",
            body: JSON.stringify(payload),
          }
        );
        setResult(res);
      } catch (err: any) {
        toast.error(err.message || "خطا در محاسبه شبیه‌سازی مالی");
      } finally {
        setLoading(false);
      }
    },
    [company.id, params]
  );

  useEffect(() => {
    void loadInitialData();
    void executeSimulation(DEFAULT_PARAMS);
  }, [loadInitialData, executeSimulation]);

  const handleApplyPreset = (preset: PresetScenarioItem) => {
    setActivePresetId(preset.id);
    setParams(preset.parameters);
    void executeSimulation(preset.parameters);
    toast.success(`سناریوی «${preset.name_fa}» اعمال شد.`);
  };

  const handleResetToBaseline = () => {
    setActivePresetId(null);
    setParams(DEFAULT_PARAMS);
    void executeSimulation(DEFAULT_PARAMS);
    toast.info("پارامترها به وضعیت جاری عملیات بازگردانده شدند.");
  };

  const handleSaveScenario = async () => {
    if (!scenarioName.trim()) {
      toast.error("لطفاً یک عنوان برای سناریو وارد نمایید.");
      return;
    }
    setSavingScenario(true);
    try {
      const req: SavedScenarioCreateRequest = {
        name: scenarioName.trim(),
        description: scenarioDesc.trim() || null,
        parameters: params,
      };
      const created = await api<SavedScenarioItem>(
        `/companies/${company.id}/simulation/scenarios`,
        {
          method: "POST",
          body: JSON.stringify(req),
        }
      );
      setSavedScenarios([created, ...savedScenarios]);
      setSaveDialogOpen(false);
      setScenarioName("");
      setScenarioDesc("");
      toast.success("سناریو با موفقیت در مخزن سناریوهای شرکت ذخیره شد.");
    } catch (err: any) {
      toast.error(err.message || "خطا در ذخیره سناریو");
    } finally {
      setSavingScenario(false);
    }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const res = await fetch(`/api/companies/${company.id}/simulation/memo/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          custom_params: params,
          scenario_title: activePresetId
            ? presets.find((p) => p.id === activePresetId)?.name_fa
            : "شبیه‌سازی تصمیم مالی اختصاصی",
          prepared_for: "هیئت مدیره و مدیریت ارشد مالی",
          memo_subject: "گزارش پیامدهای نقدینگی و تاب‌آوری تصمیم استراتژیک",
        }),
      });

      if (!res.ok) {
        throw new Error("تولید فایل یادداشت تصمیم‌گیری ناموفق بود.");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `یادداشت_تصمیم_گیری_${company.legal_name}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("یادداشت رسمی تصمیم‌گیری (Decision Memo PDF) صادر شد.");
    } catch (err: any) {
      toast.error(err.message || "خطا در دانلود فایل PDF");
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto font-sans" dir="rtl">
      {/* Header */}
      <PageHeader
        title="شبیه‌سازی سناریو و تحلیل پیامد تصمیمات"
        description="پیش‌بینی عواقب تصمیمات راهبردی بر تاب‌آوری نقدینگی، کسری بودجه و تراز سرمایه در گردش، در قالب زبان تصمیم‌گیری"
        primaryAction={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPdf}
              disabled={exportingPdf || loading || !result}
              className="text-xs gap-1.5"
            >
              <FileDown className="h-3.5 w-3.5" />
              {exportingPdf ? "در حال تولید PDF..." : "خروجی یادداشت تصمیم (PDF)"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSaveDialogOpen(true)}
              disabled={loading || !result}
              className="text-xs gap-1.5"
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
              ذخیره سناریو
            </Button>
            <Button
              size="sm"
              onClick={() => void executeSimulation()}
              disabled={loading}
              className="text-xs gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              محاسبه مجدد
            </Button>
          </div>
        }
      />

      {/* Preset Scenarios Ribbon */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-amber-500" />
            سناریوهای استاندارد استراتژیک (Strategic Presets):
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetToBaseline}
            className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
          >
            بازنشانی به مبنا
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {presets.map((preset) => {
            const isActive = activePresetId === preset.id;
            return (
              <Card
                key={preset.id}
                onClick={() => handleApplyPreset(preset)}
                className={`cursor-pointer transition-all border p-3 hover:border-primary/50 shadow-xs ${
                  isActive
                    ? "border-primary bg-primary/5 dark:bg-primary/10 ring-1 ring-primary/30"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-foreground">
                      {preset.id === "cash_preservation" && <Shield className="h-4 w-4 text-emerald-600" />}
                      {preset.id === "aggressive_growth" && <TrendingUp className="h-4 w-4 text-blue-600" />}
                      {preset.id === "recession_stress" && <AlertTriangle className="h-4 w-4 text-rose-600" />}
                    </div>
                    <span className="text-xs font-bold text-foreground">{preset.name_fa}</span>
                  </div>
                  {isActive && (
                    <Badge variant="default" className="text-[10px] px-1.5 py-0 h-5">
                      فعال
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2 line-clamp-2 leading-relaxed">
                  {preset.description_fa}
                </p>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Main Workspace Grid: Controls (Left/Top) & Results (Right/Bottom) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Levers Form Panel (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="border-border bg-card shadow-xs">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                اهرم‌های تصمیم‌گیری مدیریت
              </CardTitle>
              <CardDescription className="text-xs">
                تغییر متغیرها در مقیاس عملیاتی روزمره (بدون فرمول‌های ریاضی مبهم)
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-4 space-y-5 text-xs">
              {/* Lever 1: DSO & Collection Terms */}
              <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="font-bold text-foreground flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-blue-500" />
                  ۱. تسریع یا تعویق وصول مطالبات مشتریان (DSO)
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <Label htmlFor="dso" className="text-[11px]">
                      تغییر در میانگین روزهای وصول مطالبات:
                    </Label>
                    <span className="font-mono font-bold text-foreground">
                      {params.dso_change_days > 0 ? `+${toPersianDigits(params.dso_change_days)}` : toPersianDigits(params.dso_change_days)} روز
                    </span>
                  </div>
                  <Input
                    id="dso"
                    type="number"
                    step="1"
                    value={params.dso_change_days}
                    onChange={(e) =>
                      setParams({ ...params, dso_change_days: parseInt(e.target.value) || 0 })
                    }
                    className="h-8 text-xs font-mono"
                  />
                  <div className="text-[10px] text-muted-foreground">
                    مقادیر منفی به معنی تسریع وصول (مانند ۱۵- روز) و مثبت به معنی تاخیر در وصول است.
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="space-y-1">
                    <Label htmlFor="discount" className="text-[11px]">
                      درصد تخفیف تسویه زودهنگام:
                    </Label>
                    <Input
                      id="discount"
                      type="number"
                      step="0.5"
                      min="0"
                      max="10"
                      value={params.early_settlement_discount_pct}
                      onChange={(e) =>
                        setParams({
                          ...params,
                          early_settlement_discount_pct: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="adoption" className="text-[11px]">
                      پیش‌بینی نرخ استقبال (٪):
                    </Label>
                    <Input
                      id="adoption"
                      type="number"
                      step="5"
                      min="0"
                      max="100"
                      value={params.discount_adoption_rate_pct}
                      onChange={(e) =>
                        setParams({
                          ...params,
                          discount_adoption_rate_pct: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Lever 2: Opex & Hiring */}
              <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="font-bold text-foreground flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-indigo-500" />
                  ۲. استخدام و هزینه‌های ثابت جاری (OPEX)
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="hires" className="text-[11px]">
                      تعداد استخدام جدید (نفر):
                    </Label>
                    <Input
                      id="hires"
                      type="number"
                      min="0"
                      value={params.new_hires_count}
                      onChange={(e) =>
                        setParams({
                          ...params,
                          new_hires_count: parseInt(e.target.value) || 0,
                        })
                      }
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="salary" className="text-[11px]">
                      میانگین حقوق ناخالص ماهانه (ریال):
                    </Label>
                    <Input
                      id="salary"
                      type="number"
                      value={params.avg_salary_monthly_irr.toString()}
                      onChange={(e) =>
                        setParams({
                          ...params,
                          avg_salary_monthly_irr: e.target.value,
                        })
                      }
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="fixed_cost" className="text-[11px]">
                    تغییر ماهانه سایر هزینه‌های ثابت / بازاریابی (ریال):
                  </Label>
                  <Input
                    id="fixed_cost"
                    type="number"
                    value={params.fixed_cost_monthly_change_irr.toString()}
                    onChange={(e) =>
                      setParams({
                        ...params,
                        fixed_cost_monthly_change_irr: e.target.value,
                      })
                    }
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Lever 3: DPO & Payables terms */}
              <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="font-bold text-foreground flex items-center gap-1.5">
                  <ArrowRightLeft className="h-3.5 w-3.5 text-emerald-500" />
                  ۳. مهلت تسویه بستانکاران و تامین‌کنندگان (DPO)
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <Label htmlFor="dpo" className="text-[11px]">
                      تغییر در مهلت بازپرداخت به تامین‌کنندگان:
                    </Label>
                    <span className="font-mono font-bold text-foreground">
                      {params.dpo_change_days > 0 ? `+${toPersianDigits(params.dpo_change_days)}` : toPersianDigits(params.dpo_change_days)} روز
                    </span>
                  </div>
                  <Input
                    id="dpo"
                    type="number"
                    step="1"
                    value={params.dpo_change_days}
                    onChange={(e) =>
                      setParams({ ...params, dpo_change_days: parseInt(e.target.value) || 0 })
                    }
                    className="h-8 text-xs font-mono"
                  />
                  <div className="text-[10px] text-muted-foreground">
                    افزایش مهلت (مثلاً ۱۵+ روز) نقدینگی را موقتاً در خزانه حفظ می‌کند.
                  </div>
                </div>
              </div>

              {/* Lever 4: Shock & Stress */}
              <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="font-bold text-foreground flex items-center gap-1.5">
                  <AlertOctagon className="h-3.5 w-3.5 text-rose-500" />
                  ۴. آزمون بحران و سوخت فرضی مطالبات (Stress Shock)
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="shock_default" className="text-[11px]">
                      درصد سوخت یا عدم وصول طلب:
                    </Label>
                    <Input
                      id="shock_default"
                      type="number"
                      min="0"
                      max="100"
                      value={params.shock_default_pct}
                      onChange={(e) =>
                        setParams({
                          ...params,
                          shock_default_pct: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="shock_delay" className="text-[11px]">
                      تاخیر بحرانی وصول (روز):
                    </Label>
                    <Input
                      id="shock_delay"
                      type="number"
                      min="0"
                      value={params.shock_delay_days}
                      onChange={(e) =>
                        setParams({
                          ...params,
                          shock_delay_days: parseInt(e.target.value) || 0,
                        })
                      }
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            </CardContent>

            <CardFooter className="pt-2 border-t border-border/50">
              <Button
                className="w-full text-xs font-bold gap-1.5"
                onClick={() => void executeSimulation()}
                disabled={loading}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                {loading ? "در حال اجرای موتور شبیه‌سازی..." : "اجرای فوری سناریو و تحلیل پیامد"}
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Results & Comparative Matrix Panel (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {result && (
            <>
              {/* Executive Verdict Box */}
              <div
                className={`p-4 rounded-xl border leading-relaxed text-xs space-y-1.5 shadow-xs ${
                  result.runway_days_delta.is_improvement
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-950 dark:text-rose-200"
                }`}
              >
                <div className="font-extrabold flex items-center gap-1.5 text-sm">
                  {result.runway_days_delta.is_improvement ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                  )}
                  جمع‌بندی تحلیلی خزانه‌داری (Executive Verdict):
                </div>
                <p>{result.executive_verdict_fa}</p>
              </div>

              {/* Risk Warnings (if any) */}
              {result.risk_warnings_fa && result.risk_warnings_fa.length > 0 && (
                <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-200 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1 text-[11px]">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    هشدارهای ریسک مرتبط با این تصمیم:
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                    {result.risk_warnings_fa.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Comparative Delta Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {/* Card 1: Runway */}
                <Card className="p-3 border-border bg-card shadow-xs space-y-1">
                  <span className="text-[11px] text-muted-foreground font-medium">تاب‌آوری نقدی (Runway)</span>
                  <div className="flex items-baseline justify-between">
                    <span className="text-lg font-black font-mono text-foreground">
                      {toPersianDigits(result.runway_days_delta.simulated_value)} <span className="text-[10px] font-normal">روز</span>
                    </span>
                    <Badge
                      variant={result.runway_days_delta.is_improvement ? "success" : "danger"}
                      className="text-[10px] px-1 py-0 h-4 font-mono"
                    >
                      {Number(result.runway_days_delta.delta_value) > 0 ? "+" : ""}
                      {toPersianDigits(result.runway_days_delta.delta_value)}
                    </Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    مبنا: {toPersianDigits(result.runway_days_delta.baseline_value)} روز
                  </div>
                </Card>

                {/* Card 2: Monthly Burn */}
                <Card className="p-3 border-border bg-card shadow-xs space-y-1">
                  <span className="text-[11px] text-muted-foreground font-medium">سوزاندن نقدینگی ماهانه</span>
                  <div className="text-sm font-extrabold font-mono text-foreground truncate">
                    <MoneyDisplay amount={Number(result.monthly_burn_rate_delta.simulated_value)} />
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    تغییر:{" "}
                    <span
                      className={
                        result.monthly_burn_rate_delta.is_improvement ? "text-emerald-600" : "text-rose-600"
                      }
                    >
                      {Number(result.monthly_burn_rate_delta.delta_value) > 0 ? "+" : ""}
                      <MoneyDisplay amount={Number(result.monthly_burn_rate_delta.delta_value)} />
                    </span>
                  </div>
                </Card>

                {/* Card 3: CCC */}
                <Card className="p-3 border-border bg-card shadow-xs space-y-1">
                  <span className="text-[11px] text-muted-foreground font-medium">چرخه تبدیل وجه نقد (CCC)</span>
                  <div className="flex items-baseline justify-between">
                    <span className="text-lg font-black font-mono text-foreground">
                      {toPersianDigits(result.cash_conversion_cycle_delta.simulated_value)} <span className="text-[10px] font-normal">روز</span>
                    </span>
                    <Badge
                      variant={result.cash_conversion_cycle_delta.is_improvement ? "success" : "danger"}
                      className="text-[10px] px-1 py-0 h-4 font-mono"
                    >
                      {Number(result.cash_conversion_cycle_delta.delta_value) > 0 ? "+" : ""}
                      {toPersianDigits(result.cash_conversion_cycle_delta.delta_value)}
                    </Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    مبنا: {toPersianDigits(result.cash_conversion_cycle_delta.baseline_value)} روز
                  </div>
                </Card>

                {/* Card 4: Liquidity Released */}
                <Card className="p-3 border-border bg-card shadow-xs space-y-1">
                  <span className="text-[11px] text-muted-foreground font-medium">نقدینگی آزادشده از تصمیم</span>
                  <div className="text-sm font-extrabold font-mono text-foreground truncate">
                    <MoneyDisplay amount={Number(result.liquidity_released_irr)} />
                  </div>
                  <div className="text-[10px] text-muted-foreground">ورود فوری به جریان نقد خزانه</div>
                </Card>

                {/* Card 5: Annual Profit Impact */}
                <Card className="p-3 border-border bg-card shadow-xs space-y-1">
                  <span className="text-[11px] text-muted-foreground font-medium">اثر سالانه بر سود خالص</span>
                  <div
                    className={`text-sm font-extrabold font-mono truncate ${
                      Number(result.net_annual_profit_impact_irr) >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    <MoneyDisplay amount={Number(result.net_annual_profit_impact_irr)} />
                  </div>
                  <div className="text-[10px] text-muted-foreground">با احتساب هزینه تخفیف و پرسنل</div>
                </Card>

                {/* Card 6: First Deficit Week */}
                <Card className="p-3 border-border bg-card shadow-xs space-y-1">
                  <span className="text-[11px] text-muted-foreground font-medium">هفته نخست بروز کسری</span>
                  <div className="text-sm font-extrabold text-foreground">
                    {result.first_deficit_week_simulated ? (
                      <span className="text-rose-600 font-mono">
                        هفته {toPersianDigits(result.first_deficit_week_simulated)}
                      </span>
                    ) : (
                      <span className="text-emerald-600">بدون کسری در افق ۱۳ هفته</span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    مبنا:{" "}
                    {result.first_deficit_week_baseline
                      ? `هفته ${toPersianDigits(result.first_deficit_week_baseline)}`
                      : "بدون کسری"}
                  </div>
                </Card>
              </div>

              {/* 13-Week Trajectory Table */}
              <Card className="border-border bg-card shadow-xs">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-primary" />
                      مسیر ۱۳ هفته‌ای تراز پایانی نقدینگی (مبنا در برابر سناریو)
                    </span>
                    <span className="text-[11px] text-muted-foreground font-normal">
                      واحد: ریال ایران
                    </span>
                  </CardTitle>
                </CardHeader>

                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-[340px]">
                    <Table>
                      <TableHeader className="bg-muted/40 sticky top-0">
                        <TableRow className="text-[11px]">
                          <TableHead className="w-14 text-center">هفته</TableHead>
                          <TableHead>مانده نقدی مبنا</TableHead>
                          <TableHead>مانده نقدی سناریو</TableHead>
                          <TableHead>ورودی شبیه‌سازی</TableHead>
                          <TableHead>خروجی شبیه‌سازی</TableHead>
                          <TableHead className="text-center">وضعیت تراز</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.weeks.map((w) => (
                          <TableRow key={w.week_number} className="text-xs hover:bg-muted/30">
                            <TableCell className="text-center font-bold font-mono">
                              {toPersianDigits(w.week_number)}
                            </TableCell>
                            <TableCell className="font-mono text-muted-foreground">
                              <MoneyDisplay amount={Number(w.baseline_closing_cash_irr)} />
                            </TableCell>
                            <TableCell
                              className={`font-mono font-bold ${
                                w.is_simulated_deficit ? "text-rose-600" : "text-foreground"
                              }`}
                            >
                              <MoneyDisplay amount={Number(w.simulated_closing_cash_irr)} />
                            </TableCell>
                            <TableCell className="font-mono text-emerald-600 dark:text-emerald-400">
                              +<MoneyDisplay amount={Number(w.simulated_inflows_irr)} />
                            </TableCell>
                            <TableCell className="font-mono text-muted-foreground">
                              -<MoneyDisplay amount={Number(w.simulated_outflows_irr)} />
                            </TableCell>
                            <TableCell className="text-center">
                              {w.is_simulated_deficit ? (
                                <Badge variant="danger" className="text-[10px] px-1 py-0">
                                  کسری نقد
                                </Badge>
                              ) : (
                                <Badge variant="success" className="text-[10px] px-1 py-0">
                                  امن
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Save Scenario Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="max-w-md font-sans" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-1.5">
              <Bookmark className="h-4 w-4 text-primary" />
              ذخیره سناریو در آرشیو تحلیلی شرکت
            </DialogTitle>
            <DialogDescription className="text-xs">
              ثبت این پیش‌بینی و پارامترها برای مقایسه در ماتریس چند سناریویی و جلسات هیئت مدیره
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label htmlFor="s_name" className="text-[11px]">
                عنوان سناریو:
              </Label>
              <Input
                id="s_name"
                placeholder="مثال: سناریوی توسعه بهاره با تسهیلات وصول"
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="s_desc" className="text-[11px]">
                توضیحات یا فرضیات مدیریتی:
              </Label>
              <Input
                id="s_desc"
                placeholder="دلایل انتخاب اهرم‌ها و اهداف استراتژیک"
                value={scenarioDesc}
                onChange={(e) => setScenarioDesc(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSaveDialogOpen(false)}
              className="text-xs"
            >
              انصراف
            </Button>
            <Button
              size="sm"
              onClick={handleSaveScenario}
              disabled={savingScenario}
              className="text-xs font-bold"
            >
              {savingScenario ? "در حال ذخیره..." : "ذخیره سناریو"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
