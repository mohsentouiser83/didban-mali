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
  if (!item?.available) return <><CurrentPageHeader /><Panel><EmptyState title={item ? `${item.label}؛ ${moduleStatusLabels[item.status]}` : "ماژول در دسترس نیست"} description={item?.enabled && item.missing_sources.length ? `اسناد لازم: ${missingSourceLabels(item.missing_sources)}` : undefined} action={<ButtonLink href={item?.enabled ? "/uploads" : "/settings/modules"}>{item?.enabled ? "بارگذاری اسناد" : "تنظیم ماژول‌ها"}</ButtonLink>} /></Panel></>;
  return children;
}
