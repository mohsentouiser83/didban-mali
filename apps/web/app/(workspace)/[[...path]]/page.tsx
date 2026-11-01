import { ModulesView } from "@/components/workspace/modules-view";
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
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path = [] } = await params;
  const route = path.join("/");
  if (["payroll", "tax", "insurance"].includes(route)) redirect("/employee-reports");
  if (path.length === 2 && path[0] === "uploads")
    return (
      <div key={route} className="motion-safe:animate-page-reveal">
        <SessionView id={path[1]} />
      </div>
    );
  const routes: Record<string, React.ReactNode> = {
    "": <DashboardView />,
    uploads: <UploadsView />,
    sources: <SourcesView />,
    review: <ReviewView />,
    reconciliation: <ReconciliationView />,
    receivables: <InvoicesView direction="sales" />,
    payables: <InvoicesView direction="purchases" />,
    cashflow: <CashflowView />,
    "cashflow/forecast": <ForecastView />,
    moadian: <MoadianView />,
    settlements: <SettlementsView />,
    "settlements/plans": <PlansView />,
    reports: <ReportsView />,
    "settings/modules": <ModulesView />,
    "settings/connections": <BotConnectionsView />,
    employees: <PeopleView kind="employees" />,
    "employee-reports": <PeopleView kind="employee-reports" />,
    settings: <SettingsOverviewView />,
    "settings/company-access": (
      <SettingsOverviewView categoryKey="company-access" />
    ),
    "settings/documents": <SettingsOverviewView categoryKey="documents" />,
    "settings/periods": <PeriodsView />,
    "settings/company": <CompanyView />,
    "settings/members": <MembersView />,
    "settings/usage": <UsageView />,
    "settings/model": <ModelSettingsView />,
    notifications: <NotificationsView />,
    assistant: <AssistantView />,
  };
  if (!(route in routes)) notFound();
  return (
    <div key={route} className="motion-safe:animate-page-reveal">
      {routes[route]}
    </div>
  );
}
