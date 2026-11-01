"use client";
import { SquaresFourIcon } from "@phosphor-icons/react";
import { useCompanyModules } from "@/hooks/use-company-modules";
import { moduleStatusLabels, missingSourceLabels } from "@/lib/company-modules";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { FormMessage } from "@/components/ui/field";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { PageHeader, Panel, NoCompany } from "./page-parts";
export function ModulesView() {
  const view = useCompanyModules();
  if (!view.company) return <NoCompany />;
  return <><PageHeader title="ماژول‌های شرکت" icon={SquaresFourIcon} />
    {view.loading ? <LoadingState /> : view.error ? <ErrorState message={view.error.message} onRetry={view.refresh} /> :
    <Panel><ul className="divide-y divide-border">{view.data?.items.map(item => <li key={item.key} className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-center gap-3"><SquaresFourIcon size={22} className="shrink-0 text-primary" aria-hidden /><div><span className="font-medium">{item.label}</span>{item.enabled && item.missing_sources.length > 0 && <p className="mt-1 text-xs text-muted">اسناد لازم: {missingSourceLabels(item.missing_sources)}</p>}</div></div>
      <div className="flex items-center gap-4"><Badge tone={item.available ? "success" : item.enabled ? "warning" : "neutral"}>{moduleStatusLabels[item.status]}</Badge>
      <Switch label={`${item.label}؛ روشن یا خاموش`} checked={item.enabled} disabled={!view.canManage || view.busy} onCheckedChange={enabled => view.toggle(item, enabled)} /></div>
    </li>)}</ul></Panel>}
    <FormMessage error>{view.operationError?.message}</FormMessage>
  </>;
}
