"use client";
import { useRef, useState } from "react";
import { api } from "@/lib/product-api";
import type { InvoiceHistory } from "@/lib/financial-periods";
import { rial, toman } from "@/lib/cashflow-amounts";
type DraftReceipt = { received_on: string; amount: string; reference: string };
const digits = (text: string) => text.replace(/[۰-۹٠-٩]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".includes(digit) ? "۰۱۲۳۴۵۶۷۸۹".indexOf(digit) : "٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[,٬\s]/g, "").replace(/٫/g, ".");
const receiptRial = (text: string): bigint | null => {
  const match = /^(\d+)(?:\.(\d))?$/.exec(digits(text));
  return match ? BigInt(match[1]) * BigInt(10) + BigInt(match[2] ?? "0") : null;
};

export function useReceiptHistory(companyId: string, onChanged: () => void, canWrite: boolean, request: typeof api = api) {
  const pending = useRef(false);
  const [open, setOpen] = useState(false);
  const [histories, setHistories] = useState<InvoiceHistory[]>([]);
  const [selected, setSelected] = useState<InvoiceHistory | null>(null);
  const [draft, setDraft] = useState<DraftReceipt[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  async function load() {
    setBusy(true); setError("");
    try { setHistories(await request<InvoiceHistory[]>(`/companies/${companyId}/receivables/receipt-history`)); }
    catch (err) { setError(err instanceof Error ? err.message : "تاریخچه دریافت نشد."); }
    finally { setBusy(false); }
  }
  function choose(history: InvoiceHistory) {
    setSelected(history); setConfirmed(false); setError("");
    setDraft(history.receipts.map((receipt) => ({ received_on: receipt.received_on, amount: toman(receipt.amount_irr), reference: receipt.reference ?? "" })));
  }
  const total = draft.reduce((sum, row) => sum + (receiptRial(row.amount) ?? BigInt(0)), BigInt(0));
  const valid = !!selected && total <= rial(selected.gross_amount_irr) && draft.every((row) => row.received_on >= selected.issue_date && row.received_on <= today && (receiptRial(row.amount) ?? BigInt(0)) > BigInt(0));
  async function save() {
    if (!canWrite || !selected || !confirmed || !valid || busy || pending.current) return;
    pending.current = true;
    setBusy(true); setError("");
    try {
      await request(`/companies/${companyId}/receivables/invoices/${selected.invoice_id}/receipt-history`, { method: "PUT", body: JSON.stringify({
        confirm_complete: true, expected_version: selected.version,
        receipts: draft.map((row) => ({ received_on: row.received_on, amount_irr: receiptRial(row.amount)!.toString(), reference: row.reference.trim() || null })),
      }) });
      setSelected(null); onChanged(); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "ذخیره تاریخچه انجام نشد."); }
    finally { pending.current = false; setBusy(false); }
  }
  const filtered = histories.filter((history) => `${history.customer_name} ${history.invoice_no}`.includes(search));
  return { open, setOpen, selected, setSelected, draft, setDraft, confirmed, setConfirmed, search, setSearch, busy, error, today, load, choose, total, valid, save, filtered };
}
