"use client";

import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { useReportStudio } from "@/hooks/use-report-studio";
import { useWorkspace } from "@/hooks/workspace";
import type { StudioWidgetSpec } from "@/lib/report-studio";
import {
  EraserIcon,
  ChartBarIcon,
  CheckCircleIcon,
  FilePdfIcon,
  FloppyDiskIcon,
  PlusIcon,
  SparkleIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { NoCompany, PageHeader } from "../page-parts";
import { AiPromptDialog } from "./ai-prompt-dialog";
import { SaveTemplateDialog } from "./save-template-dialog";
import { SectionRenderer } from "./section-renderer";
import { WidgetConfigDialog } from "./widget-config-dialog";

export function ReportStudioView({ definitionId }: { definitionId?: string }) {
  const workspace = useWorkspace();
  if (!workspace.company) return <NoCompany />;
  return <StudioWorkspace key={`${workspace.user?.id}:${workspace.company.id}:${definitionId || "new"}`} definitionId={definitionId} />;
}

function StudioWorkspace({ definitionId }: { definitionId?: string }) {
  const workspace = useWorkspace();
  const studio = useReportStudio(definitionId);

  // Modals state
  const [aiOpen, setAiOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveAsDashboard, setSaveAsDashboard] = useState(false);
  const [widgetModalOpen, setWidgetModalOpen] = useState(false);
  const [targetSectionId, setTargetSectionId] = useState<string | null>(null);
  const [editingWidget, setEditingWidget] = useState<StudioWidgetSpec | null>(null);

  if (!workspace.company) return <NoCompany />;

  if (definitionId && studio.definitionsLoading) return <LoadingState />;
  if (definitionId && studio.definitionsError) return <ErrorState message={studio.definitionsError.message} />;
  const { spec, preview, busy, error, previewLoading } = studio;

  function handleConvertToDashboard() {
    if (studio.selectedDefinition) {
      studio.setAsDashboard(studio.selectedDefinition.id);
    } else {
      setSaveAsDashboard(true);
      setSaveOpen(true);
    }
  }

  function openAddWidget(sectionId: string) {
    setTargetSectionId(sectionId);
    setEditingWidget(null);
    setWidgetModalOpen(true);
  }

  function openEditWidget(sectionId: string, widget: StudioWidgetSpec) {
    setTargetSectionId(sectionId);
    setEditingWidget(widget);
    setWidgetModalOpen(true);
  }

  function handleSaveWidget(widget: StudioWidgetSpec) {
    if (!targetSectionId) return;
    if (editingWidget) {
      studio.updateWidget(targetSectionId, widget.id, widget);
    } else {
      studio.addWidget(targetSectionId, widget);
    }
  }

  return (
    <>
      {/* Header Bar */}
      <div className="print:hidden">
        <PageHeader
          icon={ChartBarIcon}
          title={spec.title || "گزارش جدید"}
          action={
            <div className="flex flex-wrap items-center gap-2">

              <Button
                variant="soft"
                onClick={() => setAiOpen(true)}
                className="gap-1.5 border-primary/20 bg-primary/10 text-primary hover:bg-primary/15"
              >
                <SparkleIcon size={18} />
                طراحی با هوش مصنوعی
              </Button>

              <Button variant="soft" onClick={() => studio.addSection("grid-2")} className="gap-1.5">
                <PlusIcon size={18} />
                افزودن بخش
              </Button>

              <Button variant="soft" onClick={() => setSaveOpen(true)} className="gap-1.5">
                <FloppyDiskIcon size={18} />
                {studio.selectedDefinition ? "ذخیره تغییرات" : "ذخیره قالب"}
              </Button>

              {studio.selectedDefinition?.is_dashboard ? (
                <Badge tone="primary" className="gap-1.5 py-1.5 font-medium">
                  <CheckCircleIcon size={16} />
                  داشبورد فعال شرکت
                </Badge>
              ) : (
                <Button
                  variant="soft"
                  onClick={handleConvertToDashboard}
                  className="gap-1.5 border-primary/20 bg-primary/10 text-primary hover:bg-primary/15"
                  title="تنظیم این گزارش به‌عنوان داشبورد اصلی شرکت در صفحه نخست"
                >
                  <SquaresFourIcon size={18} />
                  تبدیل به داشبورد
                </Button>
              )}

              <Button
                variant="soft"
                onClick={() => window.print()}
                className="gap-1.5"
                title="خروجی پرینت و PDF"
              >
                <FilePdfIcon size={18} />
                خروجی PDF
              </Button>

              <Button
                variant="ghost"
                onClick={studio.resetToDefault}
                className="p-2 text-muted hover:text-foreground"
                title="بازنشانی"
              >
                <EraserIcon size={18} />
              </Button>
            </div>
          }
        />
      </div>

      <div className="mb-6 space-y-4 print:hidden">
        {studio.aiMessage && (
          <div className="flex items-center gap-2 rounded-panel border border-primary/20 bg-soft-accent/60 p-3 text-xs text-primary animate-[slide-down_240ms_cubic-bezier(0.2,0.7,0.2,1)_both]">
            <SparkleIcon size={18} className="animate-pulse" />
            <span>{studio.aiMessage}</span>
          </div>
        )}

        <FormMessage error>{error?.message}</FormMessage>
      </div>

      {/* PDF Print Header */}
      <div className="hidden print:block mb-8 border-b border-border pb-4">
        <h1 className="font-heading text-2xl font-bold text-foreground">{spec.title}</h1>
        <div className="mt-2 flex items-center gap-4 text-xs text-muted">
          <span>شرکت: {preview?.company_name || workspace.company.name}</span>
          <span>دوره مالی: {preview?.period?.name || "دوره انتخاب نشده"}</span>
          <span>واحد ارقام: {spec.global_filters.unit === "TOMAN" ? "تومان" : "ریال"}</span>
          <span>تاریخ گزارش: {new Date().toLocaleDateString("fa-IR")}</span>
        </div>
      </div>

      {/* Sections Canvas */}
      <div className="space-y-6">
        {previewLoading && (
          <div className="relative h-1 w-full overflow-hidden rounded-full bg-primary-soft">
            <div className="absolute inset-0 bg-primary animate-pulse" />
          </div>
        )}
        {preview && preview.sections.length > 0 ? (
          preview.sections.map((section, idx) => (
            <SectionRenderer
              readOnly={!workspace.canWrite}
              key={section.id}
              section={section}
              index={idx}
              totalSections={preview.sections.length}
              onUpdateBasis={(basis) => studio.updateSection(section.id, { basis })}
              onReorder={(targetIdx) => studio.reorderSection(section.id, targetIdx)}
              onMoveUp={() => studio.moveSection(section.id, "up")}
              onMoveDown={() => studio.moveSection(section.id, "down")}
              onDeleteSection={() => studio.removeSection(section.id)}
              onAddWidget={() => openAddWidget(section.id)}
              onEditWidget={(w) => openEditWidget(section.id, w)}
              onDeleteWidget={(wId) => studio.removeWidget(section.id, wId)}
              onResizeWidget={(wId, colSpan) =>
                studio.updateWidget(section.id, wId, { col_span: colSpan })
              }
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center rounded-panel border border-dashed border-border bg-surface/50 py-16 text-center animate-[scale-in_280ms_cubic-bezier(0.2,0.7,0.2,1)_both]">
            <ChartBarIcon size={48} className="text-muted/60" />
            <h3 className="mt-4 font-heading text-base font-medium text-foreground">
              هنوز هیچ بخشی در این گزارش تعریف نشده است
            </h3>
            <div className="mt-6 flex gap-3">
              <Button variant="primary" onClick={() => setAiOpen(true)} className="gap-1.5">
                <SparkleIcon size={18} />
                طراحی خودکار با هوش مصنوعی
              </Button>
              <Button variant="soft" onClick={() => studio.addSection("grid-2")} className="gap-1.5">
                <PlusIcon size={18} />
                افزودن دستی اولین بخش
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <AiPromptDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        onGenerate={studio.interpretPrompt}
        busy={busy}
      />

      <SaveTemplateDialog
        open={saveOpen}
        onOpenChange={(open) => {
          setSaveOpen(open);
          if (!open) setSaveAsDashboard(false);
        }}
        onSave={(name, isDashboard) => studio.saveTemplate(name, isDashboard)}
        initialName={studio.selectedDefinition?.name || spec.title}
        defaultIsDashboard={saveAsDashboard || !!studio.selectedDefinition?.is_dashboard}
      />

      <WidgetConfigDialog
        open={widgetModalOpen}
        onOpenChange={setWidgetModalOpen}
        initialWidget={editingWidget}
        onSave={handleSaveWidget}
      />
    </>
  );
}
