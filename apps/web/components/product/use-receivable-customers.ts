"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/product-api";
import { rial } from "@/lib/cashflow-amounts";
import type { PeriodReport } from "@/lib/financial-periods";
import type { CustomersReceivablesResponse, InvoicesReceivablesResponse } from "@/lib/product-types";
const normalize = (text: string) => text.replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\u200c/g, " ").trim().toLocaleLowerCase();
export function useReceivableCustomers(companyId: string, asOfDate: string, periodReport?: PeriodReport["receivables"]) {
  const [data, setData] = useState<{ customers: CustomersReceivablesResponse; invoices: InvoicesReceivablesResponse } | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (periodReport) {
      setData({ customers: { as_of_date: asOfDate, items: periodReport.customers }, invoices: { as_of_date: asOfDate, items: periodReport.invoices } });
      setLoading(false); setFailed(false); setSelectedId(null);
      return;
    }
    setLoading(true); setFailed(false); setData(null); setSelectedId(null);
    const base = `/companies/${companyId}/receivables`;
    void Promise.all([
      api<CustomersReceivablesResponse>(`${base}/customers?as_of_date=${asOfDate}`),
      api<InvoicesReceivablesResponse>(`${base}/invoices?as_of_date=${asOfDate}`),
    ]).then(([customers, invoices]) => { if (active) setData({ customers, invoices }); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId, asOfDate, retry, periodReport]);
  const invoices = data?.invoices.items.filter((invoice) => rial(invoice.remaining_amount_irr) > BigInt(0)) ?? [];
  const maxDelays = new Map<string, number>();
  for (const invoice of invoices) {
    maxDelays.set(invoice.counterparty_id, Math.max(maxDelays.get(invoice.counterparty_id) ?? 0, invoice.delay_days));
  }
  const customers = (data?.customers.items ?? []).filter((customer) => rial(customer.total_outstanding_irr) > BigInt(0))
    .filter((customer) => normalize(customer.name).includes(normalize(search)) && (!overdueOnly || rial(customer.overdue_amount_irr) > BigInt(0)))
    .sort((a, b) => {
      const difference = rial(b.overdue_amount_irr) - rial(a.overdue_amount_irr);
      return difference > BigInt(0) ? 1 : difference < BigInt(0) ? -1 : a.name.localeCompare(b.name, "fa");
    });
  const selected = data?.customers.items.find((customer) => customer.counterparty_id === selectedId);
  const selectedInvoices = invoices.filter((invoice) => invoice.counterparty_id === selectedId)
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  return { loading, failed, search, setSearch, overdueOnly, setOverdueOnly, selected, setSelectedId, customers, maxDelays, selectedInvoices, retry: () => setRetry((value) => value + 1) };
}
