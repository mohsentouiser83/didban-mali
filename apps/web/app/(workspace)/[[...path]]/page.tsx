import { AccountingView } from "@/components/workspace/accounting-view";
import { AccountsView } from "@/components/workspace/accounts-view";
import { CollectionFollowupsView } from "@/components/workspace/collection-followups-view";
import { ProfileView } from "@/components/workspace/profile-view";
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
import { TreasuryAccountsView } from "@/components/workspace/treasury-accounts-view";
import { SettingsOverviewView } from "@/components/workspace/settings-overview-view";
import { CounterpartiesView } from "@/components/workspace/commercial/counterparties-view";
import { ProformasView } from "@/components/workspace/commercial/proformas-view";
import { notFound, redirect } from "next/navigation";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<{ operation?: string | string[]; review_draft?: string | string[]; party_id?: string | string[]; tab?: string | string[]; reference?: string | string[] }>;
}) {
  const { path = [] } = await params;
  const resolvedSearchParams = await searchParams;
  const route = path.join("/");
  if (route === "sources") redirect("/settings/documents");
  if (route === "settings/connections") redirect("/settings/profile");
  if (route === "settings/connections/documents") redirect("/settings/documents#bot-documents");
  if (["tax", "insurance"].includes(route))
    redirect("/employee-reports");
  if (route === "employees")
    redirect("/payroll/employees");
  if (route === "settings/personnel") redirect("/payroll/employees");
  if (route === "notifications")
    redirect("/");
  if (route === "chat")
    redirect("/assistant");
  if (path.length === 2 && path[0] === "uploads")
    return <SessionView id={path[1]} />;
  if (route === "receivables" || route === "payables") {
    const { operation, tab, party_id: partyId, reference } = resolvedSearchParams;
    return (
      <InvoicesView
        direction={route === "receivables" ? "sales" : "purchases"}
        operationId={typeof operation === "string" ? operation : undefined}
        partyId={typeof partyId === "string" ? partyId : undefined}
        initialReference={typeof reference === "string" ? reference : undefined}
        initialTab={tab === "commercial" || tab === "imported" ? tab : "native"}
      />
    );
  }
  if (route === "accounting") {
    const { review_draft: draft } = resolvedSearchParams;
    return <AccountingView reviewDraftId={typeof draft === "string" && /^[0-9a-f-]{36}$/i.test(draft) ? draft : undefined} />;
  }
  const initialPartyId = typeof resolvedSearchParams.party_id === "string" ? resolvedSearchParams.party_id : undefined;
  const routeRenderers: Record<string, () => React.ReactNode> = {
    "": () => <DashboardView />,
    uploads: () => <UploadsView />,
    "settings/accounts": () => <AccountsView />,
    "settings/treasury": () => <TreasuryAccountsView />,
    reconciliation: () => <ReconciliationView initialTab="bank" />,
    "reconciliation/bank": () => <ReconciliationView initialTab="bank" />,
    "reconciliation/counterparties": () => (
      <ReconciliationView initialTab="counterparty" initialPartyId={initialPartyId} />
    ),
    "reconciliation/counterparty": () => (
      <ReconciliationView initialTab="counterparty" initialPartyId={initialPartyId} />
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
    employees: () => <PeopleView kind="employees" />,
    "employee-reports": () => <PeopleView kind="employee-reports" />,
    settings: () => <SettingsOverviewView />,
    "settings/company-access": () => (
      <SettingsOverviewView categoryKey="company-access" />
    ),
    "settings/documents": () => <SourcesView />,
    "commercial/counterparties": () => <CounterpartiesView />,
    "commercial/proformas": () => <ProformasView />,
    "settings/accounting": () => (
      <SettingsOverviewView categoryKey="accounting" />
    ),
    "settings/numbering": () => <NumberingSystemView />,
    "settings/periods": () => <PeriodsView />,
    "settings/company": () => <CompanyView />,
    "settings/members": () => <MembersView />,
    assistant: () => <AssistantView />,
  };
  const renderer = routeRenderers[route];
  if (!renderer) notFound();
  return renderer();
}
