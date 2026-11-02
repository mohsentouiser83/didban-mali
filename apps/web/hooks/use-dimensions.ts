"use client";
import { useState } from "react";
import { listItems, type ResourceList } from "@/lib/api";
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
export function useDimensionManagement() {
  const workspace = useWorkspace(),
    command = useCommand();
  const resource = usePagedResource<Dimension>(
    workspace.companyPath("dimensions"),
  );
  const [editing, setEditing] = useState<Dimension | null | undefined>();
  const [value, setValue] = useState({
    kind: "project",
    code: "",
    name: "",
    active: true,
  });
  return {
    workspace,
    command,
    resource,
    rows: listItems(resource.data),
    editing,
    value,
    open: (item: Dimension | null) => {
      setEditing(item);
      setValue(
        item
          ? {
              kind: item.kind,
              code: item.code,
              name: item.name,
              active: item.active,
            }
          : { kind: "project", code: "", name: "", active: true },
      );
      command.clearError();
    },
    close: () => setEditing(undefined),
    change: (patch: Partial<typeof value>) =>
      setValue((previous) => ({ ...previous, ...patch })),
    save: () => {
      if (!value.name.trim() || !value.code.trim()) return;
      void command.run(
        workspace.companyPath(`dimensions${editing ? `/${editing.id}` : ""}`),
        {
          method: editing ? "PATCH" : "POST",
          body: value,
          version: editing?.version,
        },
        () => {
          setEditing(undefined);
          resource.refresh();
        },
        "بُعد ذخیره شد.",
      );
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
