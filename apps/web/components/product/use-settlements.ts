"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/product-api";
import type { SettlementDetail, SettlementInvoice, BankCandidate } from "@/lib/settlements";

export function useSettlements(companyId: string, role?: string) {
  const base = `/companies/${companyId}/settlements`;
  const [direction, setDirection] = useState<"sales" | "purchases">("sales");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [invoices, setInvoices] = useState<SettlementInvoice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<SettlementDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [bankSearch, setBankSearch] = useState("");
  const [bankOffset, setBankOffset] = useState(0);
  const [bank, setBank] = useState<BankCandidate | null>(null);
  const [amount, setAmount] = useState("");
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = useRef<{ signature: string; key: string } | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setListError("");
    const params = new URLSearchParams({ direction, search, offset: String(offset) });
    void api<{ items: SettlementInvoice[]; total: number }>(`${base}/invoices?${params}`).then((result) => {
      if (active) { setInvoices(result.items); setTotal(result.total); }
    }).catch((e: Error) => { if (active) setListError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [base, direction, search, offset, revision]);
  useEffect(() => {
    let active = true;
    if (!selected) return;
    setDetailLoading(true); setDetailError(""); setDetail(null); setBank(null);
    void api<SettlementDetail>(`${base}/invoices/${selected}?${new URLSearchParams({ search: bankSearch, offset: String(bankOffset) })}`).then((result) => {
      if (active) setDetail(result);
    }).catch((e: Error) => { if (active) setDetailError(e.message); }).finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [base, selected, bankSearch, bankOffset, revision]);
  function open(id: string | null) {
    if (busy) return;
    setSelected(id); setDetail(null); setBank(null); setBankSearch(""); setBankOffset(0); setComplete(false); setActionError(""); setNotice("");
  }
  function chooseBank(candidate: BankCandidate) {
    setBank(candidate); setActionError(""); setNotice("");
    const available = BigInt(candidate.available_amount_irr), remaining = BigInt(detail!.invoice.unallocated_amount_irr);
    setAmount(String(available < remaining ? available : remaining));
  }
  async function save() {
    if (!bank || !selected || busy) return;
    if (!/^\d+$/.test(amount) || BigInt(amount) <= BigInt(0)) { setActionError("مبلغ صحیح و مثبت وارد کنید."); return; }
    const payload = { invoice_source_row_id: selected, bank_transaction_id: bank.id, amount_irr: String(BigInt(amount)), confirm_history_complete: complete };
    const signature = JSON.stringify(payload);
    if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
    setBusy(true); setActionError(""); setNotice("");
    try {
      await api(`${base}/allocations`, { method: "POST", body: JSON.stringify({ ...payload, request_key: pending.current.key }) });
      pending.current = null; setBank(null); setComplete(false); setRevision((n) => n + 1); setNotice("تخصیص ثبت شد.");
    } catch (e) { setActionError(e instanceof Error ? e.message : "ثبت انجام نشد."); }
    finally { setBusy(false); }
  }
  async function confirmHistory() {
    if (!detail || !complete || busy) return;
    setBusy(true); setActionError(""); setNotice("");
    try {
      await api(`${base}/invoices/${detail.invoice.source_row_id}/confirm-receipt-history`, { method: "POST", body: JSON.stringify({ confirm_complete: true, expected_allocated_amount_irr: detail.invoice.allocated_amount_irr }) });
      setComplete(false); setRevision((n) => n + 1); setNotice("تاریخچه وصول تأیید شد.");
    } catch (e) { setActionError(e instanceof Error ? e.message : "تأیید انجام نشد."); }
    finally { setBusy(false); }
  }
  async function reverse(id: string) {
    if (busy) return;
    setBusy(true); setActionError(""); setNotice("");
    try { await api(`${base}/allocations/${id}/reverse`, { method: "POST" }); setComplete(false); setRevision((n) => n + 1); setNotice("تخصیص برگشت داده شد."); }
    catch (e) { setActionError(e instanceof Error ? e.message : "برگشت انجام نشد."); }
    finally { setBusy(false); }
  }
  return { direction, changeDirection: (v: "sales" | "purchases") => { setDirection(v); setOffset(0); open(null); }, search,
    changeSearch: (v: string) => { setSearch(v); setOffset(0); }, offset, setOffset, invoices, total, loading, listError,
    selected, open, detail, detailLoading, detailError, bankSearch, changeBankSearch: (v: string) => { setBankSearch(v); setBankOffset(0); },
    bankOffset, setBankOffset, bank, chooseBank, amount, setAmount: (value: string) => setAmount(value.replace(/[۰-۹٠-٩]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩".indexOf(digit) % 10)).replace(/[,٬،\s]/g, "")), complete, setComplete, busy, actionError, notice, save, reverse, confirmHistory,
    retry: () => setRevision((n) => n + 1), writable: !!role && ["owner", "finance_manager", "advisor"].includes(role),
  };
}
