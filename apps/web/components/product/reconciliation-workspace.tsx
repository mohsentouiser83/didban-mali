import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  Calendar,
  RefreshCcw,
  Zap,
  Building2,
  BookOpen,
  Scale,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  FileQuestion,
  Copy,
} from "lucide-react";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MoneyDisplay,
  StatusChip,
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

type MatchFilter = "all" | "matched" | "review" | "mismatch" | "duplicate" | "unresolved";

const filterConfigs: { id: MatchFilter; label: string; statuses?: MatchStatus[]; icon: typeof CheckCircle2 }[] = [
  { id: "all", label: "همه موارد", icon: Scale },
  { id: "matched", label: "تطبیق قطعی ۱۰۰٪", statuses: ["auto_matched"], icon: CheckCircle2 },
  { id: "review", label: "نیازمند بررسی", statuses: ["potential_match"], icon: HelpCircle },
  { id: "mismatch", label: "مغایرت مبلغ/تاریخ", statuses: ["amount_mismatch", "date_mismatch"], icon: AlertCircle },
  { id: "duplicate", label: "تکراری", statuses: ["duplicate_high", "duplicate_possible"], icon: Copy },
  { id: "unresolved", label: "بدون متناظر", statuses: ["unresolved"], icon: FileQuestion },
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

export function ReconciliationWorkspace({ company }: { company: Company }) {
  const [analyses, setAnalyses] = useState<AnalysisRun[]>([]);
  const [analysisId, setAnalysisId] = useState("");
  const [run, setRun] = useState<ReconciliationRun | null>(null);
  const [matches, setMatches] = useState<ReconciliationMatch[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<MatchFilter>("all");

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

  useEffect(() => {
    if (!run || !isRunning) return;
    const timer = window.setInterval(async () => {
      try {
        const current = await api<ReconciliationRun>(
          `/companies/${company.id}/reconciliation-runs/${run.id}`
        );
        setRun(current);
        if (current.status === "completed" || current.status === "completed_limited") {
          window.clearInterval(timer);
          await loadMatches(current.id);
          setSubmitting(false);
          toast.success("تطبیق با موفقیت تکمیل شد.");
        }
        if (current.status === "failed") {
          window.clearInterval(timer);
          setSubmitting(false);
          setError(current.failure_message ?? "اجرای موتور تطبیق با خطا مواجه شد.");
        }
      } catch (caught) {
        window.clearInterval(timer);
        setSubmitting(false);
        setError(caught instanceof Error ? caught.message : "دریافت وضعیت تطبیق ناموفق بود.");
      }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [company.id, isRunning, loadMatches, run]);

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
      const created = await api<ReconciliationRun>(
        `/companies/${company.id}/analysis-runs/${analysisId}/reconciliation-runs`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({
            config_version: "reconciliation-v1",
            rule_business_days: ruleDays,
            review_calendar_days: reviewDays,
            fuzzy_threshold: fuzzyThreshold,
            ambiguity_margin: ambiguityMargin,
          }),
        }
      );
      setRun(created);
      setMatches([]);
      setNextCursor(null);
      toast.success("اجرای موتور تطبیق آغاز شد.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "اجرای موتور تطبیق با خطا مواجه شد.");
      setSubmitting(false);
    }
  }

  const filteredMatches = useMemo(() => {
    const activeFilter = filterConfigs.find((f) => f.id === filter);
    if (!activeFilter || !activeFilter.statuses) return matches;
    return matches.filter((m) => activeFilter.statuses!.includes(m.status));
  }, [matches, filter]);

  const counts = useMemo(() => {
    const matched = matches.filter((m) => m.status === "auto_matched").length;
    const review = matches.filter((m) => m.status === "potential_match").length;
    const mismatch = matches.filter((m) => m.status === "amount_mismatch" || m.status === "date_mismatch").length;
    const duplicate = matches.filter((m) => m.status === "duplicate_high" || m.status === "duplicate_possible").length;
    const unresolved = matches.filter((m) => m.status === "unresolved").length;
    return {
      all: matches.length,
      matched,
      review,
      mismatch,
      duplicate,
      unresolved,
    };
  }, [matches]);

  function mapReconStatus(status: MatchStatus, row: ReconciliationMatch): { status: FinancialStatus; label: string } {
    switch (status) {
      case "auto_matched":
        return { status: "exact_match", label: "تطبیق قطعی" };
      case "potential_match":
        return { status: "potential_match", label: "نیازمند بررسی" };
      case "amount_mismatch":
        return { status: "amount_mismatch", label: "مغایرت مبلغ" };
      case "date_mismatch":
        return { status: "date_mismatch", label: "مغایرت تاریخ" };
      case "duplicate_high":
      case "duplicate_possible":
        return { status: "duplicate", label: "تکراری" };
      case "unresolved":
      default:
        if (row.bank_transaction_id && !row.journal_entry_id) {
          return { status: "unmatched_bank", label: "فاقد سند در حسابداری" };
        }
        if (!row.bank_transaction_id && row.journal_entry_id) {
          return { status: "unmatched_accounting", label: "فاقد گردش در بانک" };
        }
        return { status: "unmatched_bank", label: "بدون متناظر" };
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse" aria-label="در حال دریافت داده‌های تطبیق">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            تطبیق و مغایرت‌گیری
          </h1>
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

      {/* Quick Stats Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <div className="rounded-xl border border-border bg-card/60 p-3 flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-muted-foreground">کل موارد</span>
          <span className="text-lg font-mono font-black text-foreground mt-1">{toPersianDigits(counts.all)}</span>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">تطبیق قطعی</span>
          <span className="text-lg font-mono font-black text-emerald-600 dark:text-emerald-400 mt-1">{toPersianDigits(counts.matched)}</span>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">نیازمند بررسی</span>
          <span className="text-lg font-mono font-black text-amber-600 dark:text-amber-400 mt-1">{toPersianDigits(counts.review)}</span>
        </div>
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">مغایرت مبلغ/تاریخ</span>
          <span className="text-lg font-mono font-black text-rose-600 dark:text-rose-400 mt-1">{toPersianDigits(counts.mismatch)}</span>
        </div>
        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3 flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-300">تکراری</span>
          <span className="text-lg font-mono font-black text-purple-600 dark:text-purple-400 mt-1">{toPersianDigits(counts.duplicate)}</span>
        </div>
        <div className="rounded-xl border border-slate-500/20 bg-slate-500/5 p-3 flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-muted-foreground">بدون متناظر</span>
          <span className="text-lg font-mono font-black text-foreground mt-1">{toPersianDigits(counts.unresolved)}</span>
        </div>
      </div>

      {/* Engine Run / Compact Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-border bg-card/70 text-xs">
        <form onSubmit={(e) => void startReconciliation(e)} className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-1.5">
            <label htmlFor="rule-days-input" className="text-muted-foreground font-medium">پنجره روز قطعی:</label>
            <Input
              id="rule-days-input"
              type="number"
              min={0}
              max={30}
              value={ruleDays}
              onChange={(e) => setRuleDays(Number(e.target.value))}
              className="w-12 h-7 text-center font-mono text-xs bg-background"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <label htmlFor="review-days-input" className="text-muted-foreground font-medium">پنجره روز بررسی:</label>
            <Input
              id="review-days-input"
              type="number"
              min={1}
              max={60}
              value={reviewDays}
              onChange={(e) => setReviewDays(Number(e.target.value))}
              className="w-12 h-7 text-center font-mono text-xs bg-background"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <label htmlFor="fuzzy-threshold-input" className="text-muted-foreground font-medium">آستانه شباهت:</label>
            <div className="flex items-center gap-1">
              <Input
                id="fuzzy-threshold-input"
                type="number"
                min={50}
                max={100}
                value={fuzzyThreshold}
                onChange={(e) => setFuzzyThreshold(Number(e.target.value))}
                className="w-12 h-7 text-center font-mono text-xs bg-background"
              />
              <span className="text-muted-foreground font-bold">٪</span>
            </div>
          </div>

          {canRun && (
            <Button type="submit" size="sm" disabled={submitting || isRunning} className="h-7 gap-1.5 text-xs font-bold ms-auto sm:ms-2">
              {isRunning ? <RefreshCcw className="size-3 animate-spin" /> : <Zap className="size-3" />}
              اجرای تطبیق
            </Button>
          )}
        </form>

        {run && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">وضعیت:</span>
            <StatusChip status={run.status} size="sm" />
          </div>
        )}
      </div>

      {/* Filter Tabs with Counts */}
      <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
        {filterConfigs.map((f) => {
          const count = counts[f.id];
          const Icon = f.icon;
          const isActive = filter === f.id;
          return (
            <Button
              key={f.id}
              size="sm"
              variant={isActive ? "default" : "outline"}
              className={`text-xs h-8 gap-1.5 rounded-lg font-medium transition-all ${
                isActive ? "shadow-sm" : "bg-card/50 hover:bg-muted"
              }`}
              onClick={() => setFilter(f.id)}
            >
              <Icon className="size-3.5" />
              <span>{f.label}</span>
              <span
                className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full ${
                  isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {toPersianDigits(count)}
              </span>
            </Button>
          );
        })}
      </div>

      {/* Accounting Split-Table Container */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
        {/* Split Table Header */}
        <div className="grid grid-cols-1 lg:grid-cols-12 bg-muted/50 border-b border-border text-xs font-bold select-none divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-border">
          {/* Bank Side Header */}
          <div className="lg:col-span-5 p-3 flex items-center justify-between bg-emerald-500/5 text-emerald-950 dark:text-emerald-200">
            <div className="flex items-center gap-2">
              <Building2 className="size-4 text-emerald-600 dark:text-emerald-400" />
              <span className="font-bold text-xs">گردش صورت‌حساب بانکی</span>
            </div>
            <span className="text-xs font-bold text-muted-foreground">مبلغ بانک</span>
          </div>

          {/* Center Bridge Header */}
          <div className="lg:col-span-2 p-3 flex items-center justify-center bg-muted/70 text-foreground text-center">
            <span className="font-bold text-xs">وضعیت تطبیق</span>
          </div>

          {/* Accounting Side Header */}
          <div className="lg:col-span-5 p-3 flex items-center justify-between bg-blue-500/5 text-blue-950 dark:text-blue-200">
            <span className="text-xs font-bold text-muted-foreground">مبلغ سند</span>
            <div className="flex items-center gap-2 text-start">
              <BookOpen className="size-4 text-blue-600 dark:text-blue-400" />
              <span className="font-bold text-xs">اسناد دفاتر حسابداری</span>
            </div>
          </div>
        </div>

        {/* Split Table Body */}
        {filteredMatches.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-xs space-y-2">
            <FileQuestion className="size-8 mx-auto text-muted-foreground/50" />
            <p className="font-semibold">هیچ موردی یافت نشد.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredMatches.map((row) => {
              const hasBank = Boolean(row.evidence.bank?.amount_irr || row.bank_transaction_id);
              const hasAccounting = Boolean(row.evidence.accounting?.amount_irr || row.journal_entry_id);
              const scoreNum = Math.round(Number(row.score));
              const reconStatus = mapReconStatus(row.status, row);

              return (
                <div
                  key={row.id}
                  className="grid grid-cols-1 lg:grid-cols-12 hover:bg-muted/25 transition-colors divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-border text-xs items-stretch"
                >
                  {/* Bank Column (Right) */}
                  <div className="lg:col-span-5 p-3.5 flex flex-col justify-between">
                    {hasBank ? (
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-0.5 min-w-0">
                            <strong className="text-foreground text-xs font-bold block truncate">
                              {row.evidence.bank?.description || "تراکنش بانکی"}
                            </strong>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground font-mono">
                              <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-foreground border border-border/60">
                                {row.evidence.bank?.date ? faDate(row.evidence.bank.date) : "—"}
                              </span>
                              {row.evidence.bank?.reference && (
                                <span className="truncate">کد پیگیری: {row.evidence.bank.reference}</span>
                              )}
                            </div>
                          </div>

                          <div className="shrink-0 text-start">
                            {row.evidence.bank?.amount_irr ? (
                              <MoneyDisplay
                                amount={row.evidence.bank.amount_irr}
                                currency="ریال"
                                size="sm"
                                className="font-extrabold text-emerald-600 dark:text-emerald-400"
                              />
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="h-full min-h-[48px] rounded-lg border border-dashed border-muted-foreground/30 bg-muted/15 flex items-center justify-center p-2 text-muted-foreground">
                        <span className="text-[11px] font-medium flex items-center gap-1.5">
                          <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                          فاقد گردش در صورت‌حساب بانکی
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Middle Comparison Bridge Column */}
                  <div className="lg:col-span-2 p-3 flex flex-col items-center justify-center gap-1.5 bg-muted/10 text-center">
                    <StatusChip status={reconStatus.status} label={reconStatus.label} size="sm" />
                    <span className="font-mono text-[11px] font-extrabold text-foreground bg-background px-2 py-0.5 rounded-full border border-border shadow-2xs">
                      {toPersianDigits(scoreNum)}٪ اطمینان
                    </span>
                    {row.amount_difference_irr && Number(row.amount_difference_irr) !== 0 && (
                      <div className="text-[10px] font-mono font-bold text-amber-700 dark:text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                        اختلاف: {toPersianDigits(Math.abs(Number(row.amount_difference_irr)).toLocaleString("fa-IR"))} ریال
                      </div>
                    )}
                  </div>

                  {/* Accounting Column (Left) */}
                  <div className="lg:col-span-5 p-3.5 flex flex-col justify-between">
                    {hasAccounting ? (
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="shrink-0 text-start">
                            {row.evidence.accounting?.amount_irr ? (
                              <MoneyDisplay
                                amount={row.evidence.accounting?.amount_irr}
                                currency="ریال"
                                size="sm"
                                className="font-extrabold text-blue-600 dark:text-blue-400"
                              />
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </div>

                          <div className="space-y-0.5 min-w-0 text-start">
                            <strong className="text-foreground text-xs font-bold block truncate">
                              {row.journal_entry_id ? `سند شماره ${row.journal_entry_id.slice(0, 8)}` : "سند حسابداری"}
                            </strong>
                            {row.evidence.accounting?.description && (
                              <p className="text-[11px] text-muted-foreground truncate max-w-[220px]">
                                {row.evidence.accounting.description}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground font-mono">
                              <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-foreground border border-border/60">
                                {row.evidence.accounting?.date ? faDate(row.evidence.accounting.date) : "—"}
                              </span>
                              {row.evidence.accounting?.reference && (
                                <span className="truncate">مرجع: {row.evidence.accounting.reference}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="h-full min-h-[48px] rounded-lg border border-dashed border-rose-500/30 bg-rose-500/5 flex items-center justify-center p-2 text-rose-700 dark:text-rose-300">
                        <span className="text-[11px] font-semibold flex items-center gap-1.5">
                          <span className="size-1.5 rounded-full bg-rose-500" />
                          فاقد ثبت در دفاتر حسابداری
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


