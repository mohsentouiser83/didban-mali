"use client";

import { useState } from "react";
import { statusLabel } from "@/components/ui/badge";
import type { InvoiceDetail } from "@/lib/api";
import type { CommercialDocument } from "@/lib/commercial-documents";
import { invoiceFinancialState } from "@/lib/financial-presentation";
import { moduleAllows } from "@/lib/module-access";
import { displayDate } from "@/lib/utils";
import { compareInvoiceAmounts, expectedDateLabel, nativeInvoiceReason, type NativeInvoice } from "@/lib/native-invoices";
import { useFinancialView } from "./use-financial-view";
import { docStatusLabel, useCommercialDocuments } from "./use-commercial-documents";
import { useNativeInvoices } from "./use-native-invoices";

type InvoiceSource =
  | { kind: "native"; invoice: NativeInvoice }
  | { kind: "commercial"; invoice: CommercialDocument; native?: NativeInvoice }
  | { kind: "imported"; invoice: InvoiceDetail };

export interface InvoiceListRow {
  id: string;
  reference: string;
  origin: string;
  party: string;
  partyIds: (string | null | undefined)[];
  date: string;
  due: string | null | undefined;
  expected: string;
  amount: string;
  balance: string | null;
  status: string;
  reason?: string | null;
  source: InvoiceSource;
}

function expectedDate(invoice: NativeInvoice) {
  return invoice.terms?.expected_date
    ? displayDate(invoice.terms.expected_date)
    : expectedDateLabel(invoice.terms, invoice.direction);
}

export function useInvoiceList(direction: "sales" | "purchases", operationId?: string) {
  const kind = direction === "sales" ? "sale" : "purchase";
  const native = useNativeInvoices(kind, false, operationId);
  const commercial = useCommercialDocuments({ direction: kind, allDocuments: true });
  const imported = useFinancialView("invoices", moduleAllows(native.workspace.company, "reports", "view"));
  const [selected, setSelected] = useState<InvoiceDetail | null>(null);
  const nativeItems = native.report.data?.items ?? [];
  const documents = commercial.docRows;
  const nativeById = new Map(nativeItems.map((item) => [item.id, item]));
  const nativeByCommercialId = new Map(nativeItems.map((item) => [item.commercial_document_id, item]));
  const coveredNative = new Set<string>();
  const rows = documents.map((invoice): InvoiceListRow => {
    const linked = nativeById.get(invoice.native_invoice_id ?? "") ?? nativeByCommercialId.get(invoice.id);
    if (linked) coveredNative.add(linked.id);
    return {
      id: `commercial:${invoice.id}`, reference: invoice.number, origin: "چندردیفی",
      party: invoice.party_name || invoice.party_snapshot?.name || commercial.cpNames[invoice.counterparty_id] || invoice.counterparty_id,
      partyIds: [invoice.counterparty_id, linked?.party_id],
      date: invoice.issue_date, due: invoice.due_date,
      expected: linked ? expectedDate(linked) : "—",
      amount: invoice.net_amount_irr, balance: invoice.open_balance_irr,
      status: docStatusLabel[invoice.status], source: { kind: "commercial", invoice, native: linked },
    };
  });
  for (const invoice of nativeItems) {
    if (coveredNative.has(invoice.id)) continue;
    rows.push({
      id: `native:${invoice.id}`, reference: invoice.reference, origin: "دفتر بومی",
      party: invoice.party_name ? `${invoice.party_name} (${invoice.party_id})` : invoice.party_id,
      partyIds: [invoice.party_id, invoice.party_record_id],
      date: invoice.date, due: invoice.terms?.due_date,
      expected: expectedDate(invoice),
      amount: invoice.amount, balance: invoice.remaining,
      status: invoice.status !== "available" || invoice.remaining == null ? "نامشخص" :
        compareInvoiceAmounts(invoice.remaining, "0") === 0 ? "تسویه‌شده" : "دارای مانده",
      reason: invoice.reason && nativeInvoiceReason(invoice.reason),
      source: { kind: "native", invoice },
    });
  }
  for (const invoice of imported.manifest?.details.invoices ?? []) {
    if (invoice.direction !== direction) continue;
    rows.push({
      id: `imported:${invoice.id || invoice.reference}`, reference: invoice.reference, origin: "ورودی",
      party: invoice.party_id, partyIds: [invoice.party_id], date: invoice.date, due: invoice.due_date,
      expected: "—", amount: invoice.amount, balance: invoice.remaining,
      status: statusLabel(invoiceFinancialState(invoice)), reason: invoice.reason,
      source: { kind: "imported", invoice },
    });
  }
  rows.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.reference.localeCompare(b.reference, "fa", { numeric: true }));
  return { native, commercial, imported, selected, setSelected, rows };
}
