"use client";
import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "./workspace";
import { useResource } from "./use-resource";
import type { BankMovement, InvoiceDetail, ResourceList } from "@/lib/api";
import { listItems } from "@/lib/api";
import { amount } from "@/lib/utils";
function useDebouncedQuery(value: string) {
  const [query, setQuery] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(value.trim()), 200);
    return () => clearTimeout(timer);
  }, [value]);
  return query;
}
export function useAllocationChoices() {
  const workspace = useWorkspace();
  const [bankQuery, setBankQuery] = useState("");
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [bankLabel, setBankLabel] = useState("");
  const [invoiceLabel, setInvoiceLabel] = useState("");
  const bankTerm = useDebouncedQuery(bankQuery),
    invoiceTerm = useDebouncedQuery(invoiceQuery);
  const banks = useResource<ResourceList<BankMovement>>(
    workspace.companyPath(
      `bank-movements?limit=50&q=${encodeURIComponent(bankTerm)}`,
    ),
  );
  const invoices = useResource<ResourceList<InvoiceDetail>>(
    workspace.companyPath(
      `invoices?limit=50&q=${encodeURIComponent(invoiceTerm)}`,
    ),
  );
  const bankOptions = useMemo(
    () =>
      listItems(banks.data)
        .filter((bank) => !["opening", "anchor"].includes(bank.kind))
        .map((bank) => ({
          value: bank.id,
          label: `${bank.reference || bank.account} · ${amount(bank.amount)} ریال`,
        })),
    [banks.data],
  );
  const invoiceOptions = useMemo(
    () =>
      listItems(invoices.data).map((invoice) => ({
        value: invoice.id,
        label: `${invoice.reference} · ${invoice.party_id}`,
      })),
    [invoices.data],
  );
  return {
    banks,
    invoices,
    bankQuery,
    setBankQuery,
    invoiceQuery,
    setInvoiceQuery,
    bankLabel,
    setBankLabel,
    invoiceLabel,
    setInvoiceLabel,
    bankOptions,
    invoiceOptions,
    bankLoading: banks.loading || bankQuery.trim() !== bankTerm,
    invoiceLoading: invoices.loading || invoiceQuery.trim() !== invoiceTerm,
  };
}
