"use client";
import { useState } from "react";
import { api } from "@/lib/product-api";
export function useFinancialValidation(companyId: string, onValidated: () => void, request: typeof api = api) {
  const [cash, setCash] = useState("15000000000");
  const [receivables, setReceivables] = useState("32000000000");
  const [payables, setPayables] = useState("18000000000");
  const [reconciliationDiff, setReconciliationDiff] = useState("0");
  const [confirmed, setConfirmed] = useState(false);
  const [statement, setStatement] = useState(
    "تمامی ارقام نقدینگی، مطالبات و بدهی‌ها با تراز آزمایشی و دفاتر رسمی شرکت تطبیق داده شد و مورد تأیید است.",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmed) {
      setError("تأیید انطباق ارقام با دفاتر مالی الزامی است.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      await request(`/companies/${companyId}/onboarding/validate`, {
        method: "POST",
        body: JSON.stringify({
          cash_position_irr: cash,
          receivables_irr: receivables,
          payables_irr: payables,
          reconciliation_difference_irr: reconciliationDiff,
          opening_balance_confirmed: true,
          user_statement: statement,
        }),
      });
      onValidated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ثبت اعتبارسنجی با خطا مواجه شد.");
    } finally {
      setSubmitting(false);
    }
  };

 return { cash, setCash, receivables, setReceivables, payables, setPayables, reconciliationDiff, setReconciliationDiff, confirmed, setConfirmed, statement, setStatement, submitting, error, handleSubmit };
}
