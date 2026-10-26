"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/product-api";

export type LedgerAccountLink = { account_id: string; code: string; name: string; bank_account_id: string | null };
type BankAccount = { id: string; label: string; account_last4: string | null };
const pageSize = 25;

export function useBankLedgerLinks(companyId: string) {
  const [accounts, setAccounts] = useState<LedgerAccountLink[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<LedgerAccountLink | null>(null);
  const [bankId, setBankId] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(0); }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    const params = new URLSearchParams({ query, limit: String(pageSize + 1), offset: String(page * pageSize) });
    Promise.all([
      api<LedgerAccountLink[]>(`/companies/${companyId}/bank-account-links?${params}`),
      api<BankAccount[]>(`/companies/${companyId}/imports/bank-accounts`),
    ]).then(([rows, bankRows]) => {
      if (!active) return;
      setAccounts(rows.slice(0, pageSize)); setHasMore(rows.length > pageSize); setBanks(bankRows);
    }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "حساب‌ها دریافت نشدند."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId, page, query, revision]);
  const edit = useCallback((account: LedgerAccountLink) => {
    setSelected(account); setBankId(account.bank_account_id ?? ""); setFormError(""); setMessage("");
  }, []);
  async function save() {
    if (!selected || busy) return;
    setBusy(true); setFormError("");
    try {
      await api(`/companies/${companyId}/bank-account-links/${selected.account_id}`, {
        method: "PUT", body: JSON.stringify({ bank_account_id: bankId || null }),
      });
      setSelected(null); setMessage("ارتباط حساب ذخیره و تطبیق دوباره انجام شد."); setRevision((value) => value + 1);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "ارتباط حساب ذخیره نشد.");
    } finally { setBusy(false); }
  }
  return { accounts, banks, search, setSearch, query, page, setPage, hasMore, loading, error,
    retry: () => setRevision((value) => value + 1), selected, edit,
    close: () => { if (!busy) setSelected(null); }, bankId, setBankId, busy, formError, message, save };
}
