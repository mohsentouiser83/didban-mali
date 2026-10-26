"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/product-api";
import { completedInvoices, type ComparisonHistory, type ComparisonItem, type ComparisonReport, type ComparisonSelection, type ComparisonStatus } from "@/lib/moadian";
import { CheckCircle, AlertTriangle, FileText, ClipboardCheck } from "@/components/ui/icons";
import type { ImportBatch } from "@/lib/product-types";

const initialSelection: ComparisonSelection = { direction: "sales", internal: [], portal: [], start: "", end: "", internalComplete: false, portalComplete: false };
function liveParams(applied: ComparisonSelection, status: string, offset: number, limit: number) {
  const params = new URLSearchParams({ direction: applied.direction, start_date: applied.start, end_date: applied.end, offset: String(offset), limit: String(limit),
    internal_complete: String(applied.internalComplete), portal_complete: String(applied.portalComplete) });
  applied.internal.forEach((id) => params.append("internal_batch_ids", id));
  applied.portal.forEach((id) => params.append("portal_batch_ids", id));
  if (status !== "all") params.set("status", status);
  return params;
}
export function useMoadianComparison(companyId: string, role?: string, options: { request?: typeof api; initialRunId?: string } = {}) {
  const request = options.request ?? api;
  const writable = !!role && ["owner", "finance_manager", "advisor"].includes(role);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [history, setHistory] = useState<ComparisonHistory[]>([]);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [filesError, setFilesError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selection, setSelection] = useState(initialSelection);
  const [applied, setApplied] = useState<ComparisonSelection | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<ComparisonStatus | "all">("all");
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [report, setReport] = useState<ComparisonReport | null>(null);
  const [summary, setSummary] = useState<ComparisonReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const version = useRef(0);
  const requestKey = useRef<string | null>(null);
  const firstRead = useRef("");
  const requestedRun = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setLoadingFiles(true); setFilesError("");
    async function load() {
      try {
        const groups = await Promise.all(["sales", "purchases", "moadian_sales", "moadian_purchases", "accounting"].map(async (kind) => {
          const rows: ImportBatch[] = [];
          let page: ImportBatch[];
          do {
            page = await request<ImportBatch[]>(`/companies/${companyId}/imports?source_kind=${kind}&limit=200&offset=${rows.length}`);
            rows.push(...page);
          } while (active && page.length === 200);
          return rows;
        }));
        const result = groups.flat();
        if (!active) return;
        setBatches(result); setLoadingFiles(false);
        if (result.some((b) => ["queued", "processing", "inspecting"].includes(b.status))) timer = setTimeout(() => void load(), 4000);
      } catch { if (active) { setFilesError("فهرست فایل‌ها دریافت نشد."); setLoadingFiles(false); } }
    }
    void load();
    return () => { active = false; clearTimeout(timer); };
  }, [companyId, revision, request]);
  useEffect(() => {
    let active = true;
    setHistoryLoading(true);
    request<ComparisonHistory[]>(`/companies/${companyId}/moadian/comparisons?limit=25`)
      .then((rows) => { if (active) { setHistory(Array.isArray(rows) ? rows : []); setHistoryError(""); } })
      .catch(() => { if (active) setHistoryError("تطبیق‌های قبلی دریافت نشدند."); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [companyId, revision, historyRevision, request]);
  useEffect(() => {
    let active = true;
    if (!applied || generating || (writable && !runId)) return;
    const key = `${runId}:${status}:${offset}:${pageSize}:${retry}`;
    if (runId && key === firstRead.current) return;
    setLoading(true); setError("");
    const params = liveParams(applied, status, offset, pageSize);
    const path = runId ? `/comparisons/${runId}?${params}` : `/comparison?${params}`;
    request<ComparisonReport>(`/companies/${companyId}/moadian${path}`)
      .then((result) => { if (active) { firstRead.current = key; setReport(result); setSummary(result); } })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "تطبیق انجام نشد."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId, applied, status, offset, pageSize, retry, runId, writable, generating, request]);
  function changeSelection(patch: Partial<ComparisonSelection>) {
    version.current += 1; requestKey.current = null; requestedRun.current = null;
    setSelection((s) => ({ ...s, ...patch,
      ...(["internal", "portal", "start", "end"].some((key) => key in patch) ? { internalComplete: false, portalComplete: false } : {}),
      ...(patch.direction ? { internal: [], portal: [], internalComplete: false, portalComplete: false } : {}),
    }));
    setError("");
  }
  async function submit() {
    if (!selection.internal.length || !selection.portal.length || !selection.start || !selection.end) { setError("حداقل یک فایل از هر طرف و بازه تاریخ را انتخاب کنید."); return; }
    if (selection.start > selection.end) { setError("تاریخ شروع باید قبل از پایان باشد."); return; }
    setOffset(0); setStatus("all"); setApplied({ ...selection }); setReport(null); setSummary(null); setRunId(null); setError("");
    if (!writable) return;
    const current = ++version.current;
    requestKey.current ??= crypto.randomUUID();
    setGenerating(true); setLoading(true);
    try {
      const result = await request<ComparisonReport>(`/companies/${companyId}/moadian/comparisons`, {
        method: "POST", headers: { "Idempotency-Key": requestKey.current },
        body: JSON.stringify({ internal_batch_ids: selection.internal, portal_batch_ids: selection.portal, direction: selection.direction,
          start_date: selection.start, end_date: selection.end, internal_complete: selection.internalComplete, portal_complete: selection.portalComplete }),
      });
      if (current !== version.current) return;
      firstRead.current = `${result.run_id ?? null}:all:0:${result.limit}:${retry}`;
      setRunId(result.run_id ?? null); setReport(result); setSummary(result); setHistoryRevision((v) => v + 1);
    } catch (caught) { if (current === version.current) setError(caught instanceof Error ? caught.message : "تطبیق ذخیره نشد."); }
    finally { if (current === version.current) { setGenerating(false); setLoading(false); } }
  }
  const openRun = useCallback(async (id: string) => {
    requestedRun.current = id;
    const current = ++version.current;
    setLoading(true); setError(""); setOffset(0); setStatus("all");
    try {
      const result = await request<ComparisonReport>(`/companies/${companyId}/moadian/comparisons/${id}?limit=${pageSize}`);
      if (current !== version.current) return;
      const item = history.find((row) => row.id === id);
      const next: ComparisonSelection = { direction: result.direction ?? item?.direction ?? "sales", internal: result.internal_batch_ids ?? [result.internal_batch_id],
        portal: result.portal_batch_ids ?? [result.portal_batch_id], start: result.start_date, end: result.end_date,
        internalComplete: result.coverage?.internal.period_confirmed ?? false, portalComplete: result.coverage?.portal.period_confirmed ?? false };
      firstRead.current = `${id}:all:0:${pageSize}:${retry}`;
      setSelection(next); setApplied(next); setRunId(id); setReport(result); setSummary(result);
    } catch (caught) { if (current === version.current) setError(caught instanceof Error ? caught.message : "گزارش دریافت نشد."); }
    finally { if (current === version.current) setLoading(false); }
  }, [companyId, history, pageSize, retry, request]);
  const initialRunLoaded = useRef("");
  useEffect(() => {
    if (options.initialRunId && initialRunLoaded.current !== options.initialRunId) {
      initialRunLoaded.current = options.initialRunId;
      void openRun(options.initialRunId);
    }
  }, [options.initialRunId, openRun]);
  async function saveReview(item: ComparisonItem, note: string, decision: "open" | "resolved") {
    if (!runId || !item.key || reviewBusy || !writable) return null;
    setReviewBusy(true); setReviewError("");
    try {
      const updated = await request<ComparisonItem>(`/companies/${companyId}/moadian/comparisons/${runId}/results/${item.key}`, {
        method: "PUT", body: JSON.stringify({ decision, note: note.trim() }),
      });
      setReport((old) => old ? { ...old, items: old.items.map((row) => row.key === item.key ? updated : row) } : old);
      return updated;
    } catch (caught) { setReviewError(caught instanceof Error ? caught.message : "رسیدگی ذخیره نشد."); return null; }
    finally { setReviewBusy(false); }
  }
  const complete = completedInvoices(batches);
  const internalFiles = complete.filter((b) => {
    if (b.source_kind === (selection.direction === "sales" ? "sales" : "purchases")) return true;
    const capability = b.coverage?.invoice_comparison as { available?: boolean; directions?: string[] } | undefined;
    return b.source_kind === "accounting" && capability?.available && capability.directions?.includes(selection.direction);
  });
  const readiness = (["sales", "purchases"] as const).map((direction) => ({
    direction,
    internal: complete.filter((b) => b.source_kind === direction || b.source_kind === "accounting" &&
      !!(b.coverage?.invoice_comparison as { available?: boolean; directions?: string[] } | undefined)?.available &&
      (b.coverage?.invoice_comparison as { directions?: string[] } | undefined)?.directions?.includes(direction)).length,
    portal: complete.filter((b) => b.source_kind === `moadian_${direction}`).length,
  }));
  const portalFiles = complete.filter((b) => b.source_kind === `moadian_${selection.direction}`);
  const sourcesReady = selection.internal.length > 0 && selection.portal.length > 0 &&
    selection.internal.every((id) => internalFiles.some((b) => b.id === id)) && selection.portal.every((id) => portalFiles.some((b) => b.id === id));
  const selectedInternal = internalFiles.filter((b) => selection.internal.includes(b.id));
  const selectedPortal = portalFiles.filter((b) => selection.portal.includes(b.id));
  const cards = [
    { title: "تطبیق با شماره مالیاتی", value: String(summary?.counts.matched ?? 0), currency: "فاکتور", icon: CheckCircle },
    { title: "اختلاف اطلاعات", value: String(summary?.counts.difference ?? 0), currency: "فاکتور", icon: AlertTriangle },
    { title: "فقط در یکی از منابع", value: String((summary?.counts.internal_only ?? 0) + (summary?.counts.portal_only ?? 0)), currency: "فاکتور", icon: FileText },
    { title: "پیشنهادی / نیازمند بررسی", value: String((summary?.counts.suggested ?? 0) + (summary?.counts.review ?? 0)), currency: "مورد", icon: ClipboardCheck },
  ];
  return { cards, writable, batches, history, historyLoading, historyError, readiness, canStart: readiness.some((item) => item.internal > 0 && item.portal > 0), hasInternal: readiness.some((item) => item.internal > 0), refreshHistory: () => setHistoryRevision((v) => v + 1), openRun, internalFiles, portalFiles, selection, changeSelection, submit, report, summary, applied, sourcesReady,
    canSubmit: sourcesReady && !!selection.start && !!selection.end && selection.start <= selection.end,
    selectedInternal, selectedPortal, reportInternal: complete.filter((b) => applied?.internal.includes(b.id)), reportPortal: complete.filter((b) => applied?.portal.includes(b.id)), restoreDraft: () => setSelection(applied ? { ...applied } : initialSelection), loading, error, loadingFiles, filesError, saveReview, reviewBusy, reviewError,
    clearReviewError: () => setReviewError(""), status, setStatus: (s: ComparisonStatus | "all") => { setStatus(s); setOffset(0); },
    offset, setOffset, pageSize, changePageSize: (size: number) => { setPageSize(size); setOffset(0); },
    refreshFiles: () => setRevision((r) => r + 1),
    retry: () => requestedRun.current && !runId ? void openRun(requestedRun.current) : runId || !writable ? setRetry((r) => r + 1) : void submit(),
    startNew: () => changeSelection({ ...initialSelection, direction: readiness.find((item) => item.internal > 0 && item.portal > 0)?.direction ?? "sales" }),
    reset: () => { changeSelection(initialSelection); },
  };
}
