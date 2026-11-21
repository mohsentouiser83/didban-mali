"use client";

import { Button, ButtonLink } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { useReportStudio } from "@/hooks/use-report-studio";
import { useWorkspace } from "@/hooks/workspace";
import type { StudioWidgetSpec } from "@/lib/report-studio";
import {
  ArrowClockwiseIcon,
  ChartBarIcon,
  FilePdfIcon,
  FloppyDiskIcon,
  FolderOpenIcon,
  PlusIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { NoCompany, PageHeader, Panel } from "../page-parts";
import { AiPromptDialog } from "./ai-prompt-dialog";
import { SaveTemplateDialog } from "./save-template-dialog";
import { SectionRenderer } from "./section-renderer";
import { WidgetConfigDialog } from "./widget-config-dialog";

export function ReportStudioView() {
  const workspace = useWorkspace();
  const studio = useReportStudio();

  // Modals state
  const [aiOpen, setAiOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [widgetModalOpen, setWidgetModalOpen] = useState(false);
  const [targetSectionId, setTargetSectionId] = useState<string | null>(null);
  const [editingWidget, setEditingWidget] = useState<StudioWidgetSpec | null>(null);

  if (!workspace.company) return <NoCompany />;

  const { spec, preview, busy, error } = studio;

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
              <ButtonLink href="/reports" variant="ghost">
                بازگشت به گزارش‌ها
              </ButtonLink>

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
                ذخیره قالب
              </Button>

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
                <ArrowClockwiseIcon size={18} />
              </Button>
            </div>
          }
        />
      </div>

      {/* Global Filters & Template Bar */}
      <div className="mb-6 space-y-4 print:hidden">
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              {/* Period Selector */}
              <div className="w-56">
                <label className="mb-1 block text-xs font-medium text-muted">دوره مالی</label>
                <Select
                  value={spec.global_filters.period_id}
                  onValueChange={(val) => studio.updateGlobalFilters({ period_id: val })}
                  options={workspace.periods.map((p) => ({
                    value: p.id,
                    label: p.name,
                  }))}
                />
              </div>

              {/* Currency Unit Switch */}
              <div className="w-36">
                <label className="mb-1 block text-xs font-medium text-muted">واحد ارقام</label>
                <Select
                  value={spec.global_filters.unit}
                  onValueChange={(val) =>
                    studio.updateGlobalFilters({ unit: val as "IRR" | "TOMAN" })
                  }
                  options={[
                    { value: "IRR", label: "ریال" },
                    { value: "TOMAN", label: "تومان" },
                  ]}
                />
              </div>
            </div>

            {/* Saved Templates Quick Bar */}
            {studio.definitions.length > 0 && (
              <div className="flex items-center gap-2">
                <FolderOpenIcon size={16} className="text-muted" />
                <span className="text-xs text-muted">قالب‌های ذخیره‌شده:</span>
                <div className="flex flex-wrap gap-1.5">
                  {studio.definitions.map((def) => (
                    <button
                      key={def.id}
                      type="button"
                      onClick={() => studio.loadTemplate(def)}
                      className={`rounded-control border px-2.5 py-1 text-xs transition-colors ${
                        studio.selectedDefinition?.id === def.id
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-surface text-secondary hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {def.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Panel>

        {studio.aiMessage && (
          <div className="flex items-center gap-2 rounded-panel border border-primary/20 bg-soft-accent/60 p-3 text-xs text-primary">
            <SparkleIcon size={18} />
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
          <span>دوره مالی: {preview?.period.name || "دوره جاری"}</span>
          <span>واحد ارقام: {spec.global_filters.unit === "TOMAN" ? "تومان" : "ریال"}</span>
          <span>تاریخ گزارش: {new Date().toLocaleDateString("fa-IR")}</span>
        </div>
      </div>

      {/* Sections Canvas */}
      <div className="space-y-6">
        {preview && preview.sections.length > 0 ? (
          preview.sections.map((section, idx) => (
            <SectionRenderer
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
          <div className="flex flex-col items-center justify-center rounded-panel border border-dashed border-border bg-surface/50 py-16 text-center">
            <ChartBarIcon size={48} className="text-muted/60" />
            <h3 className="mt-4 font-heading text-base font-medium text-foreground">
              هنوز هیچ بخشی در این گزارش تعریف نشده است
            </h3>
            <p className="mt-1 text-xs text-muted">
              می‌توانید با دستیار هوشمند در چند ثانیه یک داشبورد کامل بسازید، یا سکشن‌های خود را دستی اضافه کنید.
            </p>
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
        onOpenChange={setSaveOpen}
        onSave={studio.saveTemplate}
        initialName={spec.title}
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
