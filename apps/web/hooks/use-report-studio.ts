"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "./workspace";
import { useCommand } from "./use-command";
import { api } from "@/lib/api";
import {
  createDefaultStudioSpec,
  type StudioDefinition,
  type StudioGlobalFilters,
  type StudioLayoutSpec,
  type StudioLayoutType,
  type StudioPreviewResult,
  type StudioSectionSpec,
  type StudioWidgetSpec,
} from "@/lib/report-studio";

export function useReportStudio() {
  const workspace = useWorkspace();
  const command = useCommand();
  const generation = useRef(0);

  const [spec, setSpec] = useState<StudioLayoutSpec>(() =>
    createDefaultStudioSpec(workspace.periodId || "default-period", "IRR"),
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

  useEffect(() => {
    if (!companyId) return;
    let active = true;
    const path = workspace.companyPath("report-studio/definitions");
    if (!path) return;

    api<StudioDefinition[]>(path)
      .then((result) => {
        if (active && Array.isArray(result)) {
          setDefinitions(result);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [companyId, workspace]);

  // Fetch live preview of current spec
  function fetchPreview(specToPreview = spec) {
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
  }

  // Initial preview on load
  const periodId = spec.global_filters.period_id;
  useEffect(() => {
    if (workspace.periodId && (!spec.global_filters.period_id || spec.global_filters.period_id === "default-period")) {
      setSpec((prev) => {
        const next = {
          ...prev,
          global_filters: { ...prev.global_filters, period_id: workspace.periodId },
        };
        fetchPreview(next);
        return next;
      });
    }
  }, [workspace.periodId]);

  useEffect(() => {
    if (!companyId || !periodId) return;
    let active = true;
    const path = workspace.companyPath("report-studio/preview");
    if (!path) return;

    api<StudioPreviewResult>(path, {
      method: "POST",
      body: { spec },
    })
      .then((res) => {
        if (active) setPreview(res);
      })
      .catch((err) => {
        if (active) setPreviewError(err);
      });

    return () => {
      active = false;
    };
  }, [companyId, periodId, spec, workspace]);

  function updateGlobalFilters(updates: Partial<StudioGlobalFilters>) {
    setSpec((prev) => {
      const next = {
        ...prev,
        global_filters: { ...prev.global_filters, ...updates },
      };
      fetchPreview(next);
      return next;
    });
  }

  function addSection(layout: StudioLayoutType = "grid-2") {
    const newSection: StudioSectionSpec = {
      id: `sec-${Date.now()}`,
      title: "سکشن جدید",
      layout,
      widgets: [],
    };
    setSpec((prev) => {
      const next = { ...prev, sections: [...prev.sections, newSection] };
      fetchPreview(next);
      return next;
    });
  }

  function removeSection(sectionId: string) {
    setSpec((prev) => {
      const next = {
        ...prev,
        sections: prev.sections.filter((s) => s.id !== sectionId),
      };
      fetchPreview(next);
      return next;
    });
  }

  function updateSection(sectionId: string, updates: Partial<StudioSectionSpec>) {
    setSpec((prev) => {
      const next = {
        ...prev,
        sections: prev.sections.map((s) => (s.id === sectionId ? { ...s, ...updates } : s)),
      };
      fetchPreview(next);
      return next;
    });
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
      const next = { ...prev, sections: newSections };
      fetchPreview(next);
      return next;
    });
  }

  function addWidget(sectionId: string, widget: StudioWidgetSpec) {
    setSpec((prev) => {
      const next = {
        ...prev,
        sections: prev.sections.map((s) =>
          s.id === sectionId ? { ...s, widgets: [...s.widgets, widget] } : s,
        ),
      };
      fetchPreview(next);
      return next;
    });
  }

  function removeWidget(sectionId: string, widgetId: string) {
    setSpec((prev) => {
      const next = {
        ...prev,
        sections: prev.sections.map((s) =>
          s.id === sectionId
            ? { ...s, widgets: s.widgets.filter((w) => w.id !== widgetId) }
            : s,
        ),
      };
      fetchPreview(next);
      return next;
    });
  }

  function updateWidget(
    sectionId: string,
    widgetId: string,
    updates: Partial<StudioWidgetSpec>,
  ) {
    setSpec((prev) => {
      const next = {
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
      };
      fetchPreview(next);
      return next;
    });
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

  function saveTemplate(name: string) {
    if (!name.trim() || !workspace.company) return;
    void command.run<{ id: string; name: string }>(
      workspace.companyPath("report-studio/definitions"),
      {
        body: {
          name: name.trim(),
          spec,
        },
      },
      () => {
        loadDefinitions();
        setTemplateName("");
      },
    );
  }

  function loadTemplate(def: StudioDefinition) {
    if (def.spec) {
      setSelectedDefinition(def);
      setSpec(def.spec);
      fetchPreview(def.spec);
    }
  }

  function resetToDefault() {
    const fresh = createDefaultStudioSpec(workspace.periodId || "default-period", "IRR");
    setSelectedDefinition(null);
    setSpec(fresh);
    fetchPreview(fresh);
  }

  return {
    spec,
    setSpec,
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
    error: command.error || previewError,
    updateGlobalFilters,
    addSection,
    removeSection,
    updateSection,
    moveSection,
    addWidget,
    removeWidget,
    updateWidget,
    fetchPreview,
    interpretPrompt,
    saveTemplate,
    loadTemplate,
    resetToDefault,
  };
}

export type ReportStudioController = ReturnType<typeof useReportStudio>;
