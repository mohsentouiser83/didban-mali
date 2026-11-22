"use client";

import { useState } from "react";
import { ChartBarIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { useReportBuilder } from "@/hooks/use-report-builder";
import { useWorkspace } from "@/hooks/workspace";
import { NoCompany, PageHeader } from "./page-parts";
import { ReportBuilderForm } from "./report-builder-form";
import { ReportBuilderResult } from "./report-builder-result";
import { ReportBuilderSaved } from "./report-builder-saved";
import { CustomReportCanvas } from "./custom-reports/custom-report-canvas";

function BuilderWorkspace() {
  const controller = useReportBuilder();
  const [mode, setMode] = useState<"advanced" | "classic">("advanced");

  return (
    <>
      <PageHeader
        icon={ChartBarIcon}
        title="گزارش‌ساز چندمنبعی مالی"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={mode === "advanced" ? "soft" : "ghost"}
              onClick={() => setMode(mode === "advanced" ? "classic" : "advanced")}
              className="gap-1.5 text-xs"
            >
              <SlidersHorizontalIcon size={16} />
              {mode === "advanced" ? "تغییر به فرم ساده کلاسیک" : "تغییر به گزارش‌ساز چندمنبعی P3G"}
            </Button>
          </div>
        }
      />
      {mode === "advanced" ? (
        <CustomReportCanvas />
      ) : (
        <div className="space-y-5">
          <ReportBuilderForm controller={controller} />
          <FormMessage error>{controller.command.error?.message}</FormMessage>
          <ReportBuilderResult controller={controller} />
          <ReportBuilderSaved controller={controller} />
        </div>
      )}
    </>
  );
}

export function ReportBuilderView() {
  const workspace = useWorkspace();
  if (!workspace.company) return <NoCompany />;
  return <BuilderWorkspace key={`${workspace.user?.id}:${workspace.company.id}`} />;
}
