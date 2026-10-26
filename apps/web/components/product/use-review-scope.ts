"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/product-api";
import type { BankAccount } from "@/lib/product-types";
import type { ReviewScope } from "@/lib/review-scope";

const emptyScope: ReviewScope = { bank_account_id: "", period_start: "", period_end: "", accounting_complete: false, bank_complete: false };
export function useReviewScope(companyId: string, onApply: (scope: ReviewScope) => void) {
  const [open, setOpen] = useState(false);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [scope, setScope] = useState(emptyScope);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [accountError, setAccountError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true); setError("");
    api<BankAccount[]>(`/companies/${companyId}/imports/bank-accounts`)
      .then((rows) => { if (active) setBanks(rows); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "حساب‌ها دریافت نشدند."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId, open, retry]);
  function update(patch: Partial<ReviewScope>) {
    if (patch.bank_account_id) setAccountError("");
    setScope((current) => ({ ...current, ...patch,
      ...("bank_account_id" in patch || "period_start" in patch || "period_end" in patch
        ? { accounting_complete: false, bank_complete: false } : {}) }));
  }
  function apply() {
    if (!scope.bank_account_id) { setAccountError("حساب بانکی را انتخاب کنید."); return false; }
    if (!scope.period_start || !scope.period_end || scope.period_start > scope.period_end) return false;
    setOpen(false); onApply(scope); return true;
  }
  return { open, setOpen, banks, scope, update, loading, error, accountError, retry: () => setRetry((value) => value + 1), apply };
}
