"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { listItems, type Report } from "@/lib/api";
import type { StudioDefinition } from "@/lib/report-studio";
import { useWorkspace } from "./workspace";
import { useCommand } from "./use-command";
import { usePagedResource } from "./use-paged-resource";
import { useResource } from "./use-resource";

export function useReportArchive() {
  const workspace = useWorkspace();
  const router = useRouter();
  const resource = usePagedResource<Report>(workspace.companyPath("reports"));
  const definitions = useResource<StudioDefinition[]>(workspace.companyPath("report-studio/definitions"));
  const command = useCommand();
  const [approving, setApproving] = useState<Report | null>(null);
  function refresh() { resource.refresh(); definitions.refresh(); }
  return {
    workspace, resource, command, approving,
    reports: listItems(resource.data), definitions: definitions.data || [],
    loading: resource.loading || definitions.loading,
    error: resource.error || definitions.error,
    refresh,
    openDefinition: (id: string) => router.push(`/reports/studio?definition=${encodeURIComponent(id)}`),
    setDashboard(report: Report, mode: "fixed" | "live") {
      void command.run(workspace.companyPath(`report-studio/reports/${report.id}/set-dashboard?mode=${mode}`),
        { method: "POST" }, refresh, "داشبورد شرکت تنظیم شد.");
    },
    requestApproval(report: Report) { setApproving(report); command.clearError(); },
    closeApproval() { setApproving(null); },
    confirmApproval() {
      if (!approving) return;
      void command.run(workspace.companyPath(`reports/${approving.id}/approvals`),
        { body: { expected_version: approving.version }, version: approving.version },
        () => { setApproving(null); resource.refresh(); }, "تأیید این نسخه ثبت شد.");
    },
  };
}
