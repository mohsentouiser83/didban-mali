"use client";
import { useState } from "react";
import { useWorkspace } from "./workspace";
import { useResource } from "./use-resource";
import { useCommand } from "./use-command";
export interface Setup {
  mode: "analysis" | "primary";
  version: number;
  can_manage: boolean;
  posting_available: boolean;
  posting_reason?: string | null;
}
export interface ChartRow {
  code: string;
  name: string;
  active: boolean;
}
export function useCompanyAccountingSetup() {
  const workspace = useWorkspace();
  const resource = useResource<Setup>(
    workspace.companyPath("accounting/setup"),
  );
  const command = useCommand();
  const [selected, setSelected] = useState<Setup["mode"] | null>(null);
  return {
    resource,
    command,
    mode: selected ?? resource.data?.mode ?? "analysis",
    setMode: setSelected,
    save: () =>
      command.run(
        workspace.companyPath("accounting/setup"),
        {
          method: "PATCH",
          version: resource.data?.version,
          body: { mode: selected ?? resource.data?.mode },
        },
        () => {
          setSelected(null);
          resource.refresh();
        },
        "کاربرد حسابداری ذخیره شد.",
      ),
  };
}
export function useChartSetup(onImported: () => void) {
  const workspace = useWorkspace();
  const command = useCommand();
  const base = workspace.companyPath("accounting/setup");
  const [rows, setRows] = useState<ChartRow[]>([]);
  const [page, setPage] = useState(0);
  const [proof, setProof] = useState<{ id: string; key: string } | null>(null);
  const fingerprint = JSON.stringify(rows);
  const previewId = proof?.key === fingerprint ? proof.id : null;
  const loadRows = (next: ChartRow[]) => {
    setRows(next);
    setProof(null);
    setPage(0);
  };
  const loadTemplate = () =>
    command.run<{ rows: ChartRow[] }>(
      base ? base + "/chart-template" : null,
      { method: "GET" },
      (result) => loadRows(result.rows),
    );
  const loadFile = (file: File) => {
    const body = new FormData();
    body.set("file", file);
    return command.run<{ rows: ChartRow[] }>(
      base ? base + "/chart-file" : null,
      { body },
      (result) => loadRows(result.rows),
    );
  };
  const preview = () =>
    command.run<{ preview_id: string }>(
      base ? base + "/chart-preview" : null,
      { body: { rows } },
      (result) => setProof({ id: result.preview_id, key: fingerprint }),
    );
  const apply = () =>
    previewId &&
    command.run(
      base ? base + "/chart-import" : null,
      { body: { preview_id: previewId } },
      () => {
        loadRows([]);
        onImported();
      },
      "کدینگ وارد شد.",
    );
  return {
    command,
    total: rows.length,
    page,
    visibleRows: rows
      .slice(page * 25, (page + 1) * 25)
      .map((row, index) => ({ ...row, index: page * 25 + index })),
    loadTemplate,
    loadFile,
    preview,
    apply,
    previewId,
    change: (index: number, patch: Partial<ChartRow>) =>
      setRows((previous) =>
        previous.map((row, i) => (i === index ? { ...row, ...patch } : row)),
      ),
    previousPage: () => setPage((value) => Math.max(0, value - 1)),
    nextPage: () => setPage((value) => value + 1),
  };
}
