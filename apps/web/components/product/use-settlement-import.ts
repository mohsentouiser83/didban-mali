"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/product-api";
import type { ImportBatch } from "@/lib/product-types";

export function useSettlementImport(companyId: string, batch: ImportBatch, onUpdated: () => void) {
  const pending = ["queued", "processing"].includes(batch.status);
  const [busy, setBusy] = useState(pending);
  const [watching, setWatching] = useState(pending);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const updated = useRef(onUpdated);
  useEffect(() => { updated.current = onUpdated; }, [onUpdated]);
  useEffect(() => {
    if (!watching) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await api<ImportBatch>(`/companies/${companyId}/imports/${batch.id}`);
        if (!active) return;
        if (["queued", "processing"].includes(result.status)) timer = setTimeout(() => void poll(), 2500);
        else { setBusy(false); setWatching(false); updated.current(); }
      } catch (e) { if (active) { setError(e instanceof Error ? e.message : "وضعیت بررسی دریافت نشد."); setBusy(false); setWatching(false); } }
    }
    timer = setTimeout(() => void poll(), 1000);
    return () => { active = false; clearTimeout(timer); };
  }, [companyId, batch.id, watching, revision]);
  async function retry() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await api(`/companies/${companyId}/settlements/imports/${batch.id}/retry`, { method: "POST" });
      setWatching(true); setRevision((n) => n + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "بررسی انجام نشد."); setBusy(false); }
  }
  const coverage = batch.coverage as { settlement_results?: Record<string, number> } | undefined;
  return { busy, error, retry, counts: coverage?.settlement_results };
}
