"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/product-api";
import { completedInvoices, type ComparisonReport, type ComparisonSelection, type ComparisonStatus } from "@/lib/moadian";
import { CheckCircle, AlertTriangle, FileText, ClipboardCheck } from "@/components/ui/icons";
import type { ImportBatch } from "@/lib/product-types";

const initialSelection: ComparisonSelection = { direction: "sales", internal: "", portal: "", start: "", end: "" };
export function useMoadianComparison(companyId: string, role?: string) {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [filesError, setFilesError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selection, setSelection] = useState(initialSelection);
  const [applied, setApplied] = useState<ComparisonSelection | null>(null);
  const [status, setStatus] = useState<ComparisonStatus | "all">("all");
  const [offset, setOffset] = useState(0);
  const [report, setReport] = useState<ComparisonReport | null>(null);
  const [summary, setSummary] = useState<ComparisonReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setLoadingFiles(true); setFilesError("");
    async function load() {
      try {
        const result: ImportBatch[] = [];
        for (const kind of ["sales", "purchases", "moadian_sales", "moadian_purchases"]) {
          let page: ImportBatch[];
          do {
            page = await api<ImportBatch[]>(`/companies/${companyId}/imports?source_kind=${kind}&limit=200&offset=${result.filter((b) => b.source_kind === kind).length}`);
            result.push(...page);
          } while (active && page.length === 200);
        }
        if (!active) return;
        setBatches(result); setLoadingFiles(false);
        if (result.some((b) => ["queued", "processing", "inspecting"].includes(b.status))) timer = setTimeout(() => void load(), 4000);
      } catch { if (active) { setFilesError("فهرست فایل‌ها دریافت نشد."); setLoadingFiles(false); } }
    }
    void load();
    return () => { active = false; clearTimeout(timer); };
  }, [companyId, revision]);
  useEffect(() => {
    let active = true;
    if (!applied) return;
    setLoading(true); setError(""); setReport(null);
    const params = new URLSearchParams({ direction: applied.direction, internal_batch_id: applied.internal, portal_batch_id: applied.portal, start_date: applied.start, end_date: applied.end, offset: String(offset), limit: "25" });
    if (status !== "all") params.set("status", status);
    void api<ComparisonReport>(`/companies/${companyId}/moadian/comparison?${params}`)
      .then((result) => { if (active) { setReport(result); setSummary(result); } })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "تطبیق انجام نشد."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId, applied, status, offset, retry]);
  function changeSelection(patch: Partial<ComparisonSelection>) {
    setSelection((s) => ({ ...s, ...patch, ...(patch.direction ? { internal: "", portal: "" } : {}) }));
    setApplied(null); setReport(null); setSummary(null); setLoading(false); setError(""); setOffset(0); setStatus("all");
  }
  function submit() {
    if (!selection.internal || !selection.portal || !selection.start || !selection.end) { setError("دو فایل و بازه تاریخ را انتخاب کنید."); return; }
    if (selection.start > selection.end) { setError("تاریخ شروع باید قبل از پایان باشد."); return; }
    setOffset(0); setApplied({ ...selection });
  }
  const complete = completedInvoices(batches);
  const internalFiles = complete.filter((b) => b.source_kind === (selection.direction === "sales" ? "sales" : "purchases"));
  const portalFiles = complete.filter((b) => b.source_kind === `moadian_${selection.direction}`);
  const sourcesReady = internalFiles.some((b) => b.id === selection.internal) && portalFiles.some((b) => b.id === selection.portal);
  const canSubmit = sourcesReady && !!selection.start && !!selection.end && selection.start <= selection.end;
  const selectedInternal = internalFiles.find((b) => b.id === selection.internal);
  const selectedPortal = portalFiles.find((b) => b.id === selection.portal);
  const cards = [
    { title: "تطبیق با شماره مالیاتی", value: String(summary?.counts.matched ?? 0), currency: "فاکتور", icon: CheckCircle },
    { title: "اختلاف اطلاعات", value: String(summary?.counts.difference ?? 0), currency: "فاکتور", icon: AlertTriangle },
    { title: "فقط در یکی از فایل‌ها", value: String((summary?.counts.internal_only ?? 0) + (summary?.counts.portal_only ?? 0)), currency: "فاکتور", icon: FileText },
    { title: "پیشنهادی / نیازمند بررسی", value: String((summary?.counts.suggested ?? 0) + (summary?.counts.review ?? 0)), currency: "مورد", icon: ClipboardCheck },
  ];
  const writable = !!role && ["owner", "finance_manager", "advisor"].includes(role);
  return { cards, writable, batches, internalFiles, portalFiles, selection, changeSelection, submit, report, summary, applied, sourcesReady, canSubmit, selectedInternal, selectedPortal, loading, error, loadingFiles, filesError,
    status, setStatus: (s: ComparisonStatus | "all") => { setStatus(s); setOffset(0); }, offset, setOffset,
    refreshFiles: () => setRevision((r) => r + 1), retry: () => setRetry((r) => r + 1),
    reset: () => { changeSelection(initialSelection); },
  };
}
