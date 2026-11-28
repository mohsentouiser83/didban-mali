"use client";
import type { Metric, ResourceList } from "@/lib/api";
import type { AccountingCapabilities } from "@/lib/accounting";
import type { NativeInvoice } from "@/lib/native-invoices";
import { listItems } from "@/lib/api";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";
interface Summary {
  id: string;
  source: "native_statement";
  period: { name: string; start: string; end: string };
  as_of: string;
  created_at?: string;
  metrics: Metric[];
}
export function useNativeDashboard() {
  const workspace = useWorkspace();
  const path = workspace.companyPath("accounting/statements/summary/latest");
  const resource = useResource<Summary>(
    path
      ? `${path}${workspace.periodId ? `?period_id=${encodeURIComponent(workspace.periodId)}` : ""}`
      : null,
    { allowMissing: true },
  );
  const capabilities = useResource<AccountingCapabilities>(
    workspace.companyPath("accounting/capabilities"),
    { allowMissing: true },
  );
  const reports = useResource<ResourceList<{ id: string }>>(
    workspace.companyPath("reports?limit=1"),
    { allowMissing: true },
  );
  const invoices = useResource<{ items: NativeInvoice[] }>(
    workspace.companyPath("accounting/native-invoices?limit=100"),
    { allowMissing: true },
  );

  const invoiceItems = listItems(invoices.data);
  const openSalesInvoices = invoiceItems
    .filter((i) => i.direction === "sale" && i.remaining != null)
    .reduce((sum, i) => sum + Number(i.remaining || 0), 0);
  const openPurchaseInvoices = invoiceItems
    .filter((i) => i.direction === "purchase" && i.remaining != null)
    .reduce((sum, i) => sum + Number(i.remaining || 0), 0);

  return {
    workspace,
    ...resource,
    cash: resource.data?.metrics.find((metric) => metric.metric_key === "cash"),
    canPrepare: capabilities.data?.can_prepare ?? workspace.canWrite,
    hasSavedReports: listItems(reports.data).length > 0,
    hasInvoicesData: invoiceItems.length > 0,
    openSalesInvoices: String(openSalesInvoices),
    openPurchaseInvoices: String(openPurchaseInvoices),
  };
}
