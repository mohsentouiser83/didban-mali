"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "./workspace";
import { useCommand } from "./use-command";
import { api } from "@/lib/api";
import {
  createDefaultStudioSpec,
  type StudioBasisType,
  type StudioDefinition,
  type StudioGlobalFilters,
  type StudioLayoutSpec,
  type StudioLayoutType,
  type StudioPreviewResult,
  type StudioSectionSpec,
  type StudioWidgetSpec,
} from "@/lib/report-studio";

export function useReportStudio(initialDefinitionId?: string) {
  const workspace = useWorkspace();
  const command = useCommand();
  const generation = useRef(0);

  const [spec, setSpec] = useState<StudioLayoutSpec>(() =>
    createDefaultStudioSpec(workspace.periodId, "IRR"),
  );
  const [preview, setPreview] = useState<StudioPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<Error | null>(null);
  const [definitions, setDefinitions] = useState<StudioDefinition[]>([]);
  const [selectedDefinition, setSelectedDefinition] = useState<StudioDefinition | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiMessage, setAiMessage] = useState("");

  const companyId = workspace.company?.id;

  // Load saved templates
  function loadDefinitions() {
    const path = workspace.companyPath("report-studio/definitions");
    if (!path) return;
    api<StudioDefinition[]>(path)
      .then((result) => {
        if (Array.isArray(result)) {
          setDefinitions(result);
        }
      })
      .catch(() => {});
  }

  const definitionsPath = workspace.companyPath("report-studio/definitions");
  const [definitionsLoading, setDefinitionsLoading] = useState(true);
  const [definitionsError, setDefinitionsError] = useState<Error | null>(null);
  useEffect(() => {
    if (!definitionsPath) return;
    let active = true;
    api<StudioDefinition[]>(definitionsPath)
      .then((result) => {
        if (!active) return;
        setDefinitions(result);
        if (initialDefinitionId) {
          const definition = result.find(({ id }) => id === initialDefinitionId);
          if (!definition) throw new Error("قالب گزارش یافت نشد.");
          setSelectedDefinition(definition);
          setSpec(definition.spec);
        }
      })
      .catch((error: Error) => { if (active) setDefinitionsError(error); })
      .finally(() => { if (active) setDefinitionsLoading(false); });
    return () => { active = false; };
  }, [definitionsPath, initialDefinitionId]);

  // Fetch live preview of current spec
  const fetchPreview = useCallback(
    (specToPreview = spec) => {
      const path = workspace.companyPath("report-studio/preview");
      if (!path || !specToPreview.global_filters.period_id) return;
      generation.current += 1;
      const currentGen = generation.current;
      setPreviewLoading(true);
      setPreviewError(null);

      api<StudioPreviewResult>(path, {
        method: "POST",
        body: { spec: specToPreview },
      })
        .then((result) => {
          if (currentGen !== generation.current) return;
          setPreview(result);
        })
        .catch((err) => {
          if (currentGen !== generation.current) return;
          setPreviewError(err);
        })
        .finally(() => {
          if (currentGen === generation.current) {
            setPreviewLoading(false);
          }
        });
    },
    [workspace, spec],
  );

  // The header owns the period, including when loading a stored template.
  const [prevPeriod, setPrevPeriod] = useState(workspace.periodId);
  if (workspace.periodId !== prevPeriod || spec.global_filters.period_id !== workspace.periodId) {
    setPrevPeriod(workspace.periodId);
    setSpec((prev) => ({
      ...prev,
      global_filters: { ...prev.global_filters, period_id: workspace.periodId },
    }));
  }

  // Initial preview on load and live updates on spec change
  const periodId = spec.global_filters.period_id;

  useEffect(() => {
    if (!companyId || !periodId || (initialDefinitionId && definitionsLoading) || definitionsError) return;
    let active = true;

    const timer = setTimeout(() => {
      if (active) {
        fetchPreview(spec);
      }
    }, 0);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [companyId, periodId, spec, fetchPreview, initialDefinitionId, definitionsLoading, definitionsError]);

  function updateGlobalFilters(updates: Partial<StudioGlobalFilters>) {
    setSpec((prev) => ({
      ...prev,
      global_filters: { ...prev.global_filters, ...updates },
      sections: updates.unit ? prev.sections.map(section => ({ ...section,
        widgets: section.widgets.map(widget => ({ ...widget, unit: updates.unit! })),
      })) : prev.sections,
    }));
  }

  function addSection(layout: StudioLayoutType = "grid-2", basis: StudioBasisType = "all") {
    const newSection: StudioSectionSpec = {
      id: `sec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: "سکشن جدید",
      layout,
      basis,
      widgets: [],
    };
    setSpec((prev) => ({
      ...prev,
      sections: [...prev.sections, newSection],
    }));
  }

  function reorderSection(sectionId: string, targetIndex: number) {
    setSpec((prev) => {
      const currentIndex = prev.sections.findIndex((s) => s.id === sectionId);
      if (currentIndex === -1 || targetIndex === currentIndex) return prev;
      if (targetIndex < 0 || targetIndex >= prev.sections.length) return prev;
      const newSections = [...prev.sections];
      const [moved] = newSections.splice(currentIndex, 1);
      newSections.splice(targetIndex, 0, moved);
      return { ...prev, sections: newSections };
    });
  }

  function removeSection(sectionId: string) {
    setSpec((prev) => ({
      ...prev,
      sections: prev.sections.filter((s) => s.id !== sectionId),
    }));
  }

  function updateSection(sectionId: string, updates: Partial<StudioSectionSpec>) {
    setSpec((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => (s.id === sectionId ? { ...s, ...updates } : s)),
    }));
  }

  function moveSection(sectionId: string, direction: "up" | "down") {
    setSpec((prev) => {
      const index = prev.sections.findIndex((s) => s.id === sectionId);
      if (index === -1) return prev;
      if (direction === "up" && index === 0) return prev;
      if (direction === "down" && index === prev.sections.length - 1) return prev;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      const newSections = [...prev.sections];
      const temp = newSections[index];
      newSections[index] = newSections[targetIndex];
      newSections[targetIndex] = temp;
      return { ...prev, sections: newSections };
    });
  }

  function addWidget(sectionId: string, widget: StudioWidgetSpec) {
    setSpec((prev) => ({
      ...prev,
      sections: prev.sections.map((s) =>
        s.id === sectionId ? { ...s, widgets: [...s.widgets, widget] } : s,
      ),
    }));
  }

  function removeWidget(sectionId: string, widgetId: string) {
    setSpec((prev) => ({
      ...prev,
      sections: prev.sections.map((s) =>
        s.id === sectionId
          ? { ...s, widgets: s.widgets.filter((w) => w.id !== widgetId) }
          : s,
      ),
    }));
  }

  function updateWidget(
    sectionId: string,
    widgetId: string,
    updates: Partial<StudioWidgetSpec>,
  ) {
    setSpec((prev) => ({
      ...prev,
      sections: prev.sections.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              widgets: s.widgets.map((w) =>
                w.id === widgetId ? { ...w, ...updates } : w,
              ),
            }
          : s,
      ),
    }));
  }

  function interpretPrompt(promptText: string) {
    if (!promptText.trim() || !workspace.company) return;
    setAiMessage("");
    void command.run<StudioLayoutSpec>(
      workspace.companyPath("report-studio/interpret"),
      {
        body: {
          prompt: promptText.trim(),
          period_id: spec.global_filters.period_id,
          unit: spec.global_filters.unit,
        },
      },
      (result) => {
        if (result && result.sections) {
          setSpec(result);
          setAiMessage("داشبورد هوشمند بر اساس درخواست شما پیکربندی شد.");
          fetchPreview(result);
        }
      },
    );
  }

  function saveTemplate(name: string, isDashboard?: boolean) {
    if (!name.trim() || !workspace.company) return;
    const savingSpec = { ...spec, title: name.trim() };
    void command.run<StudioDefinition>(
      workspace.companyPath(selectedDefinition
        ? `report-studio/definitions/${selectedDefinition.id}`
        : "report-studio/definitions"),
      {
        method: selectedDefinition ? "PATCH" : "POST",
        version: selectedDefinition?.version,
        body: {
          name: name.trim(), spec: savingSpec,
          is_dashboard: isDashboard ?? selectedDefinition?.is_dashboard ?? false,
        },
      },
      (result) => {
        loadDefinitions();
        setTemplateName("");
        setSelectedDefinition(result);
        setSpec(savingSpec);
      },
      "قالب گزارش ذخیره شد.",
    );
  }

  function setAsDashboard(definitionId?: string) {
    const targetId = definitionId || selectedDefinition?.id;
    if (!targetId || !workspace.company) return;
    if (selectedDefinition?.system_key && selectedDefinition.version === 1) {
      saveTemplate(selectedDefinition.name, true);
      return;
    }
    void command.run<{ id: string; name: string; version: number; is_dashboard: boolean }>(
      workspace.companyPath(`report-studio/definitions/${targetId}/set-dashboard`),
      { method: "POST" },
      (result) => {
        loadDefinitions();
        setSelectedDefinition((prev) =>
          prev ? { ...prev, version: result.version, is_dashboard: true } : prev,
        );
      },
    );
  }

  function resetActiveDashboard() {
    if (!workspace.company) return;
    void command.run<{ has_custom_dashboard: boolean }>(
      workspace.companyPath("report-studio/active-dashboard/reset"),
      { method: "POST" },
      () => {
        loadDefinitions();
        setSelectedDefinition((prev) =>
          prev ? { ...prev, is_dashboard: false } : prev,
        );
      },
    );
  }

  function loadTemplate(def: StudioDefinition) {
    if (def.spec) {
      setSelectedDefinition(def);
      setSpec(def.spec);
      fetchPreview({ ...def.spec, global_filters: { ...def.spec.global_filters, period_id: workspace.periodId } });
    }
  }

  function resetToDefault() {
    const fresh = createDefaultStudioSpec(workspace.periodId, "IRR");
    setSelectedDefinition(null);
    setSpec(fresh);
    fetchPreview(fresh);
  }

  return {
    spec,
    setSpec,
    definitionsLoading,
    definitionsError,
    preview,
    previewLoading,
    previewError,
    definitions,
    selectedDefinition,
    templateName,
    setTemplateName,
    aiPrompt,
    setAiPrompt,
    aiMessage,
    busy: command.busy || previewLoading,
    error: command.error || definitionsError || previewError,
    updateGlobalFilters,
    addSection,
    removeSection,
    updateSection,
    moveSection,
    reorderSection,
    addWidget,
    removeWidget,
    updateWidget,
    fetchPreview,
    interpretPrompt,
    saveTemplate,
    setAsDashboard,
    resetActiveDashboard,
    loadTemplate,
    resetToDefault,
  };
}

export type ReportStudioController = ReturnType<typeof useReportStudio>;
