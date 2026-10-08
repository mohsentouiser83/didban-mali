"use client";

import Link from "next/link";
import { FindingTitleTransition } from "./finding-title-transition";
import { rememberFindingTitle } from "./finding-navigation-preview";
import {
  FormEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  ArrowUpRight,
  Calendar,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Filter,
  Layers,
  ListFilter,
  Plus,
  RefreshCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
  Zap,
  Download,
} from "@/components/ui/icons";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Column,
  EvidenceDrawer,
  EvidenceSourceTag,
  FinancialDataTable,
  FindingEvidenceDetail,
  FinancialStatus,
  KpiMetricCard,
  MoneyDisplay,
  ReviewActionBar,
  RiskBadge,
  RiskLevel,
  StatusChip,
  toPersianDigits,
  PageHeader,
} from "@/components/ui/financial";
import { toJalaliDate, toJalaliDateTime } from "@/lib/date-utils";

import { api } from "@/lib/product-api";
import type {
  AnalysisRun,
  Company,
  EvidenceItem,
  EvidenceItemsResponse,
  Finding,
  FindingGenerationRun,
  FindingsResponse,
  FindingWorkflowStatus,
  PriorityBand,
  ReconciliationRun,
} from "@/lib/product-types";

type FindingCategoryFilter =
  | "all"
  | "deterministic"
  | "hypothesis"
  | "critical_high"
  | "reconciliation"
  | "financial";
type SortOption = "priority" | "amount_desc" | "amount_asc" | "title";

const CATEGORY_FILTERS: { id: FindingCategoryFilter; label: string }[] = [
  { id: "all", label: "همه یافته‌ها" },
  { id: "deterministic", label: "شواهد و احکام قطعی" },
  { id: "hypothesis", label: "فرضیه‌های تحلیلی" },
  { id: "critical_high", label: "بحرانی و بالا" },
  { id: "reconciliation", label: "مغایرت‌های تطبیق" },
  { id: "financial", label: "روندهای مالی" },
];

const WORKFLOW_FILTERS: { id: "all" | FindingWorkflowStatus; label: string }[] =
  [
    { id: "all", label: "همه وضعیت‌ها" },
    { id: "needs_review", label: "نیازمند بررسی" },
    { id: "confirmed", label: "تأییدشده" },
    { id: "follow_up", label: "در پیگیری" },
    { id: "resolved", label: "حل‌شده" },
    { id: "dismissed", label: "ردشده" },
  ];

const SORT_OPTIONS: { id: SortOption; label: string }[] = [
  { id: "priority", label: "بیشترین اولویت" },
  { id: "amount_desc", label: "بیشترین مبلغ درگیر" },
  { id: "amount_asc", label: "کمترین مبلغ درگیر" },
  { id: "title", label: "عنوان یافته" },
];

function faDate(value: string | null | undefined) {
  if (!value) return "—";
  return toJalaliDate(value);
}

function faDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return toJalaliDateTime(value);
}

const FINDING_CODE_LABELS: Record<string, string> = {
  // Phase 3 deterministic rules
  UNMATCHED_BANK_OUTFLOW: "خروج وجه از بانک فاقد سند",
  UNMATCHED_JOURNAL_PAYMENT: "سند پرداخت فاقد گردش بانک",
  LARGE_AMOUNT_MISMATCH: "اختلاف مبلغ بااهمیت",
  DUPLICATE_BANK_STATEMENT_LINE: "تراکنش بانکی تکراری",
  OVERDUE_RECEIVABLE_EXTREME: "مطالبات با تاخیر بحرانی",
  CASH_RUNWAY_EXHAUSTION: "فرسایش سریع نقدینگی",
  ABNORMAL_DISCOUNT_SURGE: "جهش غیرعادی تخفیف",
  UNUSUAL_SALES_CREDIT_MEMO: "اسناد بستانکاری غیرمتعارف",
  // Legacy catalog codes
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
  const [reconciliations, setReconciliations] = useState<ReconciliationRun[]>(
    [],
  );
  const [reconciliationId, setReconciliationId] = useState("");
  const [run, setRun] = useState<FindingGenerationRun | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Filters & Sorting
  const [categoryFilter, setCategoryFilter] =
    useState<FindingCategoryFilter>("all");
  const [workflowFilter, setWorkflowFilter] = useState<
    "all" | FindingWorkflowStatus
  >("all");
  const [sortBy, setSortBy] = useState<SortOption>("priority");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());

  // Engine Params
  const [trendPercent, setTrendPercent] = useState(10);
  const [minimumAmount, setMinimumAmount] = useState("1000000");

  // Selection & Batch Operations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);

  // Evidence Drawer state
  const [selectedFindingDetail, setSelectedFindingDetail] =
    useState<FindingEvidenceDetail | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canRun = company.role !== "viewer";
  const isRunning = run?.status === "queued" || run?.status === "processing";

  const loadFindings = useCallback(
    async (runId: string, cursor?: string, append = false) => {
      const suffix = cursor ? `&cursor=${cursor}` : "";
      const result = await api<FindingsResponse>(
        `/companies/${company.id}/findings?generation_run_id=${runId}&limit=200${suffix}`,
      );
      setFindings((current) =>
        append ? [...current, ...result.items] : result.items,
      );
      setNextCursor(result.next_cursor);
    },
    [company.id],
  );

  const loadForAnalysis = useCallback(
    async (selectedAnalysisId: string) => {
      const [reconciliationRuns, findingRuns] = await Promise.all([
        api<ReconciliationRun[]>(
          `/companies/${company.id}/reconciliation-runs?analysis_run_id=${selectedAnalysisId}&limit=30`,
        ),
        api<FindingGenerationRun[]>(
          `/companies/${company.id}/finding-runs?analysis_run_id=${selectedAnalysisId}&limit=20`,
        ),
      ]);
      const readyReconciliations = reconciliationRuns.filter(
        (item) =>
          item.status === "completed" || item.status === "completed_limited",
      );
      const latestFindingRun = findingRuns[0] ?? null;
      setReconciliations(readyReconciliations);
      setReconciliationId(
        latestFindingRun?.reconciliation_run_id ??
          readyReconciliations[0]?.id ??
          "",
      );
      setRun(latestFindingRun);
      setFindings([]);
      setSelectedIds(new Set());
      setNextCursor(null);
      if (
        latestFindingRun?.status === "completed" ||
        latestFindingRun?.status === "completed_limited"
      ) {
        await loadFindings(latestFindingRun.id);
      }
    },
    [company.id, loadFindings],
  );

  useEffect(() => {
    let ignore = false;
    async function bootstrap() {
      setLoading(true);
      setError("");
      try {
        const allRuns = await api<AnalysisRun[]>(
          `/companies/${company.id}/analysis-runs?limit=30`,
        );
        const ready = allRuns.filter(
          (item) =>
            item.status === "completed" || item.status === "completed_limited",
        );
        if (ignore) return;
        setAnalyses(ready);
        const latest = ready[0];
        if (latest) {
          setAnalysisId(latest.id);
          await loadForAnalysis(latest.id);
        }
      } catch (caught) {
        if (!ignore)
          setError(
            caught instanceof Error
              ? caught.message
              : "اطلاعات یافته‌ها دریافت نشد.",
          );
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
          `/companies/${company.id}/finding-runs/${run.id}`,
        );
        setRun(current);
        if (
          current.status === "completed" ||
          current.status === "completed_limited"
        ) {
          window.clearInterval(timer);
          await loadFindings(current.id);
          setSubmitting(false);
          toast.success("موتور یافته‌ها با موفقیت تکمیل شد.");
        }
        if (current.status === "failed") {
          window.clearInterval(timer);
          setSubmitting(false);
          setError(
            current.failure_message ?? "اجرای موتور یافته‌ها با خطا مواجه شد.",
          );
        }
      } catch (caught) {
        window.clearInterval(timer);
        setSubmitting(false);
        setError(
          caught instanceof Error
            ? caught.message
            : "دریافت وضعیت یافته‌ها ناموفق بود.",
        );
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
      setError(
        caught instanceof Error
          ? caught.message
          : "اطلاعات این دوره دریافت نشد.",
      );
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
        },
      );
      setRun(created);
      setFindings([]);
      setSelectedIds(new Set());
      setNextCursor(null);
      toast.success("اجرای موتور یافته‌ها با موفقیت آغاز شد.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "اجرای موتور یافته‌ها ناموفق بود.",
      );
      setSubmitting(false);
    }
  }

  async function openFindingDrawer(finding: Finding) {
    try {
      const evidenceRes = await api<EvidenceItemsResponse>(
        `/companies/${company.id}/findings/${finding.id}/evidence`,
      );

      const factors = finding.priority_explanation?.factors ?? {};

      const detail: FindingEvidenceDetail = {
        id: finding.id,
        title: finding.title_fa,
        riskLevel: (finding.priority_band as RiskLevel) ?? "medium",
        status:
          (finding.workflow_status as FinancialStatus) ?? "potential_match",
        priorityScore: Number(finding.priority_score),
        amount: finding.affected_amount_irr ?? 0,
        ratioToRevenue: finding.affected_ratio
          ? Number(finding.affected_ratio)
          : undefined,
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
            reason:
              factors.materiality?.reasons_fa?.[0] ??
              "اهمیت نسبت به درآمد دوره",
          },
          confidence: {
            score: Number(factors.confidence?.score ?? 80),
            weight: Number(factors.confidence?.weight ?? 0.2),
            reason:
              factors.confidence?.reasons_fa?.[0] ?? "سطح اطمینان قطعی قاعده",
          },
          urgency: {
            score: Number(factors.urgency?.score ?? 75),
            weight: Number(factors.urgency?.weight ?? 0.15),
            reason:
              factors.urgency?.reasons_fa?.[0] ?? "فوریت بررسی در دوره جاری",
          },
        },
        evidenceItems: evidenceRes.items.map((item) => ({
          id: item.id,
          sourceType:
            item.evidence_type === "source_record"
              ? "bank"
              : item.evidence_type === "rule"
                ? "rule"
                : "system",
          title: item.claim_code || item.rule_code || "شاهد مالی",
          description:
            typeof item.calculation === "object" &&
            Object.keys(item.calculation).length
              ? JSON.stringify(item.calculation)
              : "رکورد تاییدشده در منبع ورودی",
          fileName: item.source_file_id
            ? `فایل منبع ${item.source_file_id.slice(0, 8)}`
            : undefined,
          rowNumber: item.source_row_id
            ? parseInt(item.source_row_id.slice(-4), 16) || undefined
            : undefined,
        })),
      };

      setSelectedFindingDetail(detail);
      setDrawerOpen(true);
    } catch {
      toast.error("دریافت زنجیره شواهد این یافته با خطا مواجه شد.");
    }
  }

  // Executive KPI Metrics Calculation
  const kpiMetrics = useMemo(() => {
    let totalExposure = 0;
    let criticalHigh = 0;
    let needsReview = 0;
    let resolved = 0;

    for (const item of findings) {
      if (item.affected_amount_irr) {
        totalExposure += Number(item.affected_amount_irr);
      }
      if (item.priority_band === "critical" || item.priority_band === "high") {
        criticalHigh++;
      }
      if (item.workflow_status === "needs_review") {
        needsReview++;
      }
      if (
        item.workflow_status === "resolved" ||
        item.workflow_status === "confirmed" ||
        item.workflow_status === "dismissed"
      ) {
        resolved++;
      }
    }

    const resolutionRate =
      findings.length > 0 ? Math.round((resolved / findings.length) * 100) : 0;

    return {
      totalExposure,
      criticalHigh,
      needsReview,
      resolved,
      resolutionRate,
      totalCount: findings.length,
    };
  }, [findings]);

  // Filter & Search & Sort Logic
  const filteredAndSortedFindings = useMemo(() => {
    const list = findings.filter((finding) => {
      if (
        categoryFilter === "critical_high" &&
        finding.priority_band !== "critical" &&
        finding.priority_band !== "high"
      )
        return false;
      if (
        categoryFilter === "deterministic" &&
        finding.assertion_status !== "deterministic"
      )
        return false;
      if (
        categoryFilter === "hypothesis" &&
        finding.assertion_status !== "hypothesis"
      )
        return false;
      if (
        categoryFilter === "reconciliation" &&
        finding.category !== "reconciliation"
      )
        return false;
      if (
        categoryFilter === "financial" &&
        finding.category !== "financial_analysis"
      )
        return false;

      if (
        workflowFilter !== "all" &&
        finding.workflow_status !== workflowFilter
      )
        return false;

      if (deferredSearch) {
        const query = deferredSearch.toLowerCase();
        const matchesTitle = finding.title_fa.toLowerCase().includes(query);
        const matchesSummary = finding.summary_fa.toLowerCase().includes(query);
        const matchesCode = finding.finding_code.toLowerCase().includes(query);
        if (!matchesTitle && !matchesSummary && !matchesCode) return false;
      }

      return true;
    });

    list.sort((a, b) => {
      if (sortBy === "priority") {
        return Number(b.priority_score) - Number(a.priority_score);
      }
      if (sortBy === "amount_desc") {
        return (
          Number(b.affected_amount_irr || 0) -
          Number(a.affected_amount_irr || 0)
        );
      }
      if (sortBy === "amount_asc") {
        return (
          Number(a.affected_amount_irr || 0) -
          Number(b.affected_amount_irr || 0)
        );
      }
      if (sortBy === "title") {
        return a.title_fa.localeCompare(b.title_fa);
      }
      return 0;
    });

    return list;
  }, [findings, categoryFilter, workflowFilter, deferredSearch, sortBy]);

  // Selection Checkbox State
  const allVisibleSelected =
    filteredAndSortedFindings.length > 0 &&
    filteredAndSortedFindings.every((f) => selectedIds.has(f.id));
  const someVisibleSelected =
    filteredAndSortedFindings.some((f) => selectedIds.has(f.id)) &&
    !allVisibleSelected;

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredAndSortedFindings.forEach((f) => next.delete(f.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredAndSortedFindings.forEach((f) => next.add(f.id));
        return next;
      });
    }
  };

  // Batch Action Handler
  const handleBatchDecision = async (
    decision: "confirmed" | "follow_up" | "resolved" | "dismissed",
  ) => {
    if (selectedIds.size === 0 || batchRunning) return;
    setBatchRunning(true);
    const targetIds = Array.from(selectedIds);
    let successCount = 0;

    for (const findingId of targetIds) {
      try {
        await api(`/companies/${company.id}/findings/${findingId}/decisions`, {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({ decision, note: "عملیات گروهی مشاور مالی" }),
        });
        successCount++;
      } catch {
        // Continue with the rest
      }
    }

    setFindings((prev) =>
      prev.map((f) =>
        selectedIds.has(f.id)
          ? { ...f, workflow_status: decision as FindingWorkflowStatus }
          : f,
      ),
    );
    setSelectedIds(new Set());
    setBatchRunning(false);
    toast.success(
      `${toPersianDigits(successCount)} یافته با موفقیت تعیین‌تکلیف شدند.`,
    );
  };

  const exportToCSV = () => {
    if (filteredAndSortedFindings.length === 0) {
      toast.error("یافته‌ای برای خروجی اکسل یافت نشد.");
      return;
    }
    const headers = [
      "شناسه",
      "کد مغایرت",
      "عنوان",
      "خلاصه",
      "اولویت",
      "وضعیت",
      "مبلغ درگیر (ریال)",
      "تاریخ ایجاد",
    ];
    const rows = filteredAndSortedFindings.map((f) => [
      f.id,
      f.finding_code,
      `"${f.title_fa.replace(/"/g, '""')}"`,
      `"${f.summary_fa.replace(/"/g, '""')}"`,
      f.priority_band || f.severity,
      f.workflow_status,
      f.affected_amount_irr || "",
      f.created_at,
    ]);
    const csvContent =
      "\uFEFF" +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `didban-findings-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("فایل خروجی اکسل با موفقیت ایجاد و دانلود شد.");
  };

  const columns: Column<Finding>[] = [
    {
      key: "select",
      header: "",
      width: "44px",
      align: "center",
      render: (row) => (
        <div
          className="flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selectedIds.has(row.id)}
            onCheckedChange={(checked) => {
              setSelectedIds((prev) => {
                const next = new Set(prev);
                if (checked) next.add(row.id);
                else next.delete(row.id);
                return next;
              });
            }}
            aria-label={`انتخاب یافته ${row.title_fa}`}
          />
        </div>
      ),
    },
    {
      key: "finding_code",
      header: "نوع و ماهیت یافته",
      width: "160px",
      render: (row) => (
        <div className="flex flex-col gap-1 items-start">
          <span className="text-xs font-bold text-foreground">
            {FINDING_CODE_LABELS[row.finding_code] ?? row.finding_code}
          </span>
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${
              row.assertion_status === "deterministic"
                ? "bg-primary/10 text-primary border border-primary/20"
                : "bg-primary/10 text-primary border border-primary/20"
            }`}
          >
            {row.assertion_status === "deterministic" ? (
              <>
                <ShieldCheck className="size-2.5" />
                <span>حکم قطعی</span>
              </>
            ) : (
              <>
                <Sparkles className="size-2.5" />
                <span>فرضیه تحلیلی</span>
              </>
            )}
          </span>
        </div>
      ),
    },
    {
      key: "title_fa",
      header: "عنوان و شرح ریسک",
      render: (row) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <RiskBadge
            level={row.priority_band as RiskLevel}
            size="sm"
            showIcon={false}
          />
          <div className="min-w-0">
            <FindingTitleTransition
              companyId={company.id}
              findingId={row.id}
              title={row.title_fa}
              className="block text-xs font-bold text-foreground truncate max-w-md"
            />
            <span className="block text-[11px] text-muted-foreground truncate max-w-md">
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
          <MoneyDisplay
            amount={row.affected_amount_irr}
            currency="ریال"
            size="sm"
            direction="negative"
          />
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
            className="gap-1"
            onClick={(e) => {
              e.stopPropagation();
              void openFindingDrawer(row);
            }}
          >
            مشاهده شواهد
            <ChevronLeft className="size-3" />
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="text-muted-foreground hover:text-foreground"
          >
            <Link
              href={`/companies/${company.id}/findings/${row.id}`}
              aria-label={`بازکردن پرونده ${row.title_fa}`}
              title="پرونده کامل یافته"
              onClick={(event) => event.stopPropagation()}
              onNavigate={() =>
                rememberFindingTitle(company.id, row.id, row.title_fa)
              }
            >
              <ArrowUpRight className="size-3" />
            </Link>
          </Button>
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <div
        className="space-y-6 animate-pulse"
        aria-label="در حال دریافت یافته‌ها"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-28 rounded-[var(--ds-card-radius)]"
            />
          ))}
        </div>
        <Skeleton className="h-12 w-full rounded-[var(--ds-card-radius)]" />
        <Skeleton className="h-96 w-full rounded-[var(--ds-card-radius)]" />
      </div>
    );
  }

  return (
    <div className="pp-page pp-findings space-y-6">
      {/* Page Header */}
      <PageHeader
        title="یافته‌ها"
        badge={
          <span className="inline-flex items-center gap-1.5 rounded-md bg-ds-warning/10 px-2 py-0.5 text-xs font-bold text-ds-warning">
            <ShieldAlert className="size-3.5" />
            کنترل مالی
          </span>
        }
        primaryAction={
          canRun ? (
            <Button
              size="sm"
              disabled={submitting || isRunning}
              onClick={(e) => void startFindingRun(e)}
              className="gap-1.5"
            >
              {isRunning ? (
                <RefreshCcw className="size-3 animate-spin" />
              ) : (
                <Zap className="size-3" />
              )}
              اجرای موتور یافته‌ها
            </Button>
          ) : undefined
        }
        secondaryActions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={exportToCSV}
            className="gap-1.5"
          >
            <Download className="size-3.5 text-muted-foreground" />
            <span>خروجی اکسل / CSV</span>
          </Button>
        }
      />

      {/* 1. Executive KPI Ribbon */}
      <div className="pp-metric-strip grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <KpiMetricCard
          title="حجم ریالی در معرض ریسک"
          value={kpiMetrics.totalExposure}
          currency="ریال"
          subtext={`از ${toPersianDigits(kpiMetrics.totalCount)} مورد شناسایی‌شده`}
          status={kpiMetrics.totalExposure > 0 ? "warning" : "normal"}
        />
        <KpiMetricCard
          currency=""
          title="یافته‌های بحرانی و با اولویت بالا"
          value={toPersianDigits(kpiMetrics.criticalHigh)}
          subtext="نیازمند مداخله کارشناسی فوری"
          status={kpiMetrics.criticalHigh > 0 ? "critical" : "normal"}
        />
        <KpiMetricCard
          currency=""
          title="نیازمند بررسی اولیه"
          value={toPersianDigits(kpiMetrics.needsReview)}
          subtext="موارد جدید بدون اقدام"
          status={kpiMetrics.needsReview > 0 ? "warning" : "normal"}
        />
        <KpiMetricCard
          currency=""
          title="نرخ رسیدگی و حل‌وفصل"
          value={`${toPersianDigits(kpiMetrics.resolutionRate)}٪`}
          subtext={`${toPersianDigits(kpiMetrics.resolved)} مورد تعیین‌تکلیف‌شده`}
          status={kpiMetrics.resolutionRate >= 80 ? "normal" : "warning"}
        />
      </div>

      {/* 2. Period Selector & Run Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground">
            دوره مالی:
          </span>
          {analyses.length > 0 ? (
            <Select
              value={analysisId}
              onValueChange={(val) => void handleAnalysisChange(val)}
              dir="rtl"
            >
              <SelectTrigger size="sm" className="w-[230px]">
                <Calendar className="size-3.5 text-primary ms-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {analyses.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {faDate(item.period_start)} تا {faDate(item.period_end)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-xs text-muted-foreground">
              دوره‌ای یافت نشد
            </span>
          )}
        </div>

        {run && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">وضعیت آخرین اسکن:</span>
            <StatusChip status={run.status} size="sm" />
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="text-xs">
          {error}
        </Alert>
      )}

      {/* 3. Engine Parameters & Run Bar */}
      <div className="pp-engine-toolbar p-3.5 rounded-[var(--ds-card-radius)] border border-border bg-card/70 text-xs">
        <form
          onSubmit={(e) => void startFindingRun(e)}
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex flex-wrap items-center gap-3.5 w-full sm:w-auto">
            <div className="flex items-center gap-1.5">
              <label
                htmlFor="trend-threshold-input"
                className="text-muted-foreground font-medium"
              >
                آستانه تغییر روند:
              </label>
              <div className="flex items-center gap-0.5">
                <Input
                  size="sm"
                  id="trend-threshold-input"
                  type="number"
                  min={1}
                  max={100}
                  value={trendPercent}
                  onChange={(e) => setTrendPercent(Number(e.target.value))}
                  className="w-14 text-center font-mono"
                />
                <span className="text-muted-foreground font-bold">٪</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <label
                htmlFor="min-materiality-input"
                className="text-muted-foreground font-medium"
              >
                کف اهمیت (ریال):
              </label>
              <Input
                size="sm"
                id="min-materiality-input"
                type="text"
                value={minimumAmount}
                onChange={(e) => setMinimumAmount(e.target.value)}
                className="w-28 text-center font-mono"
              />
            </div>

            {reconciliations.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground font-medium">
                  تطبیق مرتبط:
                </span>
                <Select
                  value={reconciliationId}
                  onValueChange={setReconciliationId}
                  dir="rtl"
                >
                  <SelectTrigger size="sm" className="w-[180px]">
                    <SelectValue placeholder="انتخاب تطبیق" />
                  </SelectTrigger>
                  <SelectContent>
                    {reconciliations.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        تطبیق {faDateTime(r.completed_at ?? null)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 ms-auto sm:ms-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={exportToCSV}
              className="gap-1.5"
            >
              <Download className="size-3 text-muted-foreground" />
              <span>خروجی اکسل / CSV</span>
            </Button>

            {canRun && (
              <Button
                type="submit"
                size="sm"
                disabled={submitting || isRunning}
                className="gap-1.5"
              >
                {isRunning ? (
                  <RefreshCcw className="size-3 animate-spin" />
                ) : (
                  <Zap className="size-3" />
                )}
                اجرای مجدد موتور یافته‌ها
              </Button>
            )}
          </div>
        </form>
      </div>

      {/* 4. Multi-dimensional Filters, Sort & Search Toolbar */}
      <div className="pp-filter-toolbar flex flex-col gap-3">
        {/* Category Filter Chips */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_FILTERS.map((f) => (
              <Button
                key={f.id}
                size="sm"
                variant={categoryFilter === f.id ? "default" : "outline"}
                className=""
                onClick={() => setCategoryFilter(f.id)}
              >
                {f.label}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
            <span>تعداد نمایش:</span>
            <span className="font-bold text-foreground">
              {toPersianDigits(filteredAndSortedFindings.length)}
            </span>
            <span>از</span>
            <span>{toPersianDigits(findings.length)}</span>
          </div>
        </div>

        {/* Secondary Bar: Workflow Status, Sort, Search */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <ListFilter className="size-3.5 text-muted-foreground" />
              <Select
                value={workflowFilter}
                onValueChange={(val) =>
                  setWorkflowFilter(val as "all" | FindingWorkflowStatus)
                }
                dir="rtl"
              >
                <SelectTrigger size="sm" className="w-[145px]">
                  <SelectValue placeholder="وضعیت بررسی" />
                </SelectTrigger>
                <SelectContent>
                  {WORKFLOW_FILTERS.map((wf) => (
                    <SelectItem key={wf.id} value={wf.id}>
                      {wf.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="size-3.5 text-muted-foreground" />
              <Select
                value={sortBy}
                onValueChange={(val) => setSortBy(val as SortOption)}
                dir="rtl"
              >
                <SelectTrigger size="sm" className="w-[155px]">
                  <SelectValue placeholder="مرتب‌سازی" />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedIds.size > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground gap-1"
                onClick={() => setSelectedIds(new Set())}
              >
                <X className="size-3.5" />
                لغو انتخاب‌ها ({toPersianDigits(selectedIds.size)})
              </Button>
            )}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              size="sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجو در عنوان یا نوع یافته…"
              className="ps-9"
            />
          </div>
        </div>
      </div>

      {/* 5. Findings High-Density Data Table */}
      <FinancialDataTable
        data={filteredAndSortedFindings}
        columns={columns}
        keyExtractor={(row) => row.id}
        density="compact"
        emptyMessage="هیچ یافته‌ای با این شرایط فیلتر یا جستجو یافت نشد."
        onRowClick={(row) => void openFindingDrawer(row)}
      />

      {/* 6. Floating Batch Action Bar */}
      <ReviewActionBar
        selectedCount={selectedIds.size}
        onConfirm={() => void handleBatchDecision("confirmed")}
        onFollowUp={() => void handleBatchDecision("follow_up")}
        onResolve={() => void handleBatchDecision("resolved")}
        onDismiss={() => void handleBatchDecision("dismissed")}
        onClear={() => setSelectedIds(new Set())}
        disabled={batchRunning}
      />

      {/* 7. Side Evidence Drawer with Action Form */}
      <EvidenceDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        finding={selectedFindingDetail}
        onAction={async (action, note) => {
          if (!selectedFindingDetail) return;
          try {
            await api(
              `/companies/${company.id}/findings/${selectedFindingDetail.id}/decisions`,
              {
                method: "POST",
                headers: { "Idempotency-Key": crypto.randomUUID() },
                body: JSON.stringify({ decision: action, note: note || null }),
              },
            );
            toast.success("تصمیم مشاور با موفقیت ثبت شد.");
            setDrawerOpen(false);
            setFindings((prev) =>
              prev.map((f) =>
                f.id === selectedFindingDetail.id
                  ? { ...f, workflow_status: action as FindingWorkflowStatus }
                  : f,
              ),
            );
          } catch {
            toast.error("ثبت تصمیم با خطا مواجه شد.");
          }
        }}
      />
    </div>
  );
}
