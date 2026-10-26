"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useCompany, useAccess } from "@/features/companies/use-companies";
import { useResultManifests } from "@/features/results/use-results";
import {
  formatMoney,
  metricLabels,
  reasonLabel,
  statusLabels,
  unitLabel,
} from "@/features/results/presentation";
import { formatDate, formatTime, persianDigits } from "@/lib/dates";
import { message } from "@/lib/api";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { useReports, useReport, useReportCommands } from "./use-reports";
import { ReportsView, type ReportModel } from "./reports-view";
export function ReportsController() {
  const { companyId, reportId } = useParams<{
      companyId: string;
      reportId?: string;
    }>(),
    company = useCompany(companyId),
    access = useAccess(companyId),
    manifests = useResultManifests(companyId),
    reports = useReports(companyId),
    exactReport = useReport(companyId, reportId);
  const [manifestChoice, setManifest] = useState(""),
    [reportChoice, setReport] = useState(""),
    [approvalOpen, setApprovalOpen] = useState(false);
  const commands = useReportCommands(companyId, (id) => setReport(id));
  const manifestRows = manifests.data?.pages.flatMap((p) => p.items) ?? [],
    manifestId =
      exactReport.data?.manifest_id ||
      manifestChoice ||
      manifestRows.at(-1)?.id ||
      "",
    rows = (reports.data?.pages.flatMap((p) => p.items) ?? []).filter(
      (r) => r.manifest_id === manifestId,
    ),
    selected = reportId
      ? exactReport.data
      : (rows.find((r) => r.id === reportChoice) ?? rows.at(-1));
  if (
    company.isPending ||
    access.isPending ||
    manifests.isPending ||
    reports.isPending ||
    (reportId && exactReport.isPending)
  )
    return <LoadingState layout="table" />;
  const error =
    company.error ||
    access.error ||
    manifests.error ||
    reports.error ||
    exactReport.error;
  if (error)
    return (
      <ErrorState
        message={message(error)}
        onRetry={() => {
          void company.refetch();
          void access.refetch();
          void manifests.refetch();
          void reports.refetch();
          if (reportId) void exactReport.refetch();
        }}
      />
    );
  if (!manifestRows.length && !selected)
    return <EmptyState title="نتیجه مالی آماده نیست" />;
  const unit = company.data.display_unit,
    permissions = access.data.permissions;
  const model: ReportModel | null = selected
    ? {
        id: selected.id,
        edition: `نسخه ${persianDigits(String(selected.revision_number ?? selected.version))}`,
        date: selected.as_of_date
          ? formatDate(selected.as_of_date)
          : formatTime(selected.created_at),
        period: selected.period_name ?? "گزارش مالی",
        limited: selected.scope_status !== "ready",
        approved: selected.approval_ids.length > 0,
        unit: unitLabel(unit),
        sourceCount: persianDigits(String(selected.source_count ?? 0)),
        forecast: formatMoney(selected.forecast_closing ?? null, unit),
        metrics: (selected.metrics ?? []).map((m) => ({
          key: m.metric_key,
          label: metricLabels[m.metric_key] ?? m.metric_key,
          value: formatMoney(m.value, unit),
          state: statusLabels[m.status],
          reason: m.reason_codes.map(reasonLabel).join(" "),
        })),
        exports: (selected.exports ?? []).map((e) => ({
          id: e.id,
          label: {
            pdf: "PDF مدیریتی",
            xlsx: "Excel جزئیات و مغایرت‌ها",
            error_csv: "ردیف‌های خطادار",
          }[e.format],
          status: {
            pending: "در صف تولید",
            running: "در حال تولید",
            ready: "آماده",
            failed: "تولید نشد",
          }[e.status],
          ready: e.status === "ready",
          failed:
            e.status === "failed" ||
            e.error_code === "export_permission_required",
          url: `/api/v1/companies/${companyId}/exports/${e.id}/content`,
        })),
      }
    : null;
  return (
    <ReportsView
      company={company.data.name}
      backHref={reportId ? `/companies/${companyId}/reports` : undefined}
      manifestOptions={
        reportId && selected
          ? [
              {
                value: selected.manifest_id,
                label: `نسخه داده گزارش · ${formatDate(selected.as_of_date ?? selected.created_at)}`,
              },
            ]
          : manifestRows.map((m) => ({
              value: m.id,
              label: `تا ${formatDate(m.as_of_date)} · ${formatTime(m.published_at)}`,
            }))
      }
      manifestId={manifestId}
      onManifest={(value) => {
        setManifest(value);
        setReport("");
      }}
      reportOptions={(reportId && selected ? [selected] : rows).map((r) => ({
        value: r.id,
        label: `نسخه ${persianDigits(String(r.revision_number ?? r.version))} · ${formatTime(r.created_at)}`,
      }))}
      reportId={selected?.id ?? ""}
      onReport={setReport}
      report={model}
      canOperate={!reportId && permissions.includes("company.operate")}
      canApprove={permissions.includes("company.approve_report")}
      generating={commands.generate.isPending}
      approving={commands.approve.isPending}
      retrying={commands.retry.isPending}
      error={
        commands.generate.error
          ? message(commands.generate.error)
          : commands.retry.error
            ? message(commands.retry.error)
            : null
      }
      approvalError={
        commands.approve.error ? message(commands.approve.error) : null
      }
      approvalOpen={approvalOpen}
      onApprovalOpen={(open) => {
        if (open) commands.approve.reset();
        setApprovalOpen(open);
      }}
      onGenerate={() => commands.generate.mutate(manifestId)}
      onApprove={() => {
        if (selected)
          commands.approve.mutate(
            { id: selected.id, version: selected.version },
            { onSuccess: () => setApprovalOpen(false) },
          );
      }}
      onRetry={(id) => commands.retry.mutate(id)}
      more={!reportId && !!reports.hasNextPage}
      onMore={() => {
        void reports.fetchNextPage();
      }}
    />
  );
}
