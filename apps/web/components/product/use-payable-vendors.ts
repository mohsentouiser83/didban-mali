"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/product-api";
import { rial } from "@/lib/cashflow-amounts";
import type { VendorsPayablesResponse } from "@/lib/product-types";
const normalize = (text: string) => text.replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\u200c/g, " ").trim().toLocaleLowerCase();
export function usePayableVendors(companyId: string, asOfDate: string) {
  const [data, setData] = useState<VendorsPayablesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setFailed(false); setData(null); setSelectedId(null);
    const base = `/companies/${companyId}/payables`;
    void api<VendorsPayablesResponse>(`${base}/vendors?as_of_date=${asOfDate}`)
      .then((vendors) => { if (active) setData(vendors); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId, asOfDate, retry]);
  const vendors = (data?.items ?? []).filter((customer) => rial(customer.total_payable_irr) > BigInt(0))
    .filter((customer) => normalize(customer.name).includes(normalize(search)) && (!overdueOnly || rial(customer.overdue_amount_irr) > BigInt(0)))
    .sort((a, b) => {
      const difference = rial(b.overdue_amount_irr) - rial(a.overdue_amount_irr);
      return difference > BigInt(0) ? 1 : difference < BigInt(0) ? -1 : a.name.localeCompare(b.name, "fa");
    });
  const selected = data?.items.find((customer) => customer.counterparty_id === selectedId);
  return { loading, failed, search, setSearch, overdueOnly, setOverdueOnly, selected, setSelectedId, vendors, refresh: () => setRetry((value) => value + 1) };
}
