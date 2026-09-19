"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  Calendar,
  FileCheck2,
  RefreshCcw,
  SlidersHorizontal,
  Layers,
  Zap,
  Building2,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MoneyDisplay,
  StatusChip,
  EvidenceSourceTag,
  FinancialDataTable,
  Column,
  toPersianDigits,
  FinancialStatus,
} from "@/components/ui/financial";

import { api } from "@/lib/product-api";
import type {
  AnalysisRun,
  Company,
  MatchStatus,
  ReconciliationMatch,
  ReconciliationMatchesResponse,
  ReconciliationRun,
} from "@/lib/product-types";

import { AiSemanticRanking } from "./ai-semantic-ranking";

type MatchFilter = "all" | "matched" | "review" | "mismatch" | "duplicate" | "unresolved";

const filters: { id: MatchFilter; label: string; statuses?: MatchStatus[] }[] = [
  { id: "all", label: "همه تراکنش‌ها" },
  { id: "matched", label: "تطبیق قطعی ۱۰۰٪", statuses: ["auto_matched"] },
  { id: "review", label: "نیازمند بررسی انسانی", statuses: ["potential_match"] },
  { id: "mismatch", label: "مغایرت مبلغ/تاریخ", statuses: ["amount_mismatch", "date_mismatch"] },
  { id: "duplicate", label: "تکراری", statuses: ["duplicate_high", "duplicate_possible"] },
  { id: "unresolved", label: "بدون متناظر", statuses: ["unresolved"] },
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

export function ReconciliationWorkspace({ company }: { company: Company }) {
  const [analyses, setAnalyses] = useState<AnalysisRun[]>([]);
  const [analysisId, setAnalysisId] = useState("");
  const [run, setRun] = useState<ReconciliationRun | null>(null);
  const [matches, setMatches] = useState<ReconciliationMatch[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<MatchFilter>("all");
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [tableDensity, setTableDensity] = useState<"compact" | "normal">("normal");

  const [ruleDays, setRuleDays] = useState(3);
  const [reviewDays, setReviewDays] = useState(10);
  const [fuzzyThreshold, setFuzzyThreshold] = useState(70);
  const [ambiguityMargin, setAmbiguityMargin] = useState(5);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canRun = company.role !== "viewer";
  const isRunning = run?.status === "queued" || run?.status === "processing";

  const loadMatches = useCallback(
    async (runId: string, cursor?: string, append = false) => {
      const suffix = cursor ? `&cursor=${cursor}` : "";
      const result = await api<ReconciliationMatchesResponse>(
        `/companies/${company.id}/reconciliation-runs/${runId}/matches?limit=200${suffix}`
      );
      setMatches((current) => (append ? [...current, ...result.items] : result.items));
      setNextCursor(result.next_cursor);
    },
    [company.id]
  );

  const loadRunForAnalysis = useCallback(
    async (selectedAnalysisId: string) => {
      const runs = await api<ReconciliationRun[]>(
        `/companies/${company.id}/reconciliation-runs?analysis_run_id=${selectedAnalysisId}&limit=1`
      );
      const latest = runs[0] ?? null;
      setRun(latest);
      setMatches([]);
      setNextCursor(null);
      if (latest?.status === "completed" || latest?.status === "completed_limited") {
        await loadMatches(latest.id);
      }
    },
    [company.id, loadMatches]
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
          await loadRunForAnalysis(latest.id);
        }
      } catch (caught) {
        if (!ignore) setError(caught instanceof Error ? caught.message : "اطلاعات تطبیق دریافت نشد.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void bootstrap();
    return () => {
      ignore = true;
    };
  }, [company.id, loadRunForAnalysis]);

  async function handleAnalysisChange(value: string) {
    setAnalysisId(value);
    setLoading(true);
    setError("");
    try {
      await loadRunForAnalysis(value);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "اطلاعات تطبیق این دوره دریافت نشد.");
    } finally {
      setLoading(false);
    }
  }

  async function startReconciliation(event: FormEvent) {
    event.preventDefault();
    if (!analysisId || !canRun || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const created = await api<ReconciliationRun>(`/companies/${company.id}/reconciliation-runs`, {
        method: "POST",
        body: JSON.stringify({
          analysis_run_id: analysisId,
          rule_set_version: "recon-rules-v1",
          exact_day_window: ruleDays,
          review_day_window: reviewDays,
          fuzzy_similarity_threshold: fuzzyThreshold,
          ambiguity_margin: ambiguityMargin,
        }),
      });
      setRun(created);
      toast.success("اجرای موتور تطبیق آغاز شد.");
      await loadRunForAnalysis(analysisId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "اجرای موتور تطبیق با خطا مواجه شد.");
    } finally {
      setSubmitting(false);
    }
  }

  const filteredMatches = useMemo(() => {
    const activeFilter = filters.find((f) => f.id === filter);
    if (!activeFilter || !activeFilter.statuses) return matches;
    return matches.filter((m) => activeFilter.statuses!.includes(m.status));
  }, [matches, filter]);

  // Status mapping helper
  function mapReconStatus(status: MatchStatus): FinancialStatus {
    switch (status) {
      case "auto_matched":
        return "exact_match";
      case "potential_match":
        return "potential_match";
      case "amount_mismatch":
        return "amount_mismatch";
      case "date_mismatch":
        return "date_mismatch";
      case "duplicate_high":
      case "duplicate_possible":
        return "duplicate";
      case "unresolved":
      default:
        return "unmatched_bank";
    }
  }

  const columns: Column<ReconciliationMatch>[] = [
    {
      key: "status",
      header: "وضعیت تطبیق",
      width: "160px",
      render: (row) => <StatusChip status={mapReconStatus(row.status)} size="sm" />,
    },
    {
      key: "bank_record",
      header: "تراکنش بانکی (مبدا بانک)",
      render: (row) => (
        <div className="space-y-0.5 min-w-0 max-w-xs">
          <div className="flex items-center gap-1.5 text-xs">
            <Building2 className="size-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <strong className="text-foreground truncate">{row.evidence.bank?.description || "تراکنش بانکی"}</strong>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
            <span>{row.evidence.bank?.date ? faDate(row.evidence.bank.date) : "—"}</span>
            {row.evidence.bank?.reference && <span>پیگیری: {row.evidence.bank.reference}</span>}
          </div>
        </div>
      ),
    },
    {
      key: "bank_amount",
      header: "مبلغ بانک",
      numeric: true,
      render: (row) =>
        row.evidence.bank?.amount_irr ? (
          <MoneyDisplay amount={row.evidence.bank.amount_irr} currency="ریال" size="sm" />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: "gl_record",
      header: "سند حسابداری (دفتر روزنامه)",
      render: (row) => (
        <div className="space-y-0.5 min-w-0 max-w-xs">
          <div className="flex items-center gap-1.5 text-xs">
            <BookOpen className="size-3 text-blue-600 dark:text-blue-400 shrink-0" />
            <strong className="text-foreground truncate">
              {row.journal_entry_id ? `سند شماره ${row.journal_entry_id.slice(0, 8)}` : "فاقد سند متناظر"}
            </strong>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
            <span>{row.evidence.accounting?.date ? faDate(row.evidence.accounting.date) : "—"}</span>
            {row.evidence.accounting?.description && (
              <span className="truncate max-w-[150px]">{row.evidence.accounting.description}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "gl_amount",
      header: "مبلغ سند",
      numeric: true,
      render: (row) =>
        row.evidence.accounting?.amount_irr ? (
          <MoneyDisplay amount={row.evidence.accounting.amount_irr} currency="ریال" size="sm" />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: "score",
      header: "امتیاز اطمینان",
      numeric: true,
      render: (row) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {toPersianDigits(Math.round(Number(row.score)))}٪
        </span>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse" aria-label="در حال دریافت داده‌های تطبیق">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-[var(--ds-border)] pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
              <ArrowRightLeft className="size-3.5" />
              موتور تطبیق خودکار و مغایرت‌گیری
            </span>
            <span className="text-xs text-muted-foreground">تطبیق ۱ به ۱ قطعی + کاندیدسازی هوشمند</span>
          </div>
          <h1 className="text-xl lg:text-2xl font-extrabold text-foreground tracking-tight">
            تطبیق تراکنش‌های بانکی و اسناد حسابداری
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            کشف دقیق مغایرت‌های مبلغ، تاریخ و تراکنش‌های فاقد سند با زنجیره کامل شواهد
          </p>
        </div>

        {/* Period Selector */}
        {analyses.length > 0 && (
          <div className="flex items-center gap-3">
            <Select value={analysisId} onValueChange={(val) => void handleAnalysisChange(val)} dir="rtl">
              <SelectTrigger className="w-[220px] font-bold text-xs">
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
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="text-xs">
          {error}
        </Alert>
      )}

      {/* Engine Run / Thresholds Card */}
      <Card>
        <CardContent className="pt-5">
          <form onSubmit={(e) => void startReconciliation(e)} className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="space-y-1.5">
                <label htmlFor="rule-days-input" className="font-bold text-foreground">پنجره روز کاری قطعی</label>
                <Input
                  id="rule-days-input"
                  type="number"
                  min={0}
                  max={30}
                  value={ruleDays}
                  onChange={(e) => setRuleDays(Number(e.target.value))}
                  className="w-20 text-center font-mono h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="review-days-input" className="font-bold text-foreground">پنجره روز کاری بررسی</label>
                <Input
                  id="review-days-input"
                  type="number"
                  min={1}
                  max={60}
                  value={reviewDays}
                  onChange={(e) => setReviewDays(Number(e.target.value))}
                  className="w-20 text-center font-mono h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="fuzzy-threshold-input" className="font-bold text-foreground">آستانه شباهت شرح (درصد)</label>
                <Input
                  id="fuzzy-threshold-input"
                  type="number"
                  min={50}
                  max={100}
                  value={fuzzyThreshold}
                  onChange={(e) => setFuzzyThreshold(Number(e.target.value))}
                  className="w-20 text-center font-mono h-9 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              {run && (
                <div className="text-xs text-muted-foreground text-start">
                  <span>وضعیت تطبیق: </span>
                  <StatusChip status={run.status === "completed" ? "resolved" : "processing"} label={run.status} size="sm" />
                </div>
              )}

              {canRun && (
                <Button type="submit" disabled={submitting || isRunning} className="gap-2 text-xs font-bold">
                  {isRunning ? <RefreshCcw className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
                  اجرای مجدد موتور تطبیق
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* AI Semantic Ranking for Potential Matches */}
      {company.role !== "viewer" && run && (
        <AiSemanticRanking
          company={company}
          runId={run.id}
          candidates={matches.filter((m) => m.status === "potential_match")}
        />
      )}

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

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 border border-border rounded-lg p-0.5 bg-muted/40">
            <Button
              size="sm"
              variant={tableDensity === "compact" ? "default" : "ghost"}
              className="h-7 px-2 text-xs"
              title="تراکم فشرده (حسابداران)"
              onClick={() => setTableDensity("compact")}
            >
              <SlidersHorizontal className="size-3" />
            </Button>
            <Button
              size="sm"
              variant={tableDensity === "normal" ? "default" : "ghost"}
              className="h-7 px-2 text-xs"
              title="تراکم استاندارد (مدیران)"
              onClick={() => setTableDensity("normal")}
            >
              <Layers className="size-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Reconciliation Matches Data Table */}
      <FinancialDataTable
        data={filteredMatches}
        columns={columns}
        keyExtractor={(row) => row.id}
        density={tableDensity}
        emptyMessage="هیچ تراکنشی در این دسته تطبیق یافت نشد."
        onRowClick={(row) => {
          setExpandedMatchId(expandedMatchId === row.id ? null : row.id);
        }}
      />

      {/* Selected Match Drilldown Details Card */}
      {expandedMatchId && (
        <Card className="border-primary/30 bg-primary/[0.02]">
          <CardHeader className="pb-3 border-b border-[var(--ds-border)]">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-extrabold flex items-center gap-2">
                <FileCheck2 className="size-4 text-primary" />
                جزئیات و شواهد تطبیق جفت انتخابی
              </CardTitle>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setExpandedMatchId(null)}>
                بستن جزئیات
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {(() => {
              const item = matches.find((m) => m.id === expandedMatchId);
              if (!item) return null;
              return (
                <div className="grid gap-4 md:grid-cols-2 text-xs">
                  {/* Bank Side Details */}
                  <div className="rounded-xl border border-[var(--ds-border)] bg-[var(--ds-card)] p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <EvidenceSourceTag source="bank" size="sm" />
                      <span className="font-mono text-muted-foreground">
                        {item.evidence.bank?.date ? faDate(item.evidence.bank.date) : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">مبلغ تراکنش:</span>
                      <MoneyDisplay amount={item.evidence.bank?.amount_irr} currency="ریال" size="lg" />
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">شرح بانک:</span>
                      <p className="font-medium text-foreground">{item.evidence.bank?.description || "—"}</p>
                    </div>
                    {item.evidence.bank?.reference && (
                      <div className="font-mono text-[11px] text-muted-foreground">
                        شناسه پیگیری: {item.evidence.bank.reference}
                      </div>
                    )}
                  </div>

                  {/* Accounting Side Details */}
                  <div className="rounded-xl border border-[var(--ds-border)] bg-[var(--ds-card)] p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <EvidenceSourceTag source="accounting" size="sm" />
                      <span className="font-mono text-muted-foreground">
                        {item.evidence.accounting?.date ? faDate(item.evidence.accounting.date) : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">مبلغ سند:</span>
                      <MoneyDisplay amount={item.evidence.accounting?.amount_irr} currency="ریال" size="lg" />
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">شرح سند:</span>
                      <p className="font-medium text-foreground">{item.evidence.accounting?.description || "—"}</p>
                    </div>
                    {item.journal_entry_id && (
                      <div className="font-mono text-[11px] text-muted-foreground">
                        شناسه سند: {item.journal_entry_id}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
