"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useCompany } from "@/features/companies/use-companies";
import {
  useWorkspaceManifests,
  useSettlementWorkspace,
} from "@/features/settlements/use-settlements";
import {
  balanceModels,
  invoiceReason,
  invoiceOverdue,
} from "@/features/settlements/presentation";
import { formatMoney } from "@/features/results/presentation";
import { formatDate, persianDigits } from "@/lib/dates";
import { message } from "@/lib/api";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { BalancesView } from "./financial-balances-view";
export function BalancesController({
  direction,
}: {
  direction: "sales" | "purchase";
}) {
  const { companyId } = useParams<{ companyId: string }>(),
    company = useCompany(companyId),
    versions = useWorkspaceManifests(companyId);
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = chosen ?? versions.data?.at(-1)?.id;
  const workspace = useSettlementWorkspace(companyId, selected);
  if (
    company.isPending ||
    versions.isPending ||
    (selected && workspace.isPending)
  )
    return <LoadingState layout="table" />;
  const error = company.error || versions.error || workspace.error;
  if (error)
    return (
      <ErrorState
        message={message(error)}
        onRetry={() => {
          void company.refetch();
          void versions.refetch();
          void workspace.refetch();
        }}
      />
    );
  if (!selected || !workspace.data)
    return <EmptyState icon="Link2" title="نتیجه مالی آماده نیست" />;
  const unit = company.data.display_unit;
  return (
    <BalancesView
      company={company.data}
      title={direction === "sales" ? "مطالبات" : "بدهی‌ها"}
      asOf={formatDate(workspace.data.as_of_date)}
      unit={unit === "IRT" ? "تومان" : "ریال"}
      metrics={balanceModels(workspace.data, direction, unit)}
      rows={workspace.data.invoices
        .filter((i) => i.direction === direction)
        .map((i) => ({
          id: i.invoice_id,
          number: i.source_invoice_id,
          party: i.party_display_name ?? i.party_id,
          due: i.due_on ? formatDate(i.due_on) : "سررسید مشخص نیست",
          gross: formatMoney(i.gross, unit),
          remaining: formatMoney(i.remaining_as_of, unit),
          reason: invoiceReason(i),
          overdue: invoiceOverdue(i),
        }))}
      versions={(versions.data ?? []).map((v, index) => ({
        value: v.id,
        label: `نسخه ${persianDigits(String(index + 1))} · ${formatDate(v.as_of_date)}`,
      }))}
      selected={selected}
      onVersion={setChosen}
    />
  );
}
