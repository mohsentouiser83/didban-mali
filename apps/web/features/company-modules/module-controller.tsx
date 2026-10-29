"use client";
import { useParams } from "next/navigation";
import { useAccess, useCompany } from "@/features/companies/use-companies";
import {
  useCompanyModules,
  useSaveCompanyModules,
} from "@/features/companies/use-company-modules";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { message } from "@/lib/api";
import { ModuleView } from "./module-view";
import { ModuleHistory } from "./module-history";
export function ModuleController() {
  const { companyId } = useParams<{ companyId: string }>();
  const company = useCompany(companyId),
    access = useAccess(companyId),
    modules = useCompanyModules(companyId),
    save = useSaveCompanyModules(companyId);
  if (company.isPending || access.isPending || modules.isPending)
    return <LoadingState layout="table" />;
  if (company.error || access.error || modules.error)
    return (
      <ErrorState
        message={message(company.error || access.error || modules.error)}
        onRetry={() => {
          void company.refetch();
          void access.refetch();
          void modules.refetch();
        }}
      />
    );
  return (
    <>
      <ModuleView
        key={modules.data.version}
        companyName={company.data.name}
        state={modules.data}
        canManage={access.data.permissions.includes("company.owner")}
        busy={save.isPending}
        error={save.error ? message(save.error) : undefined}
        onRefresh={() => {
          save.reset();
          void modules.refetch();
        }}
        onSubmit={(values, reason) =>
          save.mutate({
            body: { modules: values, reason },
            version: modules.data.version,
          })
        }
      />
      {access.data.permissions.includes("company.owner") ? (
        <ModuleHistory company={companyId} />
      ) : null}
    </>
  );
}
