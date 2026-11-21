"use client";

import { useWorkspace } from "./workspace";
import { useResource } from "./use-resource";

export interface MoadianInvoiceItem {
  invoice_id: string;
  transmission_id?: string;
  tax_id?: string;
  reference: string;
  party_id: string;
  date: string;
  amount: string;
  vat_amount: string;
  status: string;
  status_label: string;
}

export interface MoadianReconciliationSummary {
  total_sales_book: string;
  total_sales_accepted: string;
  total_sales_untransmitted: string;
  total_vat_book: string;
  total_vat_accepted: string;
  vat_discrepancy: string;
  invoices_count: number;
  accepted_count: number;
  pending_count: number;
  rejected_count: number;
  untransmitted_count: number;
  compliance_percentage: number;
}

export interface MoadianReconciliationData {
  configured: boolean;
  summary: MoadianReconciliationSummary;
  accepted: MoadianInvoiceItem[];
  pending: MoadianInvoiceItem[];
  rejected: MoadianInvoiceItem[];
  untransmitted: MoadianInvoiceItem[];
}

export function useMoadianReconciliation() {
  const workspace = useWorkspace();
  const resource = useResource<MoadianReconciliationData>(
    workspace.companyPath("moadian/reconciliation"),
  );

  return {
    workspace,
    resource,
    summary: resource.data?.summary,
    accepted: resource.data?.accepted ?? [],
    pending: resource.data?.pending ?? [],
    rejected: resource.data?.rejected ?? [],
    untransmitted: resource.data?.untransmitted ?? [],
    configured: resource.data?.configured ?? false,
    loading: resource.loading,
    error: resource.error,
    refresh: resource.refresh,
  };
}
