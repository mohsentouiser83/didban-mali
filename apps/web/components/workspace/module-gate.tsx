"use client";
import { usePathname } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, LoadingState } from "@/components/ui/content-states";
import { useWorkspace } from "@/hooks/workspace";
import { moduleRoutes } from "@/lib/company-modules";
import { CurrentPageHeader, Panel } from "./page-parts";

export function ModuleGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { modules, company } = useWorkspace();
  const moduleKey = moduleRoutes[pathname];
  const state = modules?.data?.items.find((item) => item.key === moduleKey);

  if (moduleKey && modules?.loading) {
    return <><CurrentPageHeader /><LoadingState /></>;
  }

  if (state?.status === "disabled") {
    return (
      <>
        <CurrentPageHeader />
        <Panel>
          <EmptyState title="این ماژول برای شرکت خاموش است" action={
            company?.role === "owner" && <ButtonLink href="/settings/modules">مدیریت ماژول‌ها</ButtonLink>
          } />
        </Panel>
      </>
    );
  }

  return <>{children}</>;
}
