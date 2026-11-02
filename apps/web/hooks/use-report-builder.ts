"use client";
import { useRef, useState } from "react";
import { useWorkspace } from "./workspace";
import { useCommand } from "./use-command";
import { usePagedResource } from "./use-paged-resource";
import {
  defaultSpec,
  metricOptions,
  nativeMetricOptions,
  type BuilderSpec,
  type BuilderSnapshot,
  type BuilderDefinition,
  type BuilderRun,
} from "@/lib/report-builder";

export function useReportBuilder() {
  const workspace = useWorkspace();
  const command = useCommand();
  const selectionGeneration = useRef(0);
  const definitions = usePagedResource<BuilderDefinition>(
    workspace.companyPath("report-builder/definitions"),
  );
  const [spec, setSpec] = useState<BuilderSpec>(() =>
    defaultSpec(workspace.periodId),
  );
  const runs = usePagedResource<BuilderRun>(
    workspace.companyPath(
      `report-builder/runs?source=${spec.source || "imported_manifest"}`,
    ),
  );
  const availableMetrics =
    spec.source === "native_statement" ? nativeMetricOptions : metricOptions;
  const [name, setName] = useState("");
  const [question, setQuestion] = useState("");
  const [message, setMessage] = useState("");
  const [definition, setDefinition] = useState<BuilderDefinition>();
  const [preview, setPreviewState] = useState<BuilderSnapshot>();
  const [resultPage, setResultPage] = useState(0);
  function setPreview(value: BuilderSnapshot | undefined) {
    setPreviewState(value);
    setResultPage(0);
  }
  const [savedRun, setSavedRun] = useState<BuilderRun>();
  function change(next: BuilderSpec) {
    selectionGeneration.current += 1;
    setSpec(next);
    setPreview(undefined);
    setSavedRun(undefined);
    command.clearError();
  }
  function selectSource(source: BuilderSpec["source"]) {
    setDefinition(undefined);
    change(defaultSpec(spec.period_id, "metrics", source));
  }
  function selectKind(kind: BuilderSpec["kind"]) {
    change(defaultSpec(spec.period_id, kind, spec.source));
  }
  function selectBasis(basis: BuilderSpec["basis"]) {
    change({
      ...spec,
      basis,
      metric_keys: availableMetrics
        .filter((option) => option.basis === basis)
        .slice(0, 1)
        .map((option) => option.value),
    });
  }
  function toggle(key: "metric_keys" | "columns", value: string) {
    const values = spec[key].includes(value)
      ? spec[key].filter((item) => item !== value)
      : [...spec[key], value];
    change({ ...spec, [key]: values });
  }
  function open(item: BuilderDefinition) {
    setDefinition(item);
    setName(item.name);
    change(item.spec);
  }
  function startNew() {
    setDefinition(undefined);
    setName("");
    change(defaultSpec(workspace.periodId, "metrics", spec.source));
  }
  function interpret() {
    const generation = selectionGeneration.current;
    if (!question.trim() || !spec.period_id) return;
    void command.run<{ status: string; spec?: BuilderSpec; message?: string }>(
      workspace.companyPath("report-builder/interpret"),
      {
        body: {
          question: question.trim(),
          period_id: spec.period_id,
          source: spec.source || "imported_manifest",
        },
      },
      (result) => {
        if (generation !== selectionGeneration.current) return;
        setMessage(
          result.message || "پیشنهاد آماده است؛ انتخاب‌ها را بررسی کنید.",
        );
        if (result.spec) change(result.spec);
      },
    );
  }
  function buildPreview() {
    const generation = selectionGeneration.current;
    void command.run<BuilderSnapshot>(
      workspace.companyPath("report-builder/preview"),
      { body: { spec } },
      (result) => {
        if (generation !== selectionGeneration.current) return;
        setPreview(result);
        setSavedRun(undefined);
      },
    );
  }
  function save() {
    if (!preview || !name.trim()) return;
    void command.run<{ definition: BuilderDefinition; run: BuilderRun }>(
      workspace.companyPath(
        `report-builder/definitions${definition ? `/${definition.id}` : ""}`,
      ),
      {
        method: definition ? "PATCH" : "POST",
        version: definition?.version,
        body: {
          name: name.trim(),
          spec,
          preview_manifest_id: preview.manifest_id,
          preview_native_statement_id: preview.native_statement_id,
          preview_native_invoice_snapshot_id:
            preview.native_invoice_snapshot_id,
        },
      },
      (result) => {
        setDefinition(result.definition);
        setPreview(result.run.snapshot);
        setSavedRun(result.run);
        definitions.refresh();
        runs.refresh();
      },
      "گزارش ذخیره شد.",
    );
  }
  function rerun(item: BuilderDefinition) {
    void command.run<BuilderRun>(
      workspace.companyPath(`report-builder/definitions/${item.id}/runs`),
      { body: { expected_version: item.version } },
      (result) => {
        open(item);
        setPreview(result.snapshot);
        setSavedRun(result);
        runs.refresh();
      },
      "نسخهٔ تازهٔ گزارش ساخته شد.",
    );
  }
  function viewRun(item: BuilderRun) {
    void command.run<BuilderRun>(
      workspace.companyPath(`report-builder/runs/${item.id}`),
      { method: "GET" },
      (result) => {
        setPreview(result.snapshot);
        setSavedRun(result);
        setSpec(result.snapshot.spec);
        setName(result.snapshot.title || "");
        setDefinition(undefined);
      },
    );
  }
  return {
    resultPage,
    setResultPage,
    visibleRows:
      preview?.rows.slice(resultPage * 25, (resultPage + 1) * 25) || [],
    workspace,
    command,
    definitions,
    runs,
    spec,
    name,
    setName,
    question,
    setQuestion,
    message,
    definition,
    preview,
    savedRun,
    change,
    selectSource,
    availableMetrics,
    selectKind,
    selectBasis,
    toggle,
    open,
    startNew,
    interpret,
    buildPreview,
    save,
    rerun,
    viewRun,
  };
}
export type ReportBuilderController = ReturnType<typeof useReportBuilder>;
