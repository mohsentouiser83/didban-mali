"use client";
import { useState } from "react";
import { useWorkspace } from "./workspace";
import { useResource } from "./use-resource";
import { useCommand } from "./use-command";
import { validateAccountCodePattern, type AccountLevel } from "@/lib/account-catalogue";
import type { AccountNature } from "@/lib/accounting";
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
      ? "ثبت نهایی با تأیید انسان دارای مجوز انجام می‌شود."
      : resource.data?.posting_reason === "primary_accounting_required"
        ? "ثبت نهایی فقط در حالت حسابداری اصلی در دسترس است."
        : "ثبت نهایی برای کاربرد فعلی در دسترس نیست.",
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
  const codeSet = new Map<string, number>();
  const rowList = rows;
  for (const r of rowList) {
    const code = (r.code || "").trim();
    if (code) codeSet.set(code, (codeSet.get(code) ?? 0) + 1);
  }
  const validateRow = (row: (typeof rowList)[number]) => {
    const code = (row.code || "").trim();
    const name = (row.name || "").trim();
    if (!code) return "کد حساب خالی است.";
    if ((codeSet.get(code) ?? 0) > 1) return "کد در جدول تکراری است.";
    if (!name) return "نام حساب خالی است.";
    if (row.level && row.level !== "group") {
      const parentCode = (row.parent_code || "").trim();
      if (!parentCode) return "کد بالادست لازم است.";
      const err = validateAccountCodePattern(code, row.level, parentCode);
      if (err) return err;
    } else if (row.level === "group") {
      if ((row.parent_code || "").trim()) return "حساب گروه بالادست ندارد.";
      const err = validateAccountCodePattern(code, "group", null);
      if (err) return err;
    }
    return null;
  };
  const rowErrors = rowList.map((row, index) =>
    command.error?.fields?.[`chart-row-${index}`] ?? validateRow(row)
  );
  const invalidCount = rowErrors.filter(Boolean).length;
  const loadRows = (next: ChartRow[]) => {
    command.clearError();
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
    invalidCount,
    page,
    visibleRows: rows
      .slice(page * 25, (page + 1) * 25)
      .map((row, index) => ({ ...row, index: page * 25 + index, error: rowErrors[page * 25 + index], parentRequired: row.level === "general" || row.level === "subsidiary" || row.level === "detail" })),
    loadTemplate,
    loadFile,
    preview,
    apply,
    previewId,
    change: (index: number, patch: Partial<ChartRow>) => {
      command.clearError();
      setRows((previous) => previous.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    },
    previousPage: () => setPage((value) => Math.max(0, value - 1)),
    nextPage: () => setPage((value) => value + 1),
  };
}
