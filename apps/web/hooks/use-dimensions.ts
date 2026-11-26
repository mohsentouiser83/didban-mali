"use client";
import { useState } from "react";
import { toast } from "sonner";
import { persian } from "@/lib/utils";
import type { ParsedTableImport } from "@/components/ui/table-import-dialog";
import { api, listItems, type ResourceList } from "@/lib/api";
import type {
  Dimension,
  DimensionLine,
  DimensionReport,
  DimensionRun,
} from "@/lib/dimensions";
import { useWorkspace } from "./workspace";
import { useCommand } from "./use-command";
import { usePagedResource } from "./use-paged-resource";
import { useResource } from "./use-resource";
import { useFinancialView } from "./use-financial-view";
export interface DimensionImportPreviewRow {
  rowNumber: number;
  name: string;
  kind: "project" | "branch" | "cost_center";
  rawKind: string;
  error?: string;
}

export interface DimensionImportSummary {
  succeeded: number;
  failed: number;
  errors: string[];
}

export function useDimensionManagement() {
  const workspace = useWorkspace(),
    command = useCommand();
  const resource = usePagedResource<Dimension>(
    workspace.companyPath("dimensions"),
  );
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("all");
  const [editing, setEditing] = useState<Dimension | null | undefined>();
  const [readOnly, setReadOnly] = useState(false);
  const [archiving, setArchiving] = useState<Dimension | null>(null);
  const [importPreview, setImportPreview] = useState<DimensionImportPreviewRow[] | null>(null);
  const [importSummary, setImportSummary] = useState<DimensionImportSummary | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [value, setValue] = useState({
    kind: "project",
    name: "",
    active: true,
  });
  const allRows = listItems(resource.data);
  const rows = allRows.filter((item) => {
    if (kindFilter !== "all" && item.kind !== kindFilter) return false;
    if (statusFilter === "active" && !item.active) return false;
    if (statusFilter === "archived" && item.active) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !item.name.toLowerCase().includes(q) &&
        !item.code.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });
  return {
    workspace,
    command,
    resource,
    rows,
    totalCount: allRows.length,
    search,
    setSearch,
    kindFilter,
    setKindFilter,
    statusFilter,
    setStatusFilter,
    hasActiveFilters: Boolean(
      search.trim() || kindFilter !== "all" || statusFilter !== "all",
    ),
    resetFilters: () => {
      setSearch("");
      setKindFilter("all");
      setStatusFilter("all");
    },
    editing,
    readOnly,
    archiving,
    setArchiving,
    value,
    importPreview,
    importSummary,
    importBusy,
    closeImport: () => {
      if (!importBusy) {
        setImportPreview(null);
        setImportSummary(null);
      }
    },
    open: (item: Dimension | null, viewOnly = false) => {
      setEditing(item);
      setReadOnly(viewOnly);
      setValue(
        item
          ? {
              kind: item.kind,
              name: item.name,
              active: item.active,
            }
          : { kind: "project", name: "", active: true },
      );
      command.clearError();
    },
    close: () => {
      if (!command.busy) {
        setEditing(undefined);
        setReadOnly(false);
      }
    },
    change: (patch: Partial<typeof value>) =>
      setValue((previous) => ({ ...previous, ...patch })),
    save: () => {
      if (!value.name.trim() || readOnly) return;
      void command.run(
        workspace.companyPath(`dimensions${editing ? `/${editing.id}` : ""}`),
        {
          method: editing ? "PATCH" : "POST",
          body: {
            kind: value.kind,
            name: value.name.trim(),
            active: value.active,
          },
          version: editing?.version,
        },
        () => {
          setEditing(undefined);
          setReadOnly(false);
          resource.refresh();
        },
        "اطلاعات پروژه، شعبه یا مرکز هزینه ذخیره شد.",
      );
    },
    toggleArchive: () => {
      if (!archiving) return;
      const nextActive = !archiving.active;
      void command.run(
        workspace.companyPath(`dimensions/${archiving.id}`),
        {
          method: "PATCH",
          version: archiving.version,
          body: {
            kind: archiving.kind,
            name: archiving.name,
            active: nextActive,
          },
        },
        () => {
          setArchiving(null);
          resource.refresh();
        },
        nextActive ? "مورد دوباره فعال شد." : "مورد بایگانی شد.",
      );
    },
    importFromExcel: async (parsed: ParsedTableImport) => {
      if (!workspace.company || !parsed.rows.length) return;
      const headerMap: Record<string, number> = {};
      parsed.headers.forEach((h, i) => {
        headerMap[h.trim().toLowerCase()] = i;
      });

      const getCol = (names: string[]) => {
        for (const name of names) {
          for (const [h, idx] of Object.entries(headerMap)) {
            if (h.includes(name.toLowerCase())) return idx;
          }
        }
        return -1;
      };

      const nameIdx = getCol(["نام", "عنوان", "نام بعد", "عنوان بعد", "name", "title"]);
      const kindIdx = getCol(["نوع", "نوع بعد", "دسته", "kind", "type"]);

      const previewRows: DimensionImportPreviewRow[] = parsed.rows.map((row, idx) => {
        const name = nameIdx >= 0 ? String(row[nameIdx] ?? "").trim() : "";
        const rawKind = kindIdx >= 0 ? String(row[kindIdx] ?? "").trim() : "";
        const normKind = rawKind.toLowerCase();
        let kind: "project" | "branch" | "cost_center" = "project";
        let error: string | undefined;

        if (!name) {
          error = "نام الزامی است.";
        } else if (name.length > 120) {
          error = "نام حداکثر ۱۲۰ کاراکتر است.";
        }

        if (kindIdx >= 0 && rawKind) {
          if (normKind.includes("هزینه") || normKind.includes("مرکز") || normKind.includes("cost")) {
            kind = "cost_center";
          } else if (normKind.includes("شعبه") || normKind.includes("branch")) {
            kind = "branch";
          } else if (normKind.includes("پروژه") || normKind.includes("project")) {
            kind = "project";
          } else if (!error) {
            error = "نوع باید یکی از پروژه، شعبه یا مرکز هزینه باشد.";
          }
        }
        return { rowNumber: idx + 1, name, kind, rawKind, error };
      });
      setImportSummary(null);
      setImportPreview(previewRows);
    },
    applyImport: async () => {
      if (!workspace.company || !importPreview) return;
      const validRows = importPreview.filter((row) => !row.error);
      if (!validRows.length) return;
      setImportBusy(true);
      let succeeded = 0;
      let failed = 0;
      const errors: string[] = [];
      for (const row of validRows) {
        try {
          await api(workspace.companyPath("dimensions")!, {
            method: "POST",
            body: { kind: row.kind, name: row.name, active: true },
          });
          succeeded++;
        } catch (err) {
          failed++;
          errors.push(`ردیف ${persian(row.rowNumber)} (${row.name}): ${err instanceof Error ? err.message : "خطا در ثبت"}`);
        }
      }
      setImportBusy(false);
      setImportSummary({ succeeded, failed, errors });
      resource.refresh();
      if (succeeded > 0 && failed === 0) {
        toast.success(`${persian(succeeded)} مورد با کد خودکار ثبت شد.`);
      } else if (succeeded > 0) {
        toast.warning(`${persian(succeeded)} مورد ثبت شد و ${persian(failed)} مورد خطا داشت.`);
      } else if (failed > 0) {
        toast.error("هیچ ردیفی ثبت نشد؛ جزئیات خطا را بررسی کنید.");
      }
    },
  };
}
export function useDimensionReporting() {
  const financial = useFinancialView(),
    workspace = financial.workspace,
    command = useCommand();
  const [source, setSourceValue] = useState<
    "imported_manifest" | "native_statement"
  >("imported_manifest");
  const [kind, setKindValue] = useState("project"),
    [saved, setSaved] = useState<DimensionRun | null>(null);
  const [linePages, setLinePages] = useState({ key: "", page: 0 });
  const [bucketPages, setBucketPages] = useState({ key: "", page: 0 });
  const dimensions = useResource<ResourceList<Dimension>>(
    workspace.companyPath("dimensions/options/all"),
  );
  const manifestId = financial.manifest?.id;
  const current = useResource<DimensionReport>(
    source === "native_statement"
      ? workspace.periodId
        ? workspace.companyPath(
            `dimensions/report/current?native_period_id=${workspace.periodId}&kind=${kind}`,
          )
        : null
      : manifestId
        ? workspace.companyPath(
            `dimensions/report/current?manifest_id=${manifestId}&kind=${kind}`,
          )
        : null,
  );
  const history = usePagedResource<DimensionRun>(
    workspace.companyPath(`dimensions/reports/saved?source=${source}`),
  );
  const [selected, setSelected] = useState<DimensionLine | null>(null);
  const [shares, setShares] = useState([{ dimension_id: "", percent: "100" }]);
  const [reason, setReason] = useState("");
  const snapshot = saved?.snapshot || current.data;
  const snapshotKey =
    saved?.id ||
    `${snapshot?.native_statement_id || snapshot?.manifest_id || ""}:${snapshot?.kind || kind}`;
  const total = snapshot?.lines.length || 0;
  const bucketTotal = snapshot?.buckets.length || 0;
  const maxLinePage = Math.max(0, Math.ceil(total / 25) - 1);
  const maxBucketPage = Math.max(0, Math.ceil(bucketTotal / 25) - 1);
  const page = Math.min(
    linePages.key === snapshotKey ? linePages.page : 0,
    maxLinePage,
  );
  const bucketPage = Math.min(
    bucketPages.key === snapshotKey ? bucketPages.page : 0,
    maxBucketPage,
  );
  const activeDimensions = listItems(dimensions.data).filter(
    (item) => item.kind === kind && item.active,
  );
  const error =
    (source === "imported_manifest" ? financial.error : undefined) ||
    current.error ||
    dimensions.error;
  const sourceFields = snapshot?.native_statement_id
    ? { native_statement_id: snapshot.native_statement_id }
    : { manifest_id: snapshot?.manifest_id };
  const retry = () => {
    financial.refresh();
    current.refresh();
    dimensions.refresh();
  };
  return {
    exportHref: (format: string) =>
      saved
        ? `/api/v1${workspace.companyPath(`dimensions/reports/saved/${saved.id}/export?format=${format}`)}`
        : "",
    error,
    retry,
    workspace,
    financial,
    command,
    source,
    loading:
      (source === "imported_manifest" && financial.loading) || current.loading,
    setSource: (next: typeof source) => {
      setSourceValue(next);
      setSaved(null);
      setSelected(null);
      command.clearError();
    },
    kind,
    current,
    history,
    dimensions,
    selected,
    shares,
    reason,
    snapshot,
    saved,
    page,
    rows: (snapshot?.lines || []).slice(page * 25, (page + 1) * 25),
    total,
    bucketRows: (snapshot?.buckets || []).slice(
      bucketPage * 25,
      (bucketPage + 1) * 25,
    ),
    bucketPage,
    bucketTotal,
    previousBucket: () =>
      setBucketPages({ key: snapshotKey, page: Math.max(0, bucketPage - 1) }),
    nextBucket: () =>
      setBucketPages({
        key: snapshotKey,
        page: Math.min(maxBucketPage, bucketPage + 1),
      }),
    options: activeDimensions.map((item) => ({
      value: item.id,
      label: `${item.code} — ${item.name}`,
    })),
    setKind: (next: string) => {
      setKindValue(next);
      setSaved(null);
      setLinePages({ key: "", page: 0 });
      setBucketPages({ key: "", page: 0 });
    },
    selectSaved: (run: DimensionRun | null) => {
      setSaved(run);
      if (run) setKindValue(run.snapshot.kind);
      setLinePages({ key: "", page: 0 });
      setBucketPages({ key: "", page: 0 });
    },
    previous: () =>
      setLinePages({ key: snapshotKey, page: Math.max(0, page - 1) }),
    next: () =>
      setLinePages({ key: snapshotKey, page: Math.min(maxLinePage, page + 1) }),
    open: (line: DimensionLine) => {
      setSelected(line);
      setShares(
        line.allocation?.shares.map((item) => ({
          dimension_id: item.dimension_id,
          percent: item.percent,
        })) || [{ dimension_id: "", percent: "100" }],
      );
      setReason("");
      command.clearError();
    },
    close: () => setSelected(null),
    setReason,
    changeShare: (index: number, patch: Partial<(typeof shares)[number]>) =>
      setShares((previous) =>
        previous.map((item, position) =>
          position === index ? { ...item, ...patch } : item,
        ),
      ),
    addShare: () =>
      setShares((previous) => [...previous, { dimension_id: "", percent: "" }]),
    removeShare: (index: number) =>
      setShares((previous) =>
        previous.filter((_, position) => position !== index),
      ),
    assign: () => {
      if (!selected || !reason.trim() || !snapshot) return;
      void command.run(
        workspace.companyPath("dimensions/allocations"),
        {
          body: {
            ...sourceFields,
            line_id: selected.id,
            kind,
            method: shares.length === 1 ? "direct" : "shared",
            shares,
            review_reason: reason.trim(),
          },
          version:
            selected.allocation_version || selected.allocation?.version || 1,
        },
        () => {
          setSelected(null);
          current.refresh();
        },
        "تخصیص بررسی و ذخیره شد.",
      );
    },
    saveReport: () => {
      if (!snapshot) return;
      void command.run<DimensionRun>(
        workspace.companyPath("dimensions/reports/saved"),
        { body: { ...sourceFields, kind } },
        (run) => {
          setSaved(run);
          history.refresh();
        },
        "نسخهٔ گزارش ذخیره شد.",
      );
    },
  };
}
