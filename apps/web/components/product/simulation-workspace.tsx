"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  BookmarkPlus,
  Check,
  CheckCircle2,
  Clock,
  Coins,
  Columns,
  DollarSign,
  Download,
  FileText,
  Flame,
  Plus,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Column,
  FinancialDataTable,
  KpiMetricCard,
  MoneyDisplay,
  toPersianDigits,
} from "@/components/ui/financial";
import { Slider } from "@/components/ui/slider";

import { api } from "@/lib/product-api";
import type {
  Company,
  ComparativeMatrixColumn,
  ComparativeMatrixResponse,
  PresetScenarioItem,
  PresetScenariosResponse,
  SavedScenarioItem,
  SavedScenariosListResponse,
  SimulatedWeekItem,
  SimulationParametersRequest,
  SimulationResultResponse,
} from "@/lib/product-types";

import { DecisionMemoDialog } from "./decision-memo-dialog";
import { SaveScenarioDialog } from "./save-scenario-dialog";

const DEFAULT_PARAMS: SimulationParametersRequest = {
  dso_change_days: 0,
  early_settlement_discount_pct: 0,
  discount_adoption_rate_pct: 0,
  new_hires_count: 0,
  avg_salary_monthly_irr: "350000000",
  fixed_cost_monthly_change_irr: "0",
  dpo_change_days: 0,
  shock_customer_id: null,
  shock_delay_days: 0,
  shock_default_pct: 0,
};

const FALLBACK_PRESETS: PresetScenarioItem[] = [
  {
    id: "cash_preservation",
    name_fa: "حالت بقا و انباشت نقدینگی (Cash Defense)",
    description_fa:
      "تسریع ۱۵ روزه وصول مطالبات با ۲٪ تخفیف نقدی، افزایش ۱۵ روزه مهلت تسویه بستانکاران و توقف کامل استخدام.",
    icon: "shield",
    parameters: {
      dso_change_days: -15,
      early_settlement_discount_pct: 2,
      discount_adoption_rate_pct: 35,
      new_hires_count: 0,
      avg_salary_monthly_irr: "0",
      fixed_cost_monthly_change_irr: "0",
      dpo_change_days: 15,
      shock_customer_id: null,
      shock_delay_days: 0,
      shock_default_pct: 0,
    },
  },
  {
    id: "aggressive_growth",
    name_fa: "توسعه و رشد تهاجمی (Aggressive Expansion)",
    description_fa:
      "استخدام ۴ نیروی جدید، اعطای شرایط منعطف‌تر اعتباری به خریداران (+۱۰ روز) جهت تسخیر سهم بازار.",
    icon: "chart",
    parameters: {
      dso_change_days: 10,
      early_settlement_discount_pct: 0,
      discount_adoption_rate_pct: 0,
      new_hires_count: 4,
      avg_salary_monthly_irr: "350000000",
      fixed_cost_monthly_change_irr: "1500000000",
      dpo_change_days: 0,
      shock_customer_id: null,
      shock_delay_days: 0,
      shock_default_pct: 0,
    },
  },
  {
    id: "recession_stress",
    name_fa: "تست استرس رکود و شوک وصول (Recession Stress)",
    description_fa:
      "تعویق ۲۵ روزه وصولی‌ها، سوخت فرضی ۱۰٪ مطالبات و افزایش هزینه‌های سربار به دلیل تورم.",
    icon: "alert",
    parameters: {
      dso_change_days: 25,
      early_settlement_discount_pct: 0,
      discount_adoption_rate_pct: 0,
      new_hires_count: 0,
      avg_salary_monthly_irr: "0",
      fixed_cost_monthly_change_irr: "1500000000",
      dpo_change_days: -10,
      shock_customer_id: null,
      shock_delay_days: 30,
      shock_default_pct: 10,
    },
  },
];

export function SimulationWorkspace({ company }: { company: Company }) {
  const [activeTab, setActiveTab] = useState<"simulator" | "matrix">("simulator");
  const [params, setParams] = useState<SimulationParametersRequest>(DEFAULT_PARAMS);
  const [presets, setPresets] = useState<PresetScenarioItem[]>(FALLBACK_PRESETS);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [result, setResult] = useState<SimulationResultResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Saved scenarios state
  const [savedScenarios, setSavedScenarios] = useState<SavedScenarioItem[]>([]);
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<string[]>([]);
  const [matrixData, setMatrixData] = useState<ComparativeMatrixResponse | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);

  // Dialogs state
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [memoDialogOpen, setMemoDialogOpen] = useState(false);

  // 1. Fetch Presets & Saved Scenarios on Mount
  useEffect(() => {
    let ignore = false;
    api<PresetScenariosResponse>(`/companies/${company.id}/simulation/presets`)
      .then((res) => {
        if (!ignore && res.items?.length > 0) {
          setPresets(res.items);
        }
      })
      .catch(() => {
        // Silently use realistic fallback presets
      });

    api<SavedScenariosListResponse>(`/companies/${company.id}/simulation/scenarios`)
      .then((res) => {
        if (!ignore && res.items) {
          setSavedScenarios(res.items);
          if (res.items.length > 0) {
            setSelectedScenarioIds(res.items.slice(0, 2).map((s) => s.id));
          }
        }
      })
      .catch(() => {});

    return () => {
      ignore = true;
    };
  }, [company.id]);

  // 2. Trigger Simulation Calculation
  const runSimulationCalculation = useCallback(
    async (p: SimulationParametersRequest) => {
      setLoading(true);
      try {
        const res = await api<SimulationResultResponse>(
          `/companies/${company.id}/simulation/run`,
          {
            method: "POST",
            body: JSON.stringify(p),
          }
        );
        setResult(res);
      } catch (err) {
        toast.error("خطا در اجرای محاسبات شبیه‌سازی");
      } finally {
        setLoading(false);
      }
    },
    [company.id]
  );

  // 3. Load Comparative Matrix
  const loadComparativeMatrix = useCallback(
    async (scenarioIds: string[]) => {
      setMatrixLoading(true);
      try {
        const res = await api<ComparativeMatrixResponse>(
          `/companies/${company.id}/simulation/matrix`,
          {
            method: "POST",
            body: JSON.stringify({
              scenario_ids: scenarioIds,
              current_params: params,
            }),
          }
        );
        setMatrixData(res);
      } catch {
        toast.error("خطا در دریافت ماتریس مقایسه سناریوها");
      } finally {
        setMatrixLoading(false);
      }
    },
    [company.id, params]
  );

  // Initial simulation run
  useEffect(() => {
    runSimulationCalculation(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When switching to Matrix tab, trigger comparison
  useEffect(() => {
    if (activeTab === "matrix") {
      loadComparativeMatrix(selectedScenarioIds);
    }
  }, [activeTab, loadComparativeMatrix, selectedScenarioIds]);

  const handleApplyPreset = (preset: PresetScenarioItem) => {
    setActivePresetId(preset.id);
    setParams(preset.parameters);
    runSimulationCalculation(preset.parameters);
    toast.info(`سناریوی «${preset.name_fa}» اعمال شد.`);
  };

  const handleReset = () => {
    setActivePresetId(null);
    setParams(DEFAULT_PARAMS);
    runSimulationCalculation(DEFAULT_PARAMS);
    toast.success("پارامترها به مقادیر پایه بازگردانده شدند.");
  };

  const handleParamChange = (partial: Partial<SimulationParametersRequest>) => {
    setActivePresetId(null);
    const updated = { ...params, ...partial };
    setParams(updated);
    runSimulationCalculation(updated);
  };

  const handleLoadScenario = (scenario: SavedScenarioItem) => {
    setActivePresetId(null);
    setParams(scenario.parameters);
    runSimulationCalculation(scenario.parameters);
    setActiveTab("simulator");
    toast.success(`سناریوی «${scenario.name}» در شبیه‌ساز بارگذاری شد.`);
  };

  const handleDeleteScenario = async (scenarioId: string, name: string) => {
    try {
      await api(`/companies/${company.id}/simulation/scenarios/${scenarioId}`, {
        method: "DELETE",
      });
      setSavedScenarios((prev) => prev.filter((s) => s.id !== scenarioId));
      setSelectedScenarioIds((prev) => prev.filter((id) => id !== scenarioId));
      toast.success(`سناریوی «${name}» حذف شد.`);
    } catch {
      toast.error("خطا در حذف سناریو");
    }
  };

  const toggleScenarioSelection = (scenarioId: string) => {
    let next: string[];
    if (selectedScenarioIds.includes(scenarioId)) {
      next = selectedScenarioIds.filter((id) => id !== scenarioId);
    } else {
      if (selectedScenarioIds.length >= 3) {
        toast.warning("حداکثر ۳ سناریو به صورت همزمان قابل مقایسه است.");
        return;
      }
      next = [...selectedScenarioIds, scenarioId];
    }
    setSelectedScenarioIds(next);
    loadComparativeMatrix(next);
  };

  const weekColumns: Column<SimulatedWeekItem>[] = [
    {
      key: "week_number",
      header: "هفته",
      align: "center",
      render: (row) => (
        <span className="font-semibold text-xs bg-[var(--ds-muted-bg)] px-2 py-0.5 rounded border border-[var(--ds-border)]">
          هفته {toPersianDigits(row.week_number)}
        </span>
      ),
    },
    {
      key: "start_date",
      header: "بازه زمانی",
      render: (row) => (
        <span className="text-xs text-[var(--ds-muted-fg)]" dir="ltr">
          {row.start_date} ~ {row.end_date}
        </span>
      ),
    },
    {
      key: "baseline_closing_cash_irr",
      header: "مانده پایان مبنا",
      numeric: true,
      align: "left",
      render: (row) => <MoneyDisplay amount={row.baseline_closing_cash_irr} compact />,
    },
    {
      key: "simulated_inflows_irr",
      header: "ورودی شبیه‌سازی",
      numeric: true,
      align: "left",
      render: (row) => (
        <MoneyDisplay amount={row.simulated_inflows_irr} compact direction="positive" />
      ),
    },
    {
      key: "simulated_outflows_irr",
      header: "خروجی شبیه‌سازی",
      numeric: true,
      align: "left",
      render: (row) => (
        <MoneyDisplay amount={row.simulated_outflows_irr} compact direction="negative" />
      ),
    },
    {
      key: "simulated_closing_cash_irr",
      header: "مانده شبیه‌سازی‌شده",
      numeric: true,
      align: "left",
      render: (row) => (
        <span className="font-bold">
          <MoneyDisplay
            amount={row.simulated_closing_cash_irr}
            compact
            direction={Number(row.simulated_closing_cash_irr) < 0 ? "negative" : "neutral"}
          />
        </span>
      ),
    },
    {
      key: "status",
      header: "وضعیت خزانه",
      align: "center",
      render: (row) => {
        if (row.is_simulated_deficit) {
          return (
            <Badge variant="danger" className="text-[11px] bg-red-50 text-red-700 border-red-200">
              کسری نقدینگی
            </Badge>
          );
        }
        return (
          <Badge
            variant="outline"
            className="text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200"
          >
            پوشش امن
          </Badge>
        );
      },
    },
  ];

  return (
    <div className="space-y-6 pb-16" dir="rtl">
      {/* 1. Top Header & Action Buttons */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[var(--ds-border)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-bold tracking-tight text-[var(--ds-card-fg)]">
              شبیه‌ساز سناریوهای تصمیم‌گیری مالی (What-If Simulator)
            </h1>
            <Badge
              variant="outline"
              className="bg-primary/5 text-primary border-primary/20 text-xs gap-1"
            >
              <Sparkles className="size-3" />
              مدلسازی تصمیمات C-Suite
            </Badge>
          </div>
          <p className="text-xs lg:text-sm text-[var(--ds-muted-fg)] mt-1">
            سنجش اثر همزمان تغییر سیاست وصول مطالبات، تخفیفات نقدی، استخدام جدید، مهلت پرداخت به
            تامین‌کنندگان و شوک بازار بر تاب‌آوری و سودآوری.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMemoDialogOpen(true)}
            className="h-9 gap-1.5 text-xs text-primary border-primary/30 hover:bg-primary/5"
          >
            <FileText className="size-3.5 text-primary" />
            <span>صدور یادداشت تصمیم‌گیری (PDF)</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setSaveDialogOpen(true)}
            className="h-9 gap-1.5 text-xs"
          >
            <BookmarkPlus className="size-3.5" />
            <span>ذخیره این سناریو</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-9 gap-1.5 text-xs text-[var(--ds-muted-fg)]"
          >
            <RotateCcw className="size-3.5" />
            <span>بازنشانی</span>
          </Button>
        </div>
      </div>

      {/* 2. Primary Tabs: Live Simulator vs Comparative Matrix */}
      <div className="flex items-center gap-2 border-b border-[var(--ds-border)] pb-1">
        <button
          type="button"
          onClick={() => setActiveTab("simulator")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-colors relative ${
            activeTab === "simulator"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-[var(--ds-muted-fg)] hover:bg-[var(--ds-muted-bg)]"
          }`}
        >
          <SlidersHorizontal className="size-3.5" />
          <span>شبیه‌ساز تعاملی (Live Simulator)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("matrix")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-colors relative ${
            activeTab === "matrix"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-[var(--ds-muted-fg)] hover:bg-[var(--ds-muted-bg)]"
          }`}
        >
          <Columns className="size-3.5" />
          <span>ماتریس مقایسه سناریوها (Comparative Matrix)</span>
          {savedScenarios.length > 0 && (
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                activeTab === "matrix"
                  ? "bg-primary-foreground text-primary font-bold"
                  : "bg-[var(--ds-muted-bg)] text-[var(--ds-muted-fg)] border border-[var(--ds-border)]"
              }`}
            >
              {toPersianDigits(savedScenarios.length)}
            </span>
          )}
        </button>
      </div>

      {activeTab === "simulator" ? (
        <>
          {/* Preset Strategic Scenarios */}
          <Card className="border-[var(--ds-border)] bg-[var(--ds-card-bg)]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                    <Zap className="size-4 text-amber-500" />
                    سناریوهای استراتژیک از پیش‌تعریف‌شده (Strategic Presets)
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    برای اعمال سریع سیاست‌های استاندارد مالی و ارزیابی ضرب‌الاجل‌ها روی سناریو کلیک کنید:
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {presets.map((preset) => {
                  const isSelected = activePresetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleApplyPreset(preset)}
                      className={`text-right p-3.5 rounded-xl border transition-all flex flex-col justify-between text-xs relative ${
                        isSelected
                          ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                          : "border-[var(--ds-border)] hover:border-primary/50 hover:bg-[var(--ds-muted-bg)]"
                      }`}
                    >
                      {isSelected && (
                        <span className="absolute top-2.5 left-2.5 flex size-2 rounded-full bg-primary" />
                      )}
                      <div>
                        <div className="font-bold text-sm text-[var(--ds-card-fg)] mb-1">
                          {preset.name_fa}
                        </div>
                        <p className="text-[var(--ds-muted-fg)] leading-relaxed text-[11px]">
                          {preset.description_fa}
                        </p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-[var(--ds-border)]/60 flex items-center justify-between text-[10px] text-primary font-medium">
                        <span>
                          {preset.parameters.dso_change_days !== 0 &&
                            `تغییر وصول: ${preset.parameters.dso_change_days > 0 ? "+" : ""}${toPersianDigits(preset.parameters.dso_change_days)} روز | `}
                          {preset.parameters.new_hires_count > 0 &&
                            `نیروی جدید: ${toPersianDigits(preset.parameters.new_hires_count)} نفر | `}
                          {preset.parameters.dpo_change_days !== 0 &&
                            `تغییر پرداخت: ${preset.parameters.dpo_change_days > 0 ? "+" : ""}${toPersianDigits(preset.parameters.dpo_change_days)} روز`}
                        </span>
                        <span>انتخاب ←</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Executive Verdict & Risk Warnings */}
          {result && (
            <div
              className={`p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                Number(result.runway_days_delta.delta_value) >= 10
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-300"
                  : Number(result.runway_days_delta.delta_value) <= -10
                    ? "bg-red-500/10 border-red-500/30 text-red-900 dark:text-red-300"
                    : "bg-blue-500/10 border-blue-500/30 text-blue-900 dark:text-blue-300"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {Number(result.runway_days_delta.delta_value) >= 10 ? (
                    <ShieldCheck className="size-5 text-emerald-600 dark:text-emerald-400" />
                  ) : Number(result.runway_days_delta.delta_value) <= -10 ? (
                    <AlertOctagon className="size-5 text-red-600 dark:text-red-400" />
                  ) : (
                    <Activity className="size-5 text-blue-600 dark:text-blue-400" />
                  )}
                </div>
                <div>
                  <div className="font-bold text-sm">حکم مدیریتی سناریو (Executive Verdict)</div>
                  <p className="text-xs mt-1 leading-relaxed">{result.executive_verdict_fa}</p>
                  {result.risk_warnings_fa.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {result.risk_warnings_fa.map((warn, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-[11px] font-semibold">
                          <AlertTriangle className="size-3 text-amber-600 dark:text-amber-400" />
                          <span>{warn}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                <div className="text-left">
                  <span className="text-[10px] block opacity-80">تاب‌آوری جدید:</span>
                  <span className="text-lg font-black font-mono">
                    {toPersianDigits(result.runway_days_delta.simulated_value)} روز
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Delta Comparison KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiMetricCard
              title="تغییر تاب‌آوری نقد (Runway)"
              value={
                result
                  ? `${toPersianDigits(result.runway_days_delta.simulated_value)} روز`
                  : "..."
              }
              unit=""
              currency=""
              loading={loading}
              subtext={
                result
                  ? `مبنا: ${toPersianDigits(result.runway_days_delta.baseline_value)} روز (تغییر: ${Number(result.runway_days_delta.delta_value) >= 0 ? "+" : ""}${toPersianDigits(result.runway_days_delta.delta_value)} روز)`
                  : undefined
              }
              status={
                !result
                  ? "normal"
                  : Number(result.runway_days_delta.delta_value) >= 5
                    ? "normal"
                    : Number(result.runway_days_delta.delta_value) < -10
                      ? "critical"
                      : "warning"
              }
              icon={Clock}
            />

            <KpiMetricCard
              title="تغییر نرخ سوخت ماهانه (Burn Rate)"
              value={result?.monthly_burn_rate_delta.simulated_value ?? 0}
              loading={loading}
              subtext={
                result
                  ? `مبنا: ${toPersianDigits(result.monthly_burn_rate_delta.baseline_value)} ریال`
                  : undefined
              }
              status={
                !result
                  ? "normal"
                  : Number(result.monthly_burn_rate_delta.delta_value) > 0
                    ? "warning"
                    : "normal"
              }
              icon={Flame}
            />

            <KpiMetricCard
              title="چرخه تبدیل وجه نقد (CCC)"
              value={
                result
                  ? `${toPersianDigits(result.cash_conversion_cycle_delta.simulated_value)} روز`
                  : "..."
              }
              unit=""
              currency=""
              loading={loading}
              subtext={
                result
                  ? `مبنا: ${toPersianDigits(result.cash_conversion_cycle_delta.baseline_value)} روز (تغییر: ${Number(result.cash_conversion_cycle_delta.delta_value) <= 0 ? "" : "+"}${toPersianDigits(result.cash_conversion_cycle_delta.delta_value)} روز)`
                  : undefined
              }
              status={
                !result
                  ? "normal"
                  : Number(result.cash_conversion_cycle_delta.delta_value) <= 0
                    ? "normal"
                    : "warning"
              }
              icon={Coins}
            />

            <KpiMetricCard
              title="اثر خالص بر سودآوری سالانه"
              value={result?.net_annual_profit_impact_irr ?? 0}
              loading={loading}
              subtext={
                result
                  ? `نقدینگی آزادشده: ${toPersianDigits(result.liquidity_released_irr)} ریال`
                  : undefined
              }
              status={
                !result
                  ? "normal"
                  : Number(result.net_annual_profit_impact_irr) >= 0
                    ? "normal"
                    : "warning"
              }
              icon={DollarSign}
            />
          </div>

          {/* Interactive Decision Levers Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Lever 1: Receivables & Early Settlement Discount */}
            <Card className="border-[var(--ds-border)] bg-[var(--ds-card-bg)]">
              <CardHeader className="pb-3 border-b border-[var(--ds-border)]">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <TrendingUp className="size-4 text-emerald-600" />
                  اهرم ۱: مدیریت وصول مطالبات و تخفیف نقدی تسویه
                </CardTitle>
                <CardDescription className="text-xs">
                  کاهش دوره وصول مطالبات (DSO) از طریق اعطای تخفیف نقدی به خریداران در ازای تسویه زودتر.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 pt-4">
                <div>
                  <div className="flex justify-between items-center text-xs mb-2">
                    <span className="font-semibold text-[var(--ds-card-fg)]">
                      تغییر دوره وصول مطالبات (DSO Delta):
                    </span>
                    <span className="font-mono font-bold text-primary">
                      {params.dso_change_days > 0 ? "+" : ""}
                      {toPersianDigits(params.dso_change_days)} روز
                    </span>
                  </div>
                  <Slider
                    min={-60}
                    max={90}
                    step={1}
                    value={[params.dso_change_days]}
                    onValueChange={([val]) => handleParamChange({ dso_change_days: val })}
                  />
                  <div className="flex justify-between text-[10px] text-[var(--ds-muted-fg)] mt-1">
                    <span>۶۰ روز تسریع وصول</span>
                    <span>بدون تغییر (۰)</span>
                    <span>۹۰ روز افزایش دیرکرد</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center text-xs mb-2">
                    <span className="font-semibold text-[var(--ds-card-fg)]">
                      درصد تخفیف نقدی تسویه زودرس (Cash Discount):
                    </span>
                    <span className="font-mono font-bold text-primary">
                      {toPersianDigits(params.early_settlement_discount_pct)}٪
                    </span>
                  </div>
                  <Slider
                    min={0}
                    max={10}
                    step={0.5}
                    value={[params.early_settlement_discount_pct]}
                    onValueChange={([val]) =>
                      handleParamChange({ early_settlement_discount_pct: val })
                    }
                  />
                  <div className="flex justify-between text-[10px] text-[var(--ds-muted-fg)] mt-1">
                    <span>۰٪ (بدون تخفیف)</span>
                    <span>۵٪ تخفیف</span>
                    <span>۱۰٪ تخفیف حداکثری</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center text-xs mb-2">
                    <span className="font-semibold text-[var(--ds-card-fg)]">
                      ضریب استقبال مشتریان از تخفیف نقدی:
                    </span>
                    <span className="font-mono font-bold text-primary">
                      {toPersianDigits(params.discount_adoption_rate_pct)}٪
                    </span>
                  </div>
                  <Slider
                    min={0}
                    max={100}
                    step={5}
                    value={[params.discount_adoption_rate_pct]}
                    onValueChange={([val]) =>
                      handleParamChange({ discount_adoption_rate_pct: val })
                    }
                  />
                  <div className="flex justify-between text-[10px] text-[var(--ds-muted-fg)] mt-1">
                    <span>۰٪ استقبال</span>
                    <span>۵۰٪ پذیرش خریداران</span>
                    <span>۱۰۰٪ استقبال عمومی</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Lever 2: Hiring & Fixed Opex Expansion */}
            <Card className="border-[var(--ds-border)] bg-[var(--ds-card-bg)]">
              <CardHeader className="pb-3 border-b border-[var(--ds-border)]">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <UserPlus className="size-4 text-blue-600" />
                  اهرم ۲: استخدام پرسنل جدید و تغییر هزینه‌های ثابت (Opex)
                </CardTitle>
                <CardDescription className="text-xs">
                  محاسبه بار مالی حقوق و هزینه‌های ماهانه جدید بر نرخ مصرف نقدینگی و افت تاب‌آوری.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 pt-4">
                <div>
                  <div className="flex justify-between items-center text-xs mb-2">
                    <span className="font-semibold text-[var(--ds-card-fg)]">
                      تعداد نیروهای جدید استخدامی (Headcount Delta):
                    </span>
                    <span className="font-mono font-bold text-primary">
                      {toPersianDigits(params.new_hires_count)} نفر
                    </span>
                  </div>
                  <Slider
                    min={0}
                    max={20}
                    step={1}
                    value={[params.new_hires_count]}
                    onValueChange={([val]) => handleParamChange({ new_hires_count: val })}
                  />
                  <div className="flex justify-between text-[10px] text-[var(--ds-muted-fg)] mt-1">
                    <span>۰ نفر (فریز استخدام)</span>
                    <span>۱۰ نفر جذب جدید</span>
                    <span>۲۰ نفر استخدام گسترده</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center text-xs mb-2">
                    <span className="font-semibold text-[var(--ds-card-fg)]">
                      میانگین حقوق و مزایای ماهانه هر نیرو (IRR):
                    </span>
                    <span className="font-mono font-bold text-primary">
                      <MoneyDisplay amount={params.avg_salary_monthly_irr} compact />
                    </span>
                  </div>
                  <Slider
                    min={150000000}
                    max={800000000}
                    step={25000000}
                    value={[Number(params.avg_salary_monthly_irr) || 350000000]}
                    onValueChange={([val]) =>
                      handleParamChange({ avg_salary_monthly_irr: val.toString() })
                    }
                  />
                  <div className="flex justify-between text-[10px] text-[var(--ds-muted-fg)] mt-1">
                    <span>۱۵۰ م ریال</span>
                    <span>۳۵۰ م ریال</span>
                    <span>۸۰۰ م ریال (حقوق کلیدی)</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center text-xs mb-2">
                    <span className="font-semibold text-[var(--ds-card-fg)]">
                      تغییر سایر هزینه‌های ثابت ماهانه (اجاره/سربار):
                    </span>
                    <span className="font-mono font-bold text-primary">
                      <MoneyDisplay amount={params.fixed_cost_monthly_change_irr} compact />
                    </span>
                  </div>
                  <Slider
                    min={-1000000000}
                    max={3000000000}
                    step={100000000}
                    value={[Number(params.fixed_cost_monthly_change_irr) || 0]}
                    onValueChange={([val]) =>
                      handleParamChange({ fixed_cost_monthly_change_irr: val.toString() })
                    }
                  />
                  <div className="flex justify-between text-[10px] text-[var(--ds-muted-fg)] mt-1">
                    <span>-۱ میلیارد (صرفه‌جویی)</span>
                    <span>۰ (بدون تغییر)</span>
                    <span>+۳ میلیارد (افزایش سربار)</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Lever 3: Supplier Payment Terms & DPO */}
            <Card className="border-[var(--ds-border)] bg-[var(--ds-card-bg)]">
              <CardHeader className="pb-3 border-b border-[var(--ds-border)]">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Clock className="size-4 text-cyan-600 dark:text-cyan-400" />
                  اهرم ۳: شرایط اعتباری تامین‌کنندگان و مهلت پرداخت (DPO)
                </CardTitle>
                <CardDescription className="text-xs">
                  مذاکره برای تمدید دوره تسویه خرید مواد اولیه جهت حفظ نقدینگی در خزانه شرکت.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 pt-4">
                <div>
                  <div className="flex justify-between items-center text-xs mb-2">
                    <span className="font-semibold text-[var(--ds-card-fg)]">
                      تغییر دوره پرداخت به بستانکاران (DPO Delta):
                    </span>
                    <span className="font-mono font-bold text-primary">
                      {params.dpo_change_days > 0 ? "+" : ""}
                      {toPersianDigits(params.dpo_change_days)} روز
                    </span>
                  </div>
                  <Slider
                    min={-30}
                    max={60}
                    step={1}
                    value={[params.dpo_change_days]}
                    onValueChange={([val]) => handleParamChange({ dpo_change_days: val })}
                  />
                  <div className="flex justify-between text-[10px] text-[var(--ds-muted-fg)] mt-1">
                    <span>-۳۰ روز (تسویه سریع‌تر)</span>
                    <span>بدون تغییر (۰)</span>
                    <span>+۶۰ روز (استمهال بدهی)</span>
                  </div>
                </div>
                <div className="p-3 bg-cyan-50 dark:bg-cyan-950/20 rounded-lg border border-cyan-200/50 text-[11px] text-cyan-800 dark:text-cyan-300 leading-relaxed">
                  افزایش DPO نقدینگی را درون خزانه حبس کرده و مانند وام بدون بهره عمل می‌کند، اما
                  افزایش بیش از ۲۰ روز ممکن است به تامین پایدار کالا لطمه بزند.
                </div>
              </CardContent>
            </Card>

            {/* Lever 4: Customer Delay & Default Shock */}
            <Card className="border-[var(--ds-border)] bg-[var(--ds-card-bg)]">
              <CardHeader className="pb-3 border-b border-[var(--ds-border)]">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <AlertTriangle className="size-4 text-red-600" />
                  اهرم ۴: تست استرس شوک وصولی و سوخت طلب مشتریان
                </CardTitle>
                <CardDescription className="text-xs">
                  سنجش استقامت خزانه در برابر نکول ناگهانی بدهی مشتریان یا تاخیر بحرانی بدهکاران عمده.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 pt-4">
                <div>
                  <div className="flex justify-between items-center text-xs mb-2">
                    <span className="font-semibold text-[var(--ds-card-fg)]">
                      درصد سوخت یا نکول فرضی مطالبات (Default %):
                    </span>
                    <span className="font-mono font-bold text-red-600">
                      {toPersianDigits(params.shock_default_pct)}٪
                    </span>
                  </div>
                  <Slider
                    min={0}
                    max={50}
                    step={2}
                    value={[params.shock_default_pct]}
                    onValueChange={([val]) => handleParamChange({ shock_default_pct: val })}
                  />
                  <div className="flex justify-between text-[10px] text-[var(--ds-muted-fg)] mt-1">
                    <span>۰٪ (حالت عادی)</span>
                    <span>۲۵٪ سوخت مطالبات</span>
                    <span>۵۰٪ بحران وصول حاد</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center text-xs mb-2">
                    <span className="font-semibold text-[var(--ds-card-fg)]">
                      تاخیر شوک در وصول مطالبات اصلی:
                    </span>
                    <span className="font-mono font-bold text-primary">
                      {toPersianDigits(params.shock_delay_days)} روز
                    </span>
                  </div>
                  <Slider
                    min={0}
                    max={90}
                    step={5}
                    value={[params.shock_delay_days]}
                    onValueChange={([val]) => handleParamChange({ shock_delay_days: val })}
                  />
                  <div className="flex justify-between text-[10px] text-[var(--ds-muted-fg)] mt-1">
                    <span>۰ روز</span>
                    <span>۴۵ روز تاخیر</span>
                    <span>۹۰ روز تعویق کامل</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 13-Week Comparative Cash Trajectory Table */}
          <Card className="border-[var(--ds-border)] bg-[var(--ds-card-bg)]">
            <CardHeader className="pb-3 border-b border-[var(--ds-border)]">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Coins className="size-4 text-primary" />
                    جدول مقایسه‌ای پیش‌بینی ۱۳ هفته‌ای خزانه (Baseline vs. Simulated)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    انعکاس هفتگی اثر تصمیمات بر مانده نقدی پایان دوره و تشخیص نخستین هفته کسری نقدینگی.
                  </CardDescription>
                </div>
                {result?.first_deficit_week_simulated && (
                  <Badge variant="danger" className="text-xs animate-pulse">
                    نخستین هفته کسری: هفته {toPersianDigits(result.first_deficit_week_simulated)}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <FinancialDataTable<SimulatedWeekItem>
                columns={weekColumns}
                data={result?.weeks ?? []}
                keyExtractor={(row) => row.week_number}
                loading={loading}
                emptyMessage="داده‌ای برای شبیه‌سازی ۱۳ هفته‌ای یافت نشد."
              />
            </CardContent>
          </Card>
        </>
      ) : (
        /* ---------------- COMPARATIVE MATRIX TAB ---------------- */
        <div className="space-y-6">
          {/* Saved Scenarios Selector Cards */}
          <Card className="border-[var(--ds-border)] bg-[var(--ds-card-bg)]">
            <CardHeader className="pb-3 border-b border-[var(--ds-border)]">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <BookmarkPlus className="size-4 text-primary" />
                    سناریوهای ذخیره‌شده شرکت (Saved Strategic Scenarios)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    سناریوهایی را که مایل به مقایسه همزمان در ماتریس هستید انتخاب کنید (حداکثر ۳ سناریو):
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSaveDialogOpen(true)}
                  className="h-8 text-xs gap-1.5"
                >
                  <Plus className="size-3.5" />
                  <span>ذخیره سناریوی فعلی</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {savedScenarios.length === 0 ? (
                <div className="text-center py-8 text-xs text-[var(--ds-muted-fg)]">
                  هنوز سناریوی سفارشی ذخیره نکرده‌اید. با کلیک بر روی «ذخیره سناریوی فعلی»،
                  تنظیمات شبیه‌ساز را ذخیره کنید تا در ماتریس ارزیابی شوند.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {savedScenarios.map((sc) => {
                    const isSelected = selectedScenarioIds.includes(sc.id);
                    return (
                      <div
                        key={sc.id}
                        className={`p-3 rounded-xl border text-xs flex flex-col justify-between transition-all ${
                          isSelected
                            ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                            : "border-[var(--ds-border)] bg-[var(--ds-card-bg)]"
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleScenarioSelection(sc.id)}
                                className="rounded border-gray-300 text-primary focus:ring-primary size-3.5"
                              />
                              <span className="font-bold text-sm text-[var(--ds-card-fg)]">
                                {sc.name}
                              </span>
                            </div>
                            {sc.is_favorite && (
                              <Star className="size-3.5 fill-amber-500 text-amber-500 shrink-0" />
                            )}
                          </div>
                          {sc.description && (
                            <p className="text-[var(--ds-muted-fg)] text-[11px] leading-relaxed mb-2">
                              {sc.description}
                            </p>
                          )}
                          <div className="grid grid-cols-2 gap-2 text-[10px] bg-[var(--ds-muted-bg)]/50 p-2 rounded-lg border border-[var(--ds-border)]/50">
                            <div>
                              <span className="text-[var(--ds-muted-fg)] block">تاب‌آوری:</span>
                              <span className="font-bold text-primary">
                                {toPersianDigits(sc.result_summary.simulated_runway)} روز
                              </span>
                            </div>
                            <div>
                              <span className="text-[var(--ds-muted-fg)] block">اثر سود سالانه:</span>
                              <span className="font-bold text-[var(--ds-card-fg)]">
                                <MoneyDisplay
                                  amount={sc.result_summary.net_annual_profit_impact}
                                  compact
                                />
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 pt-2 border-t border-[var(--ds-border)]/60 flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => handleLoadScenario(sc)}
                            className="text-[11px] text-primary font-semibold hover:underline"
                          >
                            بارگذاری در شبیه‌ساز ←
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteScenario(sc.id, sc.name)}
                            className="text-[var(--ds-muted-fg)] hover:text-red-600 p-1"
                            title="حذف سناریو"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Comparative Matrix Table */}
          <Card className="border-[var(--ds-border)] bg-[var(--ds-card-bg)] overflow-hidden">
            <CardHeader className="pb-3 border-b border-[var(--ds-border)]">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Columns className="size-4 text-primary" />
                    ماتریس مقایسه‌ای متغیرهای استراتژیک (Side-by-Side Matrix)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    ارزیابی مستقیم اثر سناریوهای مختلف در مقایسه با نقطه شروع عملیات خزانه‌داری:
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMemoDialogOpen(true)}
                  className="h-8 text-xs gap-1.5 text-primary border-primary/30"
                >
                  <Download className="size-3.5" />
                  <span>صدور یادداشت تصمیم‌گیری (PDF)</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {matrixLoading ? (
                <div className="text-center py-12 text-xs text-[var(--ds-muted-fg)]">
                  در حال محاسبه ماتریس مقایسه‌ای سناریوها...
                </div>
              ) : !matrixData || matrixData.columns.length === 0 ? (
                <div className="text-center py-12 text-xs text-[var(--ds-muted-fg)]">
                  داده‌ای برای نمایش ماتریس یافت نشد.
                </div>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-[var(--ds-muted-bg)] border-b border-[var(--ds-border)]">
                      <th className="p-3 text-right font-bold text-[var(--ds-card-fg)] w-48">
                        شاخص کلیدی مالی
                      </th>
                      {matrixData.columns.map((col) => (
                        <th
                          key={col.scenario_id}
                          className={`p-3 text-right font-bold min-w-44 border-r border-[var(--ds-border)] ${
                            col.is_baseline
                              ? "bg-muted/30"
                              : "bg-primary/5 text-primary"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span>{col.name}</span>
                            {!col.is_baseline && (
                              <Badge
                                variant={
                                  col.risk_level === "high"
                                    ? "danger"
                                    : col.risk_level === "medium"
                                      ? "warning"
                                      : "outline"
                                }
                                className="text-[10px] py-0"
                              >
                                {col.risk_level === "high"
                                  ? "ریسک بالا"
                                  : col.risk_level === "medium"
                                    ? "ریسک متوسط"
                                    : "ریسک ایمن"}
                              </Badge>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--ds-border)]">
                    {/* Row 1: Runway */}
                    <tr className="hover:bg-[var(--ds-muted-bg)]/40 transition-colors">
                      <td className="p-3 font-semibold text-[var(--ds-card-fg)]">
                        تاب‌آوری نقدینگی (Runway)
                      </td>
                      {matrixData.columns.map((col) => (
                        <td
                          key={col.scenario_id}
                          className="p-3 border-r border-[var(--ds-border)]"
                        >
                          <div className="font-bold text-sm">
                            {toPersianDigits(col.runway_days)} روز
                          </div>
                          {!col.is_baseline && (
                            <div
                              className={`text-[11px] font-mono mt-0.5 ${
                                col.runway_delta_days >= 0
                                  ? "text-emerald-600 font-bold"
                                  : "text-red-600 font-bold"
                              }`}
                            >
                              {col.runway_delta_days >= 0 ? "+" : ""}
                              {toPersianDigits(col.runway_delta_days)} روز انحراف
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>

                    {/* Row 2: Burn Rate */}
                    <tr className="hover:bg-[var(--ds-muted-bg)]/40 transition-colors">
                      <td className="p-3 font-semibold text-[var(--ds-card-fg)]">
                        نرخ سوخت ماهانه (Monthly Burn)
                      </td>
                      {matrixData.columns.map((col) => (
                        <td
                          key={col.scenario_id}
                          className="p-3 border-r border-[var(--ds-border)]"
                        >
                          <div className="font-bold">
                            <MoneyDisplay amount={col.monthly_burn_irr} compact />
                          </div>
                          {!col.is_baseline && Number(col.monthly_burn_delta_irr) !== 0 && (
                            <div className="text-[11px] text-[var(--ds-muted-fg)] mt-0.5">
                              تغییر:{" "}
                              <MoneyDisplay
                                amount={col.monthly_burn_delta_irr}
                                compact
                                showSign
                                direction="auto"
                              />
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>

                    {/* Row 3: CCC */}
                    <tr className="hover:bg-[var(--ds-muted-bg)]/40 transition-colors">
                      <td className="p-3 font-semibold text-[var(--ds-card-fg)]">
                        چرخه تبدیل نقد (CCC)
                      </td>
                      {matrixData.columns.map((col) => (
                        <td
                          key={col.scenario_id}
                          className="p-3 border-r border-[var(--ds-border)]"
                        >
                          <div className="font-bold">{toPersianDigits(col.ccc_days)} روز</div>
                          {!col.is_baseline && (
                            <div
                              className={`text-[11px] mt-0.5 ${
                                col.ccc_delta_days <= 0
                                  ? "text-emerald-600 font-semibold"
                                  : "text-amber-600 font-semibold"
                              }`}
                            >
                              {col.ccc_delta_days > 0 ? "+" : ""}
                              {toPersianDigits(col.ccc_delta_days)} روز
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>

                    {/* Row 4: Liquidity Released */}
                    <tr className="hover:bg-[var(--ds-muted-bg)]/40 transition-colors">
                      <td className="p-3 font-semibold text-[var(--ds-card-fg)]">
                        نقدینگی آزادشده درون خزانه
                      </td>
                      {matrixData.columns.map((col) => (
                        <td
                          key={col.scenario_id}
                          className="p-3 border-r border-[var(--ds-border)]"
                        >
                          <div className="font-bold">
                            <MoneyDisplay
                              amount={col.liquidity_released_irr}
                              compact
                              direction="positive"
                            />
                          </div>
                        </td>
                      ))}
                    </tr>

                    {/* Row 5: Annual Profit Impact */}
                    <tr className="hover:bg-[var(--ds-muted-bg)]/40 transition-colors">
                      <td className="p-3 font-semibold text-[var(--ds-card-fg)]">
                        اثر سالانه بر سودآوری
                      </td>
                      {matrixData.columns.map((col) => (
                        <td
                          key={col.scenario_id}
                          className="p-3 border-r border-[var(--ds-border)]"
                        >
                          <div className="font-bold">
                            <MoneyDisplay
                              amount={col.net_annual_profit_impact_irr}
                              compact
                              showSign
                              direction="auto"
                            />
                          </div>
                        </td>
                      ))}
                    </tr>

                    {/* Row 6: First Deficit Week */}
                    <tr className="hover:bg-[var(--ds-muted-bg)]/40 transition-colors">
                      <td className="p-3 font-semibold text-[var(--ds-card-fg)]">
                        نخستین هفته بروز کسری
                      </td>
                      {matrixData.columns.map((col) => (
                        <td
                          key={col.scenario_id}
                          className="p-3 border-r border-[var(--ds-border)]"
                        >
                          {col.first_deficit_week ? (
                            <Badge variant="danger" className="text-[11px]">
                              هفته {toPersianDigits(col.first_deficit_week)}
                            </Badge>
                          ) : (
                            <span className="text-emerald-600 font-semibold text-[11px]">
                              بدون کسری در ۱۳ هفته
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>

                    {/* Row 7: Verdict */}
                    <tr className="hover:bg-[var(--ds-muted-bg)]/40 transition-colors">
                      <td className="p-3 font-semibold text-[var(--ds-card-fg)]">
                        حکم و ارزیابی نهایی
                      </td>
                      {matrixData.columns.map((col) => (
                        <td
                          key={col.scenario_id}
                          className="p-3 border-r border-[var(--ds-border)] text-[11px] text-[var(--ds-muted-fg)] leading-relaxed"
                        >
                          {col.verdict_fa}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Save Scenario Dialog */}
      <SaveScenarioDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        companyId={company.id}
        parameters={params}
        onScenarioSaved={(saved) => {
          setSavedScenarios((prev) => [saved, ...prev]);
          setSelectedScenarioIds((prev) => [saved.id, ...prev].slice(0, 3));
        }}
      />

      {/* Decision Memo Export Dialog */}
      <DecisionMemoDialog
        open={memoDialogOpen}
        onOpenChange={setMemoDialogOpen}
        companyId={company.id}
        companyName={company.legal_name}
        parameters={params}
        scenarioTitle={
          activePresetId
            ? presets.find((p) => p.id === activePresetId)?.name_fa
            : "سناریوی شبیه‌سازی‌شده جاری"
        }
      />
    </div>
  );
}
