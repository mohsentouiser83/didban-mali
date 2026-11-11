"use client";
import { usePathname } from "next/navigation";
import { useWorkspace } from "@/hooks/workspace";
import { moduleRoutes, moduleStatusLabels, missingSourceLabels } from "@/lib/company-modules";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/content-states";
import { ButtonLink } from "@/components/ui/button";
import { CurrentPageHeader, Panel } from "./page-parts";
export function ModuleGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { modules, company } = useWorkspace();
  const key = moduleRoutes[pathname];
  if (!key || !company) return children;
  if (modules.loading) return <><CurrentPageHeader /><LoadingState label="در حال بررسی ماژول شرکت" /></>;
  if (modules.error) return <><CurrentPageHeader /><ErrorState message={modules.error.message} onRetry={modules.refresh} /></>;
  const item = modules.data?.items.find(item => item.key === key);
  // Cheque registration is itself an input; bank evidence is needed only for clearing.
  if (["/settlements/cheques", "/cashflow/scenarios", "/cashflow/forecast"].includes(pathname) && item?.enabled && item.status === "waiting_sources") return children;
  if (["/receivables", "/payables", "/receivables/followups"].includes(pathname) && item?.enabled && item.status === "waiting_sources" && item.source_basis === "native_invoice") return children;
  if (pathname === "/reconciliation" && item?.enabled && item.status === "waiting_sources" && item.source_basis === "native_book") return children;
  if (key === "moadian" && item?.enabled && item.status === "waiting_sources") return children;
  if (key === "moadian" && item?.status === "disabled")
    return (
      <>
        <CurrentPageHeader />
        <Panel>
          <EmptyState
            title="ماژول مؤدیان خاموش است"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <ButtonLink href="/settings/modules">تنظیم ماژول‌ها</ButtonLink>
                <ButtonLink href="/moadian/transmissions" variant="secondary">
                  سوابق ارسال صورتحساب
                </ButtonLink>
              </div>
            }
          />
        </Panel>
      </>
    );
  if (!item?.available) return <><CurrentPageHeader /><Panel><EmptyState title={item ? `${item.label}؛ ${moduleStatusLabels[item.status]}` : "ماژول در دسترس نیست"} description={item?.enabled && item.missing_sources.length ? `اسناد لازم: ${missingSourceLabels(item.missing_sources)}` : undefined} action={<ButtonLink href={item?.enabled ? "/uploads" : "/settings/modules"}>{item?.enabled ? "بارگذاری اسناد" : "تنظیم ماژول‌ها"}</ButtonLink>} /></Panel></>;
  return children;
}
