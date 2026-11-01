"use client";
import { useWorkspace } from "./workspace";
import { useCommand } from "./use-command";
import type { CompanyModule } from "@/lib/company-modules";
export function useCompanyModules() {
  const workspace = useWorkspace();
  const command = useCommand();
  return { ...workspace.modules, company: workspace.company, busy: command.busy,
    operationError: command.error, canManage: workspace.modules.data?.can_manage === true,
    toggle: (item: CompanyModule, enabled: boolean) => void command.run(
      workspace.companyPath(`modules/${item.key}`),
      { method: "PATCH", body: { enabled }, version: item.version },
      workspace.modules.refresh, "تنظیم ماژول ذخیره شد",
    ),
  };
}
