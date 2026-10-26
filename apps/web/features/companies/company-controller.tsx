"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import {
  useCompanies,
  useCompany,
  useAccess,
  useCreateCompany,
} from "./use-companies";
import { useCurrentUser } from "@/features/auth/use-auth";
import { useUsers } from "@/features/users/use-users";
import {
  CompaniesView,
  CompanyCreateDialog,
  CompanyOverview,
} from "./company-view";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { message } from "@/lib/api";
import { roles } from "@/features/members/roles";
export function CompaniesController() {
  const companies = useCompanies(),
    me = useCurrentUser(),
    [open, setOpen] = useState(false);
  const users = useUsers(open && !!me.data?.is_installation_admin),
    create = useCreateCompany(() => setOpen(false));
  if (companies.isPending) return <LoadingState />;
  if (companies.error)
    return (
      <ErrorState
        message={message(companies.error)}
        onRetry={() => companies.refetch()}
      />
    );
  const options = new Map([
    [
      me.data?.id ?? "",
      { value: me.data?.id ?? "", label: me.data?.display_name ?? "حساب من" },
    ],
    ...(users.data?.pages
      .flatMap((p) => p.items)
      .filter((u) => !u.disabled)
      .map(
        (u) =>
          [
            u.id,
            { value: u.id, label: `${u.display_name} · ${u.email}` },
          ] as const,
      ) ?? []),
  ]);
  const creator = me.data?.is_installation_admin ? (
    <CompanyCreateDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        create.reset();
      }}
      owner={me.data.id}
      owners={Array.from(options.values())}
      loadingMore={users.isFetching}
      onMore={
        users.hasNextPage
          ? () => {
              void users.fetchNextPage();
            }
          : undefined
      }
      busy={create.isPending}
      error={
        create.error
          ? message(create.error)
          : users.error
            ? message(users.error)
            : undefined
      }
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        create.mutate({
          name: String(f.get("name")).trim(),
          owner_user_id: String(f.get("owner_user_id")),
          timezone: "Asia/Tehran",
          display_unit: f.get("display_unit") === "IRT" ? "IRT" : "IRR",
        });
      }}
    />
  ) : undefined;
  return (
    <CompaniesView
      companies={companies.data.pages.flatMap((p) => p.items)}
      create={creator}
      more={companies.hasNextPage}
      busy={companies.isFetchingNextPage}
      onMore={() => {
        void companies.fetchNextPage();
      }}
    />
  );
}
export function CompanyOverviewController() {
  const { companyId } = useParams<{ companyId: string }>();
  const company = useCompany(companyId),
    access = useAccess(companyId);
  if (company.isPending || access.isPending) return <LoadingState />;
  if (company.error || access.error)
    return (
      <ErrorState
        message={message(company.error || access.error)}
        onRetry={() => {
          void company.refetch();
          void access.refetch();
        }}
      />
    );
  return (
    <CompanyOverview
      company={company.data}
      role={roles[access.data.role]}
      canManage={access.data.permissions.includes("company.owner")}
      canApprove={access.data.permissions.includes("company.approve_report")}
    />
  );
}
