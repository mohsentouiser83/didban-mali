"use client";

import Link from "next/link";
import { FormEvent, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Calendar,
  ChevronLeft,
  Filter,
  Plus,
  RefreshCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Layers,
  Sparkles,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MoneyDisplay,
  RiskBadge,
  StatusChip,
  EvidenceSourceTag,
  FinancialDataTable,
  EvidenceDrawer,
  Column,
  toPersianDigits,
  FindingEvidenceDetail,
  RiskLevel,
  FinancialStatus,
} from "@/components/ui/financial";

import { api } from "@/lib/product-api";
import type {
  AnalysisRun,
  Company,
  EvidenceItem,
  EvidenceItemsResponse,
  Finding,
  FindingGenerationRun,
  FindingsResponse,
  PriorityBand,
  ReconciliationRun,
} from "@/lib/product-types";

type FindingFilter = "all" | "critical_high" | "hypothesis" | "reconciliation" | "financial";

const filters: { id: FindingFilter; label: string }[] = [
  { id: "all", label: "همه یافته‌ها" },
  { id: "critical_high", label: "بحرانی و بالا" },
  { id: "hypothesis", label: "فرضیه‌ها (غیرقطعی)" },
  { id: "reconciliation", label: "مغایرت‌های تطبیق" },
  { id: "financial", label: "روندهای مالی" },
];

function faDate(value: string) {
  try {
    return new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "short", day: "numeric" }).format(
      new Date(`${value}T12:00:00`)
    );
  } catch {
    return value;
  }
}

function faDateTime(value: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

const FINDING_CODE_LABELS: Record<string, string> = {
  potential_missing_transaction: "فاقد ثبت متناظر",
  duplicate_transaction: "تراکنش تکراری",
  amount_mismatch: "مغایرت مبلغ",
  date_mismatch: "مغایرت تاریخ",
  revenue_drop: "افت درآمد",
  profit_drop: "افت سود",
  expense_increase: "افزایش هزینه",
  receivables_increase: "افزایش مطالبات",
};

export function FindingsWorkspace({ company }: { company: Company }) {
  const [analyses, setAnalyses] = useState<AnalysisRun[]>([]);
  const [analysisId, setAnalysisId] = useState("");
  const [reconciliations, setReconciliations] = useState<ReconciliationRun[]>([]);
  const [reconciliationId, setReconciliationId] = useState("");
  const [run, setRun] = useState<FindingGenerationRun | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<FindingFilter>("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [trendPercent, setTrendPercent] = useState(10);
  const [minimumAmount, setMinimumAmount] = useState("1000000");

  // Evidence Drawer state
  const [selectedFindingDetail, setSelectedFindingDetail] = useState<FindingEvidenceDetail | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const canRun = company.role !== "viewer";
  const isRunning = run?.status === "queued" || run?.status === "processing";

  const loadFindings = useCallback(
    async (runId: string, cursor?: string, append = false) => {
      const suffix = cursor ? `&cursor=${cursor}` : "";
      const result = await api<FindingsResponse>(
        `/companies/${company.id}/findings?generation_run_id=${runId}&limit=200${suffix}`
      );
      setFindings((current) => (append ? [...current, ...result.items] : result.items));
      setNextCursor(result.next_cursor);
    },
    [company.id]
  );

  const loadForAnalysis = useCallback(
    async (selectedAnalysisId: string) => {
      const [reconciliationRuns, findingRuns] = await Promise.all([
        api<ReconciliationRun[]>(
          `/companies/${company.id}/reconciliation-runs?analysis_run_id=${selectedAnalysisId}&limit=30`
        ),
        api<FindingGenerationRun[]>(
          `/companies/${company.id}/finding-runs?analysis_run_id=${selectedAnalysisId}&limit=20`
        ),
      ]);
      const readyReconciliations = reconciliationRuns.filter(
        (item) => item.status === "completed" || item.status === "completed_limited"
      );
      const latestFindingRun = findingRuns[0] ?? null;
      setReconciliations(readyReconciliations);
      setReconciliationId(latestFindingRun?.reconciliation_run_id ?? readyReconciliations[0]?.id ?? "");
      setRun(latestFindingRun);
      setFindings([]);
      setNextCursor(null);
      if (latestFindingRun?.status === "completed" || latestFindingRun?.status === "completed_limited") {
        await loadFindings(latestFindingRun.id);
      }
    },
    [company.id, loadFindings]
  );

  useEffect(() => {
    let ignore = false;
    async function bootstrap() {
      setLoading(true);
      setError("");
      try {
        const allRuns = await api<AnalysisRun[]>(`/companies/${company.id}/analysis-runs?limit=30`);
        const ready = allRuns.filter((item) => item.status === "completed" || item.status === "completed_limited");
        if (ignore) return;
        setAnalyses(ready);
        const latest = ready[0];
        if (latest) {
          setAnalysisId(latest.id);
          await loadForAnalysis(latest.id);
        }
      } catch (caught) {
        if (!ignore) setError(caught instanceof Error ? caught.message : "اطلاعات یافته‌ها دریافت نشد.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void bootstrap();
    return () => {
      ignore = true;
    };
  }, [company.id, loadForAnalysis]);

  useEffect(() => {
    if (!run || !isRunning) return;
    const timer = window.setInterval(async () => {
      try {
        const current = await api<FindingGenerationRun>(
          `/companies/${company.id}/finding-runs/${run.id}`
        );
        setRun(current);
        if (current.status === "completed" || current.status === "completed_limited") {
          window.clearInterval(timer);
          await loadFindings(current.id);
          setSubmitting(false);
          toast.success("موتور یافته‌ها با موفقیت تکمیل شد.");
        }
        if (current.status === "failed") {
          window.clearInterval(timer);
          setSubmitting(false);
          setError(current.failure_message ?? "اجرای موتور یافته‌ها با خطا مواجه شد.");
        }
      } catch (caught) {
        window.clearInterval(timer);
        setSubmitting(false);
        setError(caught instanceof Error ? caught.message : "دریافت وضعیت یافته‌ها ناموفق بود.");
      }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [company.id, isRunning, loadFindings, run]);

  async function handleAnalysisChange(value: string) {
    setAnalysisId(value);
    setLoading(true);
    setError("");
    try {
      await loadForAnalysis(value);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "اطلاعات این دوره دریافت نشد.");
    } finally {
      setLoading(false);
    }
  }

  async function startFindingRun(event: FormEvent) {
    event.preventDefault();
    if (!analysisId || !canRun || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const created = await api<FindingGenerationRun>(
        `/companies/${company.id}/analysis-runs/${analysisId}/finding-runs`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({
            reconciliation_run_id: reconciliationId || undefined,
            config_version: "finding-rules-v1",
            trend_ratio: (trendPercent / 100).toFixed(2),
            minimum_amount_irr: minimumAmount,
          }),
        }
      );
      setRun(created);
      setFindings([]);
      setNextCursor(null);
      toast.success("اجرای موتور یافته‌ها با موفقیت آغاز شد.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "اجرای موتور یافته‌ها ناموفق بود.");
      setSubmitting(false);
    }
  }

  async function openFindingDrawer(finding: Finding) {
    try {
      const evidenceRes = await api<EvidenceItemsResponse>(
        `/companies/${company.id}/findings/${finding.id}/evidence`
      );

      const factors = finding.priority_explanation?.factors ?? {};

      const detail: FindingEvidenceDetail = {
        id: finding.id,
        title: finding.title_fa,
        riskLevel: (finding.priority_band as RiskLevel) ?? "medium",
        status: (finding.workflow_status as FinancialStatus) ?? "potential_match",
        priorityScore: Number(finding.priority_score),
        amount: finding.affected_amount_irr ?? 0,
        ratioToRevenue: finding.affected_ratio ? Number(finding.affected_ratio) : undefined,
        ruleCode: finding.finding_code,
        ruleDescription: finding.summary_fa,
        factors: {
          impact: {
            score: Number(factors.impact?.score ?? 70),
            weight: Number(factors.impact?.weight ?? 0.4),
            reason: factors.impact?.reasons_fa?.[0] ?? "اثر مالی بر نقدینگی",
          },
          materiality: {
            score: Number(factors.materiality?.score ?? 70),
            weight: Number(factors.materiality?.weight ?? 0.25),
            reason: factors.materiality?.reasons_fa?.[0] ?? "اهمیت نسبت به درآمد دوره",
          },
          confidence: {
            score: Number(factors.confidence?.score ?? 80),
            weight: Number(factors.confidence?.weight ?? 0.2),
            reason: factors.confidence?.reasons_fa?.[0] ?? "سطح اطمینان قطعی قاعده",
          },
          urgency: {
            score: Number(factors.urgency?.score ?? 75),
            weight: Number(factors.urgency?.weight ?? 0.15),
            reason: factors.urgency?.reasons_fa?.[0] ?? "فوریت بررسی در دوره جاری",
          },
        },
        evidenceItems: evidenceRes.items.map((item) => ({
          id: item.id,
          sourceType: item.evidence_type === "source_record" ? "bank" : item.evidence_type === "rule" ? "rule" : "system",
          title: item.claim_code || item.rule_code || "شاهد مالی",
          description: typeof item.calculation === "object" && Object.keys(item.calculation).length ? JSON.stringify(item.calculation) : "رکورد تاییدشده در منبع ورودی",
          fileName: item.source_file_id ? `فایل منبع ${item.source_file_id.slice(0, 8)}` : undefined,
          rowNumber: item.source_row_id ? parseInt(item.source_row_id.slice(-4), 16) || undefined : undefined,
        })),
      };

      setSelectedFindingDetail(detail);
      setDrawerOpen(true);
    } catch {
      toast.error("دریافت زنجیره شواهد این یافته با خطا مواجه شد.");
    }
  }

  // Filter & Search Logic
  const filteredFindings = useMemo(() => {
    return findings.filter((finding) => {
      if (filter === "critical_high" && finding.priority_band !== "critical" && finding.priority_band !== "high")
        return false;
      if (filter === "hypothesis" && finding.assertion_status !== "hypothesis") return false;
      if (filter === "reconciliation" && finding.category !== "reconciliation") return false;
      if (filter === "financial" && finding.category !== "financial_analysis") return false;

      if (deferredSearch) {
        const query = deferredSearch.toLowerCase();
        const matchesTitle = finding.title_fa.toLowerCase().includes(query);
        const matchesSummary = finding.summary_fa.toLowerCase().includes(query);
        const matchesCode = finding.finding_code.toLowerCase().includes(query);
        if (!matchesTitle && !matchesSummary && !matchesCode) return false;
      }

      return true;
    });
  }, [findings, filter, deferredSearch]);

  const columns: Column<Finding>[] = [
    {
      key: "finding_code",
      header: "نوع یافته",
      width: "160px",
      render: (row) => (
        <span className="text-xs font-bold text-foreground">
          {FINDING_CODE_LABELS[row.finding_code] ?? row.finding_code}
        </span>
      ),
    },
    {
      key: "title_fa",
      header: "عنوان و شرح ریسک",
      render: (row) => (
        <div className="flex items-center gap-2 min-w-0">
          <RiskBadge level={row.priority_band as RiskLevel} size="sm" showIcon={false} />
          <div className="min-w-0">
            <strong className="block text-xs font-bold text-foreground truncate max-w-sm">
              {row.title_fa}
            </strong>
            <span className="block text-[11px] text-muted-foreground truncate max-w-sm">
              {row.summary_fa}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "workflow_status",
      header: "وضعیت بررسی",
      width: "140px",
      render: (row) => <StatusChip status={row.workflow_status} size="sm" />,
    },
    {
      key: "affected_amount_irr",
      header: "مبلغ درگیر",
      numeric: true,
      render: (row) =>
        row.affected_amount_irr ? (
          <MoneyDisplay amount={row.affected_amount_irr} currency="ریال" size="sm" direction="negative" />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: "priority_score",
      header: "امتیاز اولویت",
      numeric: true,
      render: (row) => (
        <RiskBadge
          level={row.priority_band as RiskLevel}
          score={Number(row.priority_score)}
          size="sm"
          showIcon={false}
        />
      ),
    },
    {
      key: "actions",
      header: "عملیات",
      align: "center",
      render: (row) => (
        <div className="flex items-center gap-1.5 justify-center">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1 text-primary hover:text-primary hover:bg-primary/10"
            onClick={(e) => {
              e.stopPropagation();
              void openFindingDrawer(row);
            }}
          >
            مشاهده شواهد
            <ChevronLeft className="size-3" />
          </Button>
          <Link href={`/companies/${company.id}/findings/${row.id}`}>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              title="پرونده کامل یافته"
              onClick={(e) => e.stopPropagation()}
            >
              <ArrowUpRight className="size-3" />
            </Button>
          </Link>
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse" aria-label="در حال دریافت یافته‌ها">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Period Selector & Quick Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground">دوره مالی:</span>
          {analyses.length > 0 ? (
            <Select value={analysisId} onValueChange={(val) => void handleAnalysisChange(val)} dir="rtl">
              <SelectTrigger className="w-[220px] font-bold text-xs h-8">
                <Calendar className="size-3.5 text-primary ms-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {analyses.map((item) => (
                  <SelectItem key={item.id} value={item.id} className="text-xs">
                    {faDate(item.period_start)} تا {faDate(item.period_end)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-xs text-muted-foreground">دوره‌ای یافت نشد</span>
          )}
        </div>

        {run && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">وضعیت:</span>
            <StatusChip status={run.status} size="sm" />
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="text-xs">
          {error}
        </Alert>
      )}

      {/* Engine Run / Control Settings Bar */}
      <div className="p-3 rounded-xl border border-border bg-card/70 text-xs">
        <form onSubmit={(e) => void startFindingRun(e)} className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-1.5">
              <label htmlFor="trend-threshold-input" className="text-muted-foreground font-medium">آستانه تغییر روند:</label>
              <div className="flex items-center gap-0.5">
                <Input
                  id="trend-threshold-input"
                  type="number"
                  min={1}
                  max={100}
                  value={trendPercent}
                  onChange={(e) => setTrendPercent(Number(e.target.value))}
                  className="w-14 text-center font-mono h-7 text-xs bg-background"
                />
                <span className="text-muted-foreground font-bold">٪</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <label htmlFor="min-materiality-input" className="text-muted-foreground font-medium">کف اهمیت (ریال):</label>
              <Input
                id="min-materiality-input"
                type="text"
                value={minimumAmount}
                onChange={(e) => setMinimumAmount(e.target.value)}
                className="w-28 text-center font-mono h-7 text-xs bg-background"
              />
            </div>

            {reconciliations.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground font-medium">تطبیق مرتبط:</span>
                <Select value={reconciliationId} onValueChange={setReconciliationId} dir="rtl">
                  <SelectTrigger className="w-[180px] h-7 text-xs bg-background">
                    <SelectValue placeholder="انتخاب تطبیق" />
                  </SelectTrigger>
                  <SelectContent>
                    {reconciliations.map((r) => (
                      <SelectItem key={r.id} value={r.id} className="text-xs">
                        تطبیق {faDateTime(r.completed_at)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {canRun && (
            <Button type="submit" size="sm" disabled={submitting || isRunning} className="h-7 gap-1.5 text-xs font-bold ms-auto sm:ms-0">
              {isRunning ? <RefreshCcw className="size-3 animate-spin" /> : <Zap className="size-3" />}
              اجرای مجدد موتور یافته‌ها
            </Button>
          )}
        </form>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <Button
              key={f.id}
              size="sm"
              variant={filter === f.id ? "default" : "outline"}
              className="text-xs h-8"
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </Button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجوی یافته…"
            className="ps-9 h-8 text-xs"
          />
        </div>
      </div>

      {/* Findings Data Table */}
      <FinancialDataTable
        data={filteredFindings}
        columns={columns}
        keyExtractor={(row) => row.id}
        density="compact"
        emptyMessage="هیچ یافته‌ای با این فیلتر یا جستجو یافت نشد."
        onRowClick={(row) => void openFindingDrawer(row)}
      />

      {/* Side Evidence Drawer */}
      <EvidenceDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        finding={selectedFindingDetail}
        onAction={async (action) => {
          if (!selectedFindingDetail) return;
          try {
            await api(`/companies/${company.id}/findings/${selectedFindingDetail.id}/reviews`, {
              method: "POST",
              body: JSON.stringify({ decision: action }),
            });
            toast.success("تصمیم مشاور با موفقیت ثبت شد.");
            setDrawerOpen(false);
            if (run) await loadFindings(run.id);
          } catch {
            toast.error("ثبت تصمیم با خطا مواجه شد.");
          }
        }}
      />
    </div>
  );
}
