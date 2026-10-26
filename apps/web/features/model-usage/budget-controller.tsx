"use client";
import { useState } from "react";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { useCurrentUser } from "@/features/auth/use-auth";
import { formatMoney } from "@/features/results/presentation";
import { formatTime } from "@/lib/dates";
import { message } from "@/lib/api";
import {
  useBudgetCommands,
  useInstallationBudget,
  useInstallationUsage,
  useUncertainCharges,
} from "./use-model-usage";
import { UsageView } from "./usage-view";
import { BudgetView, CostReceiptDialog } from "./budget-view";
export function BudgetController() {
  const me = useCurrentUser(),
    admin = !!me.data?.is_installation_admin;
  const policy = useInstallationBudget(admin),
    usage = useInstallationUsage(admin),
    charges = useUncertainCharges(admin),
    commands = useBudgetCommands();
  const [draft, setDraft] = useState<string | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [actual, setActual] = useState("");
  if (me.isPending) return <LoadingState />;
  if (me.error)
    return (
      <ErrorState
        message={message(me.error)}
        onRetry={() => {
          void me.refetch();
        }}
      />
    );
  if (!admin) return <ErrorState message="دسترسی مدیر سازمان لازم است." />;
  if (policy.isPending || usage.isPending || charges.isPending)
    return <LoadingState />;
  const error = policy.error || usage.error || charges.error;
  if (error)
    return (
      <ErrorState
        message={message(error)}
        onRetry={() => {
          void policy.refetch();
          void usage.refetch();
          void charges.refetch();
        }}
      />
    );
  return (
    <div className="space-y-7">
      <UsageView
        title="بودجه هوش مصنوعی"
        period={`${formatTime(usage.data.period_start)} تا ${formatTime(usage.data.period_end)}`}
        ceiling={formatMoney(usage.data.ceiling, "IRR")}
        reserved={formatMoney(usage.data.reserved, "IRR")}
        spent={formatMoney(usage.data.spent, "IRR")}
        configured={usage.data.budget_configured}
        unknown={usage.data.usage_unknown}
        model={null}
        providerReady={null}
      />
      <BudgetView
        ceiling={draft ?? policy.data?.ceiling_usd ?? ""}
        busy={commands.save.isPending}
        error={commands.save.error ? message(commands.save.error) : null}
        success={commands.save.isSuccess}
        charges={charges.data.pages
          .flatMap((p) => p.items)
          .map((c) => ({
            id: c.id,
            time: formatTime(c.created_at),
            reserved: formatMoney(c.reserved_usd, "IRR"),
          }))}
        more={charges.hasNextPage}
        busyMore={charges.isFetchingNextPage}
        onCeiling={setDraft}
        onSave={() =>
          commands.save.mutate(
            {
              ceiling: draft ?? policy.data?.ceiling_usd ?? "",
              version: policy.data?.version ?? null,
            },
            { onSuccess: () => setDraft(null) },
          )
        }
        onSelect={(id) => {
          setSelected(id);
          setActual("");
          commands.reconcile.reset();
        }}
        onMore={() => {
          void charges.fetchNextPage();
        }}
      />
      {selected ? (
        <CostReceiptDialog
          id={selected}
          actual={actual}
          busy={commands.reconcile.isPending}
          error={
            commands.reconcile.error ? message(commands.reconcile.error) : null
          }
          onActual={setActual}
          onSubmit={() =>
            commands.reconcile.mutate(
              { id: selected, actual },
              { onSuccess: () => setSelected(null) },
            )
          }
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
