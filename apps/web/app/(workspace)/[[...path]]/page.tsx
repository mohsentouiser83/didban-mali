import { AccountingView } from "@/components/workspace/accounting-view";
import { AccountsView } from "@/components/workspace/accounts-view";
import { CollectionFollowupsView } from "@/components/workspace/collection-followups-view";
import { ModulesView } from "@/components/workspace/modules-view";
import {
  BotConnectionDocumentsView,
  BotConnectionNotificationsView,
} from "@/components/workspace/bot-connection-pages";
import { BotConnectionsView } from "@/components/workspace/bot-connections-view";
import { PeopleView } from "@/components/workspace/people-view";
import {
  CashflowView,
  DashboardView,
  ForecastView,
  InvoicesView,
  MoadianView,
} from "@/components/workspace/financial-views";
import {
  AssistantView,
  NotificationsView,
  PlansView,
  ReportsView,
  ReviewView,
  SettlementsView,
  SourcesView,
} from "@/components/workspace/operations-views";
import {
  CompanyView,
  MembersView,
  PeriodsView,
  UsageView,
} from "@/components/workspace/settings-views";
import { SessionView, UploadsView } from "@/components/workspace/upload-views";
import { ReconciliationView } from "@/components/workspace/reconciliation-view";
import { ModelSettingsView } from "@/components/workspace/model-settings-view";
import { SettingsOverviewView } from "@/components/workspace/settings-overview-view";
import { notFound, redirect } from "next/navigation";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<{ operation?: string | string[] }>;
}) {
  const { path = [] } = await params;
  const route = path.join("/");
  if (["payroll", "tax", "insurance"].includes(route))
    redirect("/employee-reports");
  if (path.length === 2 && path[0] === "uploads")
    return (
      <div key={route} className="motion-safe:animate-page-reveal">
        <SessionView id={path[1]} />
      </div>
    );
  if (route === "receivables" || route === "payables") {
    const { operation } = await searchParams;
    return (
      <div key={route} className="motion-safe:animate-page-reveal">
        <InvoicesView
          direction={route === "receivables" ? "sales" : "purchases"}
          operationId={typeof operation === "string" ? operation : undefined}
        />
      </div>
    );
  }
  const routeRenderers: Record<string, () => React.ReactNode> = {
    "": () => <DashboardView />,
    uploads: () => <UploadsView />,
    sources: () => <SourcesView />,
    review: () => <ReviewView />,
    accounting: () => <AccountingView />,
    "settings/accounts": () => <AccountsView />,
    reconciliation: () => <ReconciliationView />,
    "receivables/followups": () => <CollectionFollowupsView />,
    cashflow: () => <CashflowView />,
    "cashflow/forecast": () => <ForecastView />,
    moadian: () => <MoadianView />,
    settlements: () => <SettlementsView />,
    "settlements/plans": () => <PlansView />,
    reports: () => <ReportsView />,
    "settings/modules": () => <ModulesView />,
    "settings/connections": () => <BotConnectionsView />,
    "settings/connections/documents": () => <BotConnectionDocumentsView />,
    "settings/connections/notifications": () => (
      <BotConnectionNotificationsView />
    ),
    employees: () => <PeopleView kind="employees" />,
    "employee-reports": () => <PeopleView kind="employee-reports" />,
    settings: () => <SettingsOverviewView />,
    "settings/company-access": () => (
      <SettingsOverviewView categoryKey="company-access" />
    ),
    "settings/documents": () => (
      <SettingsOverviewView categoryKey="documents" />
    ),
    "settings/accounting": () => (
      <SettingsOverviewView categoryKey="accounting" />
    ),
    "settings/automation": () => (
      <SettingsOverviewView categoryKey="automation" />
    ),
    "settings/periods": () => <PeriodsView />,
    "settings/company": () => <CompanyView />,
    "settings/members": () => <MembersView />,
    "settings/usage": () => <UsageView />,
    "settings/model": () => <ModelSettingsView />,
    notifications: () => <NotificationsView />,
    assistant: () => <AssistantView />,
  };
  const renderer = routeRenderers[route];
  if (!renderer) notFound();
  return (
    <div key={route} className="motion-safe:animate-page-reveal">
      {renderer()}
    </div>
  );
}
