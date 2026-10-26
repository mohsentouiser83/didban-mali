"use client";
import { useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import {
  useQuery,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { Schema } from "@didban/api-client";
import { api, message } from "@/lib/api";
import { useCommand } from "@/lib/use-command";
import { useCompany, useAccess } from "@/features/companies/use-companies";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { notify } from "@/components/ui/sonner";
import { formatTime, persianDigits } from "@/lib/dates";
import {
  SourceView,
  RetentionForm,
  ArchiveConfirmation,
  ImpactDialog,
  DeleteConfirmation,
  type SourceRow,
} from "./source-view";
const dependencyLabels: Record<string, string> = {
  session_files: "پرونده بارگذاری",
  interpretation_versions: "تفسیر ثبت‌شده",
  source_rows: "شواهد ردیف",
  normalized_source_rows: "داده استاندارد",
  manifest_dependencies: "نسخه نتایج",
  interpretation_runs: "تفسیر ورودی",
  report_source_dependencies: "گزارش تاریخی",
};
export function SourceController() {
  const { companyId } = useParams<{ companyId: string }>(),
    company = useCompany(companyId),
    access = useAccess(companyId),
    cache = useQueryClient(),
    base = `/api/v1/companies/${companyId}`;
  const [mode, setMode] = useState<"archive" | "impact" | "delete" | null>(
      null,
    ),
    [target, setTarget] = useState<SourceRow | null>(null);
  const query = useInfiniteQuery({
    queryKey: ["source-files", companyId],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api.get<Schema<"SourceFileSummaryPage">>(
        `${base}/source-files?limit=50${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        signal,
      ),
    getNextPageParam: (p) => p.next_cursor ?? undefined,
  });
  const retention = useQuery({
    queryKey: ["retention", companyId],
    queryFn: ({ signal }) =>
      api.get<Schema<"RetentionPolicy">>(`${base}/retention-policy`, signal),
  });
  const impact = useQuery({
    queryKey: ["source-impact", companyId, target?.id],
    queryFn: ({ signal }) =>
      api.get<Schema<"DeletionImpact">>(
        `${base}/source-files/${target?.id}/deletion-impact`,
        signal,
      ),
    enabled: !!target && mode === "impact",
  });
  const changed = async () => {
    setMode(null);
    setTarget(null);
    await cache.invalidateQueries({ queryKey: ["source-files", companyId] });
  };
  const archive = useCommand<SourceRow, Schema<"SourceFileSummary">>(
    (row, key) =>
      api.mutate(
        `${base}/source-files/${row.id}/archive`,
        "PATCH",
        { archived: !row.archived },
        key,
        row.version,
      ),
    async () => {
      await changed();
      notify.success("وضعیت بایگانی ثبت شد.");
    },
  );
  const remove = useCommand<
    { row: SourceRow; reason: string },
    Schema<"AcceptedOperation">
  >(
    ({ row, reason }, key) =>
      api.mutate(
        `${base}/source-files/${row.id}/deletion`,
        "POST",
        { confirmed: true, reason },
        key,
        row.version,
      ),
    async () => {
      await changed();
      notify.success("درخواست حذف ثبت شد؛ پاک‌سازی در صف است.");
    },
  );
  const saveRetention = useCommand<
    { retention_days: number | null; reason: string },
    Schema<"RetentionPolicy">
  >(
    (body, key) =>
      api.mutate(
        `${base}/retention-policy`,
        "PATCH",
        body,
        key,
        retention.data?.version,
      ),
    async () => {
      await cache.invalidateQueries({ queryKey: ["retention", companyId] });
    },
  );
  const submitRetention = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      v = String(f.get("retention_days") ?? "");
    saveRetention.mutate({
      retention_days: v ? Number(v) : null,
      reason: String(f.get("reason")).trim(),
    });
  };
  if (
    query.isPending ||
    company.isPending ||
    access.isPending ||
    retention.isPending
  )
    return <LoadingState layout="table" />;
  if (query.error || company.error || access.error || retention.error)
    return (
      <ErrorState
        message={message(
          query.error || company.error || access.error || retention.error,
        )}
        onRetry={() => {
          void query.refetch();
          void company.refetch();
          void access.refetch();
          void retention.refetch();
        }}
      />
    );
  const canManage = access.data.permissions.includes("company.owner"),
    rows: SourceRow[] = query.data.pages
      .flatMap((p) => p.items)
      .map((f) => ({
        id: f.id,
        name: f.original_name,
        format: f.format.toUpperCase(),
        created: formatTime(f.created_at),
        archived: f.archived,
        version: f.version,
      }));
  const deps = Object.entries(
    (impact.data?.dependencies ?? []).reduce<Record<string, number>>(
      (acc, d) => ({ ...acc, [d.entity_type]: (acc[d.entity_type] ?? 0) + 1 }),
      {},
    ),
  ).map(
    ([kind, count]) =>
      `${dependencyLabels[kind] ?? "سابقه وابسته"} · ${persianDigits(String(count))}${count === 20 ? " یا بیشتر" : ""}`,
  );
  return (
    <>
      <SourceView
        company={company.data.name}
        rows={rows}
        canManage={canManage}
        more={query.hasNextPage}
        busy={query.isFetchingNextPage}
        onMore={() => {
          void query.fetchNextPage();
        }}
        onArchive={(row) => {
          archive.reset();
          setTarget(row);
          setMode("archive");
        }}
        onImpact={(row) => {
          setTarget(row);
          setMode("impact");
        }}
      />
      {canManage ? (
        <RetentionForm
          days={
            retention.data.retention_days === null
              ? ""
              : String(retention.data.retention_days)
          }
          busy={saveRetention.isPending}
          error={saveRetention.error ? message(saveRetention.error) : null}
          success={saveRetention.isSuccess}
          onSubmit={submitRetention}
        />
      ) : null}
      {mode === "archive" && target ? (
        <ArchiveConfirmation
          row={target}
          busy={archive.isPending}
          error={archive.error ? message(archive.error) : null}
          onClose={() => setMode(null)}
          onConfirm={() => archive.mutate(target)}
        />
      ) : null}
      {mode === "impact" && target ? (
        <ImpactDialog
          name={target.name}
          dependencies={deps}
          loading={impact.isPending}
          error={impact.error ? message(impact.error) : null}
          onRetry={() => {
            void impact.refetch();
          }}
          onClose={() => setMode(null)}
          canDelete={impact.data?.hard_delete_allowed ?? false}
          onDelete={() => {
            remove.reset();
            setMode("delete");
          }}
        />
      ) : null}
      {mode === "delete" && target ? (
        <DeleteConfirmation
          row={target}
          busy={remove.isPending}
          error={remove.error ? message(remove.error) : null}
          onClose={() => setMode(null)}
          onSubmit={(e) => {
            e.preventDefault();
            remove.mutate({
              row: target,
              reason: String(
                new FormData(e.currentTarget).get("reason"),
              ).trim(),
            });
          }}
        />
      ) : null}
    </>
  );
}
