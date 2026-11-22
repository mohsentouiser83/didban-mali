import { AccountingView } from "@/components/workspace/accounting-view";
import { AccountsView } from "@/components/workspace/accounts-view";
import { CollectionFollowupsView } from "@/components/workspace/collection-followups-view";
import { ProfileView } from "@/components/workspace/profile-view";
import {
  BotConnectionDocumentsView,
  BotConnectionNotificationsView,
} from "@/components/workspace/bot-connection-pages";
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
} from "@/components/workspace/settings-views";
import { SessionView, UploadsView } from "@/components/workspace/upload-views";
import { ReconciliationView } from "@/components/workspace/reconciliation-view";
import { NumberingSystemView } from "@/components/workspace/numbering-system-view";
import { SettingsOverviewView } from "@/components/workspace/settings-overview-view";
import { ModulesView } from "@/components/workspace/modules-view";
import { ModelSettingsView } from "@/components/workspace/model-settings-view";
import { LearningView } from "@/components/workspace/learning-view";
import { AutomationRulesView } from "@/components/workspace/automation-rules-view";
import { CounterpartiesView } from "@/components/workspace/commercial/counterparties-view";
import { ProformasView } from "@/components/workspace/commercial/proformas-view";
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
  if (["tax", "insurance"].includes(route))
    redirect("/employee-reports");
  if (route === "employees")
    redirect("/settings/employees");
  if (route === "notifications")
    redirect("/");
  if (route === "chat")
    redirect("/assistant");
  if (path.length === 2 && path[0] === "uploads")
    return <SessionView id={path[1]} />;
  if (route === "receivables" || route === "payables") {
    const { operation } = await searchParams;
    return (
      <InvoicesView
        direction={route === "receivables" ? "sales" : "purchases"}
        operationId={typeof operation === "string" ? operation : undefined}
      />
    );
  }
  const routeRenderers: Record<string, () => React.ReactNode> = {
    "": () => <DashboardView />,
    uploads: () => <UploadsView />,
    sources: () => <SourcesView />,
    review: () => <ReviewView />,
    accounting: () => <AccountingView />,
    "settings/accounts": () => <AccountsView />,
    reconciliation: () => <ReconciliationView initialTab="bank" />,
    "reconciliation/bank": () => <ReconciliationView initialTab="bank" />,
    "reconciliation/counterparties": () => (
      <ReconciliationView initialTab="counterparty" />
    ),
    "reconciliation/counterparty": () => (
      <ReconciliationView initialTab="counterparty" />
    ),
    "reconciliation/moadian": () => (
      <ReconciliationView initialTab="moadian" />
    ),
    "receivables/followups": () => <CollectionFollowupsView />,
    cashflow: () => <CashflowView />,
    "cashflow/forecast": () => <ForecastView />,
    moadian: () => <MoadianView />,
    settlements: () => <SettlementsView />,
    "settlements/plans": () => <PlansView />,
    reports: () => <ReportsView />,
    "settings/profile": () => <ProfileView />,
    profile: () => <ProfileView />,
    "settings/connections": () => <ProfileView />,
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
    "settings/documents": () => <SettingsOverviewView categoryKey="documents" />,
    "settings/personnel": () => <SettingsOverviewView categoryKey="personnel" />,
    "settings/modules": () => <ModulesView />,
    "settings/model": () => <ModelSettingsView />,
    "settings/rules": () => <AutomationRulesView />,
    "settings/learning": () => <LearningView />,
    "commercial/counterparties": () => <CounterpartiesView />,
    "commercial/proformas": () => <ProformasView />,
    "settings/accounting": () => (
      <SettingsOverviewView categoryKey="accounting" />
    ),
    "settings/numbering": () => <NumberingSystemView />,
    "settings/inventory": () => (
      <SettingsOverviewView categoryKey="inventory" />
    ),
    "settings/periods": () => <PeriodsView />,
    "settings/company": () => <CompanyView />,
    "settings/members": () => <MembersView />,
    assistant: () => <AssistantView />,
  };
  const renderer = routeRenderers[route];
  if (!renderer) notFound();
  return renderer();
}
