"use client";
import { useParams } from "next/navigation";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { useCurrentUser } from "@/features/auth/use-auth";
import { useModelStatus } from "@/features/assistant/use-assistant";
import { formatMoney } from "@/features/results/presentation";
import { formatTime } from "@/lib/dates";
import { message } from "@/lib/api";
import { useCompanyUsage } from "./use-model-usage";
import { UsageView } from "./usage-view";
export function CompanyUsageController() {
  const { companyId } = useParams<{ companyId: string }>(),
    usage = useCompanyUsage(companyId),
    status = useModelStatus(companyId),
    me = useCurrentUser();
  if (usage.isPending || status.isPending || me.isPending)
    return <LoadingState />;
  const error = usage.error || status.error || me.error;
  if (error)
    return (
      <ErrorState
        message={message(error)}
        onRetry={() => {
          void usage.refetch();
          void status.refetch();
          void me.refetch();
        }}
      />
    );
  return (
    <UsageView
      title="مصرف هوش مصنوعی"
      period={`${formatTime(usage.data.period_start)} تا ${formatTime(usage.data.period_end)}`}
      ceiling={formatMoney(usage.data.ceiling, "IRR")}
      reserved={formatMoney(usage.data.reserved, "IRR")}
      spent={formatMoney(usage.data.spent, "IRR")}
      configured={usage.data.budget_configured}
      unknown={usage.data.usage_unknown}
      model={status.data.model_identifier}
      providerReady={status.data.configured}
      companyScope
      adminPath={me.data.is_installation_admin ? "/model-budget" : undefined}
    />
  );
}
