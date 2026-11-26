"use client";

import { useState } from "react";
import { exactAmount, exactText } from "@/lib/accounting";
import { tehranToday, type NativeInvoiceReport } from "@/lib/native-invoices";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";

interface LedgerSummary {
  totals: {
    debit_total: string;
    credit_total: string;
    net_balance: string;
    direction: "debtor" | "creditor" | "settled";
    entry_count: number;
  };
}

function summarizeInvoices(invoices: NativeInvoiceReport["items"], direction: "sale" | "purchase") {
  const matching = invoices.filter((invoice) => invoice.direction === direction);
  let total = 0n;
  let unknownCount = 0;
  for (const invoice of matching) {
    const value = exactAmount(invoice.remaining ?? "");
    if (value === null) unknownCount += 1;
    else total += value;
  }
  return {
    count: matching.length,
    remaining: matching.length && unknownCount === 0 ? exactText(total) : null,
    unknownCount,
  };
}

export function useCounterpartyFinancialSummary(partyId: string, mayRead: boolean) {
  const workspace = useWorkspace();
  const [asOfDate, setAsOfDate] = useState(tehranToday);
  const scope = mayRead && asOfDate ? encodeURIComponent(partyId) : null;
  const cutoff = encodeURIComponent(asOfDate);
  const ledger = useResource<LedgerSummary>(scope
    ? workspace.companyPath(`counterparties/${scope}/statement-ledger?basis=native&as_of_date=${cutoff}`)
    : null);
  const invoices = useResource<NativeInvoiceReport>(scope
    ? workspace.companyPath(`accounting/native-invoices?counterparty_id=${scope}&as_of=${cutoff}`)
    : null);
  const items = invoices.data?.items ?? [];
  return {
    unit: workspace.unit,
    asOfDate,
    setAsOfDate,
    ledger,
    invoices,
    sale: summarizeInvoices(items, "sale"),
    purchase: summarizeInvoices(items, "purchase"),
  };
}
