"use client";

import { listItems, type Allocation, type ResourceList } from "@/lib/api";
import { fetchCursorList } from "./use-paged-resource";
import { useResource } from "./use-resource";
import { stateLabel, useTreasuryDocuments } from "./use-treasury-documents";
import { useWorkspace } from "./workspace";

type TreasuryRow = ReturnType<typeof useTreasuryDocuments>["docRows"][number];
type SettlementSource =
  | { kind: "treasury"; row: TreasuryRow }
  | { kind: "allocation"; allocation: Allocation };

export interface SettlementRow {
  id: string;
  reference: string;
  kind: string;
  date?: string;
  counterparty: string;
  bankReference: string;
  amount: string;
  status: string;
  source: SettlementSource;
}

export function useSettlementList(canViewAllocations: boolean) {
  const workspace = useWorkspace();
  const allocations = useResource<ResourceList<Allocation>>(
    canViewAllocations ? workspace.companyPath("allocations") : null,
    { fetcher: fetchCursorList<Allocation> },
  );
  const treasury = useTreasuryDocuments();
  const rows: SettlementRow[] = treasury.docRows.map((row) => {
    const { doc } = row;
    return {
      id: `treasury:${doc.id}`,
      reference: doc.number,
      kind: doc.direction === "receipt" ? "دریافت" : "پرداخت",
      date: doc.date,
      counterparty: doc.counterparty_name || treasury.cpNames[doc.counterparty_id] || doc.counterparty_id,
      bankReference: doc.tools.map((tool) => tool.reference).filter(Boolean).join("، ") || "—",
      amount: doc.total_amount,
      status: doc.state === "posted" ? "ثبت قطعی" : stateLabel[doc.state] ?? doc.state,
      source: { kind: "treasury", row },
    };
  });
  for (const allocation of listItems(allocations.data)) {
    rows.push({
      id: `allocation:${allocation.id}`,
      reference: allocation.invoice_reference || allocation.invoice_id,
      kind: "تخصیص بانک به فاکتور",
      date: allocation.created_at,
      counterparty: "—",
      bankReference: allocation.bank_reference || allocation.bank_id,
      amount: allocation.amount,
      status: allocation.reversed_at ? "برگشت‌شده" : "فعال",
      source: { kind: "allocation", allocation },
    });
  }
  rows.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.reference.localeCompare(b.reference, "fa", { numeric: true }));
  return { allocations, treasury, rows };
}
