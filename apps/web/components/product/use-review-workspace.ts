"use client";
import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/product-api";
import type { ReviewScope } from "@/lib/review-scope";
import type { FindingDetectionRun } from "@/lib/product-types";
import { toPersianDigits } from "@/components/ui/financial/money-display";
import { ClipboardCheck, FileText, Search, CheckCircle } from "@/components/ui/icons";
import type { ReviewItem, ReviewDirection, ReviewDirectionCounts } from "@/lib/review";

type ReviewSummary = { latest_reconciliation?: { limitations?: string[] }; reconciliation_counts: ReviewDirectionCounts; total_count: number; review_count: number; follow_up_count: number; resolved_count: number; verified_count: number };
type ReviewList = { items: ReviewItem[]; total_count: number; direction_counts: ReviewDirectionCounts };

export function useReviewWorkspace(companyId: string) {
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [summaryRetry, setSummaryRetry] = useState(0);
  const [list, setList] = useState<ReviewList | null>(null);
  const [loading, setLoading] = useState(true);
  const [listFailed, setListFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [direction, setDirection] = useState<ReviewDirection>("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [retry, setRetry] = useState(0);
  const appliedScope = useRef<ReviewScope | null>(null);
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState("");
  const [runFailed, setRunFailed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(0); }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let active = true;
    setLoading(true); setListFailed(false);
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) });
    if (query) params.set("search", query);
    if (direction !== "all") params.set("reconciliation_filter", direction);
    if (status !== "all") params.set("status", status);
    api<ReviewList>(`/companies/${companyId}/findings?${params}`).then((result) => { if (active) { setList(result); if (page > 0 && page * pageSize >= result.total_count) setPage(Math.max(0, Math.ceil(result.total_count / pageSize) - 1)); } }).catch(() => { if (active) setListFailed(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId, query, status, direction, page, pageSize, retry]);
  useEffect(() => {
    let active = true;
    setSummaryLoading(true); setSummaryFailed(false);
    api<ReviewSummary>(`/companies/${companyId}/control/overview`)
      .then((result) => { if (active) setSummary(result); })
      .catch(() => { if (active) setSummaryFailed(true); })
      .finally(() => { if (active) setSummaryLoading(false); });
    return () => { active = false; };
  }, [companyId, summaryRetry]);
  const counts = summary?.reconciliation_counts;
  const cards = [
    { title: "کل ردیف‌های بررسی", value: counts ? String(counts.all) : null, currency: "ردیف", icon: FileText },
    { title: "دارای پیشنهاد تطبیق", value: counts ? String(counts.suggested) : null, currency: "ردیف", icon: ClipboardCheck },
    { title: "بدون پیشنهاد تطبیق", value: counts ? String(counts.missing_accounting + counts.missing_bank) : null, currency: "ردیف", icon: Search },
    { title: "تطبیق تأییدشده", value: counts ? String(counts.matched) : null, currency: "ردیف", icon: CheckCircle },
  ];
  async function detect(scope?: ReviewScope) {
    if (scope) appliedScope.current = scope;
    setRunning(true); setRunMessage(""); setRunFailed(false);
    try {
      const result = await api<FindingDetectionRun>(`/companies/${companyId}/findings/detect`, { method: "POST", body: JSON.stringify({ trigger_type: "manual", ...(appliedScope.current ?? {}) }) });
      if (result.status === "failed") throw Error("Detection failed");
      setRunMessage(`بررسی انجام شد؛ ${toPersianDigits(result.findings_detected)} مورد ارزیابی شد.`); setPage(0); setRetry((value) => value + 1); setSummaryRetry((value) => value + 1);
    } catch { setRunFailed(true); setRunMessage("بررسی انجام نشد. دوباره تلاش کنید."); }
    finally { setRunning(false); }
  }
  return { refresh: () => { setRetry(value => value + 1); setSummaryRetry(value => value + 1); }, summary, summaryLoading, summaryFailed, setSummaryRetry, list, loading, listFailed, direction, changeDirection: (value: ReviewDirection) => { setDirection(value); setPage(0); }, search, setSearch, query, status, setStatus, page, setPage, pageSize, setPageSize, setRetry, running, runMessage, runFailed, cards, detect };
}

