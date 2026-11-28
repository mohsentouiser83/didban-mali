"use client";
import { useState } from "react";
import { useWorkspace } from "./workspace";
import { useResource } from "./use-resource";
import { useCommand } from "./use-command";
import { useTableColumnFilters } from "./use-table-column-filters";
import { accountLevelLabel, validateAccountCodePattern, type AccountLevel } from "@/lib/account-catalogue";
import { accountNatureLabel, type AccountNature } from "@/lib/accounting";
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
  nature?: AccountNature;
  active: boolean;
  level?: AccountLevel | null;
  parent_code?: string | null;
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
    postingStatus: resource.data?.posting_available
      ? "ثبت قطعی در دسترس"
      : "ثبت قطعی ناموجود",
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
  const [selectedPage, setPage] = useState(0);
  const [proof, setProof] = useState<{ id: string; key: string } | null>(null);
  const fingerprint = JSON.stringify(rows);
  const previewId = proof?.key === fingerprint ? proof.id : null;
  const codeSet = new Map<string, number>();
  for (const r of rows) {
    const code = (r.code || "").trim();
    if (code) codeSet.set(code, (codeSet.get(code) ?? 0) + 1);
  }
  const validateRow = (row: ChartRow) => {
    const code = (row.code || "").trim();
    const name = (row.name || "").trim();
    if (!code) return "کد حساب خالی است.";
    if ((codeSet.get(code) ?? 0) > 1) return "کد در جدول تکراری است.";
    if (!name) return "نام حساب خالی است.";
    const parentCode = row.parent_code?.trim();
    if ((row.level === "general" || row.level === "subsidiary") && !parentCode) return "کد بالادست لازم است.";
    if (row.level === "group" && parentCode) return "حساب گروه بالادست ندارد.";
    return row.level ? validateAccountCodePattern(code, row.level, parentCode) : undefined;
  };
  const reviewedRows = rows.map((row, index) => ({
    ...row, index,
    error: command.error?.fields?.[`chart-row-${index}`] ?? validateRow(row),
    parentRequired: row.level === "general" || row.level === "subsidiary",
  }));
  const invalidCount = reviewedRows.filter((row) => row.error).length;
  const filters = useTableColumnFilters(reviewedRows, {
    code: (row) => row.code,
    name: (row) => row.name,
    level: (row) => accountLevelLabel(row.level),
    parent: (row) => row.parent_code || "—",
    nature: (row) => accountNatureLabel(row.nature ?? "debit"),
    active: (row) => row.active ? "فعال" : "غیرفعال",
    status: (row) => row.error ? "خطادار" : (previewId ? "آماده ورود" : "آماده بررسی"),
  });
  const filteredRows = filters.rows;
  const pageSize = 25;
  const page = Math.min(selectedPage, Math.max(0, Math.ceil(filteredRows.length / pageSize) - 1));
  const loadRows = (next: ChartRow[]) => {
    command.clearError();
    setRows(next);
    setProof(null);
    filters.reset();
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
  const preview = () => {
    if (command.busy) return;
    setProof(null);
    return command.run<{ preview_id: string }>(
      base ? base + "/chart-preview" : null,
      { body: { rows } },
      (result) => setProof({ id: result.preview_id, key: fingerprint }),
    );
  };
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
    filteredTotal: filteredRows.length,
    invalidCount,
    page,
    pageSize,
    visibleRows: filteredRows.slice(page * pageSize, (page + 1) * pageSize),
    columnFilter: (key: Parameters<typeof filters.bind>[0]) => filters.bind(key, () => setPage(0)),
    loadTemplate,
    loadFile,
    preview,
    apply,
    previewId,
    change: (index: number, patch: Partial<ChartRow>) => {
      command.clearError();
      setRows((previous) => previous.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    },
    previousPage: () => setPage(Math.max(0, page - 1)),
    nextPage: () => setPage(page + 1),
  };
}
