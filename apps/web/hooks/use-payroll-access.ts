"use client";

import { ApiError } from "@/lib/api";
import type { AccountingCapabilities } from "@/lib/accounting";
import { useResource } from "./use-resource";
import type { useWorkspace } from "./workspace";

const denied = new ApiError(
  403,
  "مجوز مشاهده یا مدیریت اطلاعات حقوق و دستمزد را ندارید.",
  "payroll_access_required",
);

export function usePayrollAccess(workspace: ReturnType<typeof useWorkspace>) {
  const capabilities = useResource<AccountingCapabilities>(
    workspace.companyPath("accounting/capabilities"),
  );
  const canView = capabilities.data?.can_view_payroll === true;

  return {
    canView,
    canPrepare: canView && capabilities.data?.can_prepare === true,
    loading: capabilities.loading,
    error: capabilities.error ?? (capabilities.data && !canView ? denied : undefined),
    refresh: capabilities.refresh,
  };
}
