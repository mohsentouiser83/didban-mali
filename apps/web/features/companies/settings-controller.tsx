"use client";
import { useParams } from "next/navigation";
import { useCompany, useAccess, useUpdateCompany } from "./use-companies";
import { SettingsView } from "./settings-view";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { message } from "@/lib/api";
export function SettingsController() {
  const { companyId } = useParams<{ companyId: string }>(),
    company = useCompany(companyId),
    access = useAccess(companyId),
    action = useUpdateCompany(companyId, () => {});
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
  if (!access.data.permissions.includes("company.owner"))
    return <ErrorState message="تنظیمات شرکت فقط برای مالک قابل تغییر است." />;
  return (
    <SettingsView
      key={company.data.version}
      company={company.data}
      busy={action.isPending}
      error={action.error ? message(action.error) : undefined}
      onRefresh={() => {
        void company.refetch();
        action.reset();
      }}
      onArchive={() =>
        action.mutate({
          body: { archived: !company.data.archived },
          version: company.data.version,
        })
      }
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        action.mutate({
          version: company.data.version,
          body: {
            name: String(f.get("name")).trim(),
            display_unit: f.get("display_unit") === "IRT" ? "IRT" : "IRR",
          },
        });
      }}
    />
  );
}
