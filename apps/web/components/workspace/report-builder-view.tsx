"use client";
import { ChartBarIcon } from "@phosphor-icons/react";
import { ButtonLink } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { useReportBuilder } from "@/hooks/use-report-builder";
import { useWorkspace } from "@/hooks/workspace";
import { NoCompany, PageHeader } from "./page-parts";
import { ReportBuilderForm } from "./report-builder-form";
import { ReportBuilderResult } from "./report-builder-result";
import { ReportBuilderSaved } from "./report-builder-saved";

function BuilderWorkspace() {
  const controller = useReportBuilder();
  return <><PageHeader icon={ChartBarIcon} title="گزارش‌ساز" action={<ButtonLink href="/reports" variant="ghost">گزارش‌ها</ButtonLink>} /><div className="space-y-5"><ReportBuilderForm controller={controller} /><FormMessage error>{controller.command.error?.message}</FormMessage><ReportBuilderResult controller={controller} /><ReportBuilderSaved controller={controller} /></div></>;
}
export function ReportBuilderView() {
  const workspace = useWorkspace();
  if (!workspace.company) return <NoCompany />;
  return <BuilderWorkspace key={`${workspace.user?.id}:${workspace.company.id}`} />;
}
