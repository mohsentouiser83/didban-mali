"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useCompany, useAccess } from "@/features/companies/use-companies";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { formatDate, persianDigits } from "@/lib/dates";
import { message } from "@/lib/api";
import { formatMoney } from "@/features/results/presentation";
import {
  useWorkspaceManifests,
  useSettlementWorkspace,
  useSettlementCommands,
} from "./use-settlements";
import { canonicalMoney } from "./presentation";
import {
  SettlementsView,
  AllocationDialog,
  ReversalDialog,
} from "./settlements-view";
export function SettlementsController() {
  const { companyId } = useParams<{ companyId: string }>(),
    company = useCompany(companyId),
    access = useAccess(companyId),
    manifests = useWorkspaceManifests(companyId);
  const manifest = manifests.data?.at(-1),
    workspace = useSettlementWorkspace(companyId, manifest?.id);
  const [create, setCreate] = useState(false),
    [reverse, setReverse] = useState<string | null>(null),
    [amountError, setAmountError] = useState<string | null>(null);
  const commands = useSettlementCommands(companyId, () => {
    setCreate(false);
    setReverse(null);
    setAmountError(null);
  });
  if (
    company.isPending ||
    access.isPending ||
    manifests.isPending ||
    (manifest && workspace.isPending)
  )
    return <LoadingState layout="table" />;
  const error =
    company.error || access.error || manifests.error || workspace.error;
  if (error)
    return (
      <ErrorState
        message={message(error)}
        onRetry={() => {
          void company.refetch();
          void access.refetch();
          void manifests.refetch();
          void workspace.refetch();
        }}
      />
    );
  if (!manifest || !workspace.data)
    return <EmptyState title="نتیجه مالی آماده نیست" />;
  const data = workspace.data,
    unit = company.data.display_unit,
    canOperate = access.data.permissions.includes("company.operate");
  return (
    <>
      <SettlementsView
        company={company.data}
        date={formatDate(data.as_of_date)}
        revision={persianDigits(String(data.version))}
        unit={unit === "IRT" ? "تومان" : "ریال"}
        rows={data.allocations.map((a) => ({
          id: a.id,
          invoice:
            data.invoices.find((i) => i.invoice_id === a.invoice_id)
              ?.source_invoice_id ?? a.invoice_id,
          amount: formatMoney(a.amount, unit),
          date: formatDate(
            data.events.find((e) => e.id === a.settlement_event_id)
              ?.settled_on ?? data.as_of_date,
          ),
          reversed: a.reversed,
          provenance: "",
        }))}
        banks={data.bank_movements
          .filter((m) => m.date <= data.as_of_date)
          .map((m) => ({
            id: m.id,
            date: formatDate(m.date),
            amount: formatMoney(m.amount, unit),
            reference: m.reference ?? "بدون مرجع",
            ready: !!m.event_id,
          }))}
        canOperate={canOperate}
        busy={commands.event.isPending}
        error={commands.event.error ? message(commands.event.error) : null}
        onCreate={() => {
          commands.allocate.reset();
          setAmountError(null);
          setCreate(true);
        }}
        onReverse={(id) => {
          commands.reverse.reset();
          setReverse(id);
        }}
        onEvent={(movement) =>
          commands.event.mutate({ manifest: manifest.id, movement })
        }
      />
      {create ? (
        <AllocationDialog
          open
          onClose={() => setCreate(false)}
          busy={commands.allocate.isPending}
          error={
            commands.allocate.error ? message(commands.allocate.error) : null
          }
          amountError={amountError}
          invoices={data.invoices.map((i) => ({
            value: i.invoice_id,
            label: `${i.direction === "sales" ? "فروش" : "خرید"} ${i.source_invoice_id} · ${i.party_display_name ?? ""}`,
          }))}
          events={data.events
            .filter((e) => e.settled_on <= data.as_of_date)
            .map((e) => ({
              value: e.id,
              label: `${e.direction === "receipt" ? "دریافت" : "پرداخت"} ${formatMoney(e.amount, unit)} · ${formatDate(e.settled_on)}`,
            }))}
          onSubmit={(form) => {
            const amount = canonicalMoney(String(form.get("amount") ?? ""));
            if (!amount) {
              setAmountError("مبلغ معتبر و مثبت وارد کنید.");
              document.getElementById("allocation-amount")?.focus();
              return;
            }
            setAmountError(null);
            commands.allocate.mutate({
              invoice_id: String(form.get("invoice_id")),
              settlement_event_id: String(form.get("event_id")),
              dataset_revision_id: data.dataset_revision_id,
              amount,
              reason: String(form.get("reason") ?? "").trim(),
            });
          }}
        />
      ) : null}
      {reverse ? (
        <ReversalDialog
          open
          onClose={() => setReverse(null)}
          busy={commands.reverse.isPending}
          error={
            commands.reverse.error ? message(commands.reverse.error) : null
          }
          onSubmit={(reason) => {
            const allocation = data.allocations.find((a) => a.id === reverse);
            if (allocation && reason)
              commands.reverse.mutate({ allocation, reason });
          }}
        />
      ) : null}
    </>
  );
}
