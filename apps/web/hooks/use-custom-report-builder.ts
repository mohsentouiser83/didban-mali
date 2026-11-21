"use client";

import { useEffect, useState, useCallback } from "react";
import { useWorkspace } from "./workspace";
import { useCommand } from "./use-command";
import { api } from "@/lib/api";
import type {
  BlockResult,
  CustomReportBlock,
  EntityFieldRegistry,
  ReportDataSource,
} from "@/lib/custom-reports";

export function useCustomReportBuilder() {
  const workspace = useWorkspace();
  const command = useCommand();

  const [dataSources, setDataSources] = useState<ReportDataSource[]>([]);
  const [registries, setRegistries] = useState<Record<string, EntityFieldRegistry>>({});
  const [activeBlockId, setActiveBlockId] = useState<string | null>("block-1");
  const [reportName, setReportName] = useState("گزارش تحلیلی مالی جدید");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [blockPreviews, setBlockPreviews] = useState<Record<string, BlockResult>>({});

  const [blocks, setBlocks] = useState<CustomReportBlock[]>([
    {
      id: "block-1",
      title: "اسناد حسابداری اخیر",
      entity_type: "journal_lines",
      visualization: "data_table",
      filters: [],
      columns: ["date", "entry_id", "account", "party_id", "debit", "credit"],
      group_by: "account",
      aggregation: { function: "sum", field: "debit" },
      metrics: [
        { function: "count", label_fa: "تعداد ردیف‌ها", unit: "ردیف" },
        { function: "sum", field: "debit", label_fa: "مجموع بدهکار", unit: "ریال" },
      ],
      width: 12,
    },
  ]);

  const [savedDefinitions, setSavedDefinitions] = useState<
    Array<{
      id: string;
      name: string;
      version: number;
      created_at: string | null;
      spec: { blocks?: CustomReportBlock[] };
    }>
  >([]);
  const [exporting, setExporting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState("");

  const activeBlock = blocks.find((b) => b.id === activeBlockId) || blocks[0] || null;

  // Load Saved Report Definitions
  const loadDefinitions = useCallback(async () => {
    if (!workspace.company?.id) return;
    const path = workspace.companyPath("report-builder/custom-definitions");
    if (!path) return;
    try {
      const items = await api<
        Array<{
          id: string;
          name: string;
          version: number;
          created_at: string | null;
          spec: { blocks?: CustomReportBlock[] };
        }>
      >(path);
      if (Array.isArray(items)) {
        setSavedDefinitions(items);
      }
    } catch {
      // ignore
    }
  }, [workspace]);

  useEffect(() => {
    let active = true;
    if (!workspace.company?.id) return;
    const path = workspace.companyPath("report-builder/custom-definitions");
    if (!path) return;
    api<
      Array<{
        id: string;
        name: string;
        version: number;
        created_at: string | null;
        spec: { blocks?: CustomReportBlock[] };
      }>
    >(path)
      .then((items) => {
        if (active && Array.isArray(items)) {
          setSavedDefinitions(items);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [workspace.company?.id, workspace]);

  // Load Data Sources Catalog
  useEffect(() => {
    if (!workspace.company?.id) return;
    const path = workspace.companyPath("report-builder/data-sources");
    if (!path) return;

    api<{ data_sources: ReportDataSource[] }>(path)
      .then((res) => {
        if (res && Array.isArray(res.data_sources)) {
          setDataSources(res.data_sources);
        }
      })
      .catch(() => {});
  }, [workspace.company?.id, workspace]);

  // Load Registry for an entity type if not yet cached
  const loadRegistry = useCallback(
    async (entityType: string): Promise<EntityFieldRegistry | null> => {
      if (registries[entityType]) return registries[entityType];
      const path = workspace.companyPath(`report-builder/field-registry/${entityType}`);
      if (!path) return null;

      try {
        const reg = await api<EntityFieldRegistry>(path);
        if (reg && reg.entity_type) {
          setRegistries((prev) => ({ ...prev, [entityType]: reg }));
          return reg;
        }
      } catch {
        // ignore
      }
      return null;
    },
    [workspace, registries],
  );

  // Load registry for active block
  useEffect(() => {
    const entityType = activeBlock?.entity_type;
    if (!entityType || !workspace.company?.id || registries[entityType]) return;
    let active = true;
    const path = workspace.companyPath(`report-builder/field-registry/${entityType}`);
    if (!path) return;
    api<EntityFieldRegistry>(path)
      .then((reg) => {
        if (active && reg?.entity_type) {
          setRegistries((prev) => ({ ...prev, [entityType]: reg }));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [activeBlock?.entity_type, workspace.company?.id, workspace, registries]);

  // Preview a single block
  const fetchBlockPreview = useCallback(
    async (block: CustomReportBlock) => {
      if (!workspace.company?.id) return;
      const path = workspace.companyPath("report-builder/block-preview");
      if (!path) return;

      setPreviewLoading(true);
      try {
        const result = await api<BlockResult>(path, {
          method: "POST",
          body: {
            block,
            period_id: workspace.periodId || null,
            limit: 200,
          },
        });
        setBlockPreviews((prev) => ({ ...prev, [block.id]: result }));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطا در دریافت پیش‌نمایش بلاک";
        setBlockPreviews((prev) => ({
          ...prev,
          [block.id]: {
            entity_type: block.entity_type,
            visualization: block.visualization,
            columns: [],
            rows: [],
            total: 0,
            chart_data: { labels: [], datasets: [] },
            metrics: [],
            error: msg,
          },
        }));
      } finally {
        setPreviewLoading(false);
      }
    },
    [workspace],
  );

  // Fetch previews for active block or whenever block updates
  useEffect(() => {
    if (activeBlock) {
      const timeout = setTimeout(() => {
        void fetchBlockPreview(activeBlock);
      }, 250);
      return () => clearTimeout(timeout);
    }
  }, [activeBlock, fetchBlockPreview]);

  // Block management functions
  function addBlock(initial?: Partial<CustomReportBlock>) {
    const nextId = `block-${Date.now().toString(36)}`;
    const newBlock: CustomReportBlock = {
      id: nextId,
      title: initial?.title || "بلاک تحلیلی جدید",
      entity_type: initial?.entity_type || "journal_lines",
      visualization: initial?.visualization || "data_table",
      filters: initial?.filters || [],
      columns: initial?.columns || ["date", "entry_id", "account", "debit", "credit"],
      group_by: initial?.group_by || "account",
      aggregation: initial?.aggregation || { function: "count", field: null },
      metrics: initial?.metrics || [{ function: "count", label_fa: "تعداد کل" }],
      width: initial?.width || 12,
    };
    setBlocks((prev) => [...prev, newBlock]);
    setActiveBlockId(nextId);
  }

  function updateBlock(id: string, patch: Partial<CustomReportBlock>) {
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b;
        return { ...b, ...patch };
      }),
    );
  }

  function removeBlock(id: string) {
    setBlocks((prev) => {
      const next = prev.filter((b) => b.id !== id);
      if (activeBlockId === id) {
        setActiveBlockId(next[0]?.id || null);
      }
      return next;
    });
  }

  function duplicateBlock(id: string) {
    const src = blocks.find((b) => b.id === id);
    if (!src) return;
    const nextId = `block-${Date.now().toString(36)}`;
    const copy: CustomReportBlock = {
      ...src,
      id: nextId,
      title: `${src.title} (کپی)`,
    };
    setBlocks((prev) => [...prev, copy]);
    setActiveBlockId(nextId);
  }

  function moveBlock(id: string, direction: "up" | "down") {
    setBlocks((prev) => {
      const index = prev.findIndex((b) => b.id === id);
      if (index === -1) return prev;
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  }

  // AI Composer
  async function aiCompose() {
    if (!aiPrompt.trim() || !workspace.company?.id) return;
    const path = workspace.companyPath("report-builder/ai-compose");
    if (!path) return;

    setAiLoading(true);
    setAiMessage("");
    try {
      const res = await api<{
        title: string;
        entity_type: string;
        visualization: CustomReportBlock["visualization"];
        filters: CustomReportBlock["filters"];
        columns: string[];
        group_by: string;
        aggregation: CustomReportBlock["aggregation"];
        metrics: CustomReportBlock["metrics"];
        explanation?: string;
      }>(path, {
        method: "POST",
        body: { prompt: aiPrompt.trim() },
      });

      if (res && res.entity_type) {
        addBlock(res);
        setAiMessage(res.explanation || "بلاک گزارش با موفقیت تولید و افزوده شد.");
        setAiPrompt("");
      }
    } catch (err: unknown) {
      setAiMessage(err instanceof Error ? err.message : "خطا در پردازش درخواست هوش مصنوعی");
    } finally {
      setAiLoading(false);
    }
  }

  // Save report definition template
  async function saveReportTemplate() {
    if (!reportName.trim() || !workspace.company?.id) return;
    const path = workspace.companyPath("report-builder/custom-definitions");
    if (!path) return;

    try {
      await api(path, {
        method: "POST",
        body: {
          name: reportName.trim(),
          blocks,
          period_id: workspace.periodId || null,
        },
      });
      setSaveSuccess("قالب گزارش با موفقیت ذخیره شد.");
      void loadDefinitions();
      setTimeout(() => setSaveSuccess(""), 4000);
    } catch (err: unknown) {
      setSaveSuccess(err instanceof Error ? err.message : "خطا در ذخیره گزارش");
    }
  }

  // Load a saved report template
  function loadReportTemplate(def: (typeof savedDefinitions)[0]) {
    setReportName(def.name);
    if (def.spec?.blocks && Array.isArray(def.spec.blocks) && def.spec.blocks.length) {
      setBlocks(def.spec.blocks);
      setActiveBlockId(def.spec.blocks[0].id);
    }
  }

  // Export report to XLSX or PDF
  async function exportReport(format: "xlsx" | "pdf") {
    if (!workspace.company?.id) return;
    setExporting(true);
    const path = workspace.companyPath("report-builder/export");
    if (!path) return;

    try {
      const blocksResults = blocks.map((b) => {
        const prev = blockPreviews[b.id];
        return {
          title: b.title,
          entity_type: b.entity_type,
          columns: prev?.columns || [],
          rows: prev?.rows || [],
        };
      });

      const response = await fetch("/api/v1" + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          report_name: reportName,
          blocks_results: blocksResults,
          format,
        }),
      });

      if (!response.ok) {
        throw new Error("خطا در تولید فایل خروجی");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${reportName}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "خطا در دریافت خروجی");
    } finally {
      setExporting(false);
    }
  }

  return {
    dataSources,
    registries,
    loadRegistry,
    activeBlock,
    activeBlockId,
    setActiveBlockId,
    blocks,
    setBlocks,
    blockPreviews,
    previewLoading,
    reportName,
    setReportName,
    aiPrompt,
    setAiPrompt,
    aiLoading,
    aiMessage,
    aiCompose,
    addBlock,
    updateBlock,
    removeBlock,
    duplicateBlock,
    moveBlock,
    fetchBlockPreview,
    savedDefinitions,
    saveReportTemplate,
    loadReportTemplate,
    saveSuccess,
    exportReport,
    exporting,
    command,
  };
}

export type CustomReportBuilderController = ReturnType<typeof useCustomReportBuilder>;
