"use client";
import { useRef, useState } from "react";
import { api } from "@/lib/product-api";
import { currentRange, validRange, type FinancialPeriod } from "@/lib/financial-periods";
import { useFinancialPeriods } from "./use-financial-periods";

type Draft = { name: string; start_date: string; end_date: string };
export function usePeriodManagement(companyId: string, canWrite: boolean) {
  const data = useFinancialPeriods(companyId);
  const [editing, setEditing] = useState<FinancialPeriod | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: "", ...currentRange() });
  const [deleting, setDeleting] = useState<FinancialPeriod | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const base = `/companies/${companyId}/financial-periods`;
  function edit(period: FinancialPeriod | "new") {
    setError(""); setEditing(period);
    setDraft(period === "new" ? { name: "", ...currentRange() } : { name: period.name, start_date: period.start_date, end_date: period.end_date });
  }
  async function save() {
    if (!canWrite || pending.current || !editing || !draft.name.trim() || !validRange(draft)) return;
    pending.current = true; setBusy(true); setError("");
    try {
      await api(editing === "new" ? base : `${base}/${editing.id}`, { method: editing === "new" ? "POST" : "PUT", body: JSON.stringify(draft) });
      setEditing(null); data.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "ذخیره انجام نشد."); }
    finally { pending.current = false; setBusy(false); }
  }
  async function remove() {
    if (!canWrite || pending.current || !deleting) return;
    pending.current = true; setBusy(true); setError("");
    try { await api(`${base}/${deleting.id}`, { method: "DELETE" }); setDeleting(null); data.refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "حذف انجام نشد."); }
    finally { pending.current = false; setBusy(false); }
  }
  return { ...data, refresh: () => { setError(""); data.refresh(); }, error: error || data.error, editing, draft, setDraft, busy, deleting, search, setSearch,
    items: data.periods.filter((period) => period.name.includes(search.trim())),
    valid: !!draft.name.trim() && validRange(draft), edit, save, remove,
    close: () => { if (!pending.current) { setEditing(null); setError(""); } },
    requestDelete: (period: FinancialPeriod) => { setError(""); setDeleting(period); },
    cancelDelete: () => { if (!pending.current) setDeleting(null); },
  };
}
