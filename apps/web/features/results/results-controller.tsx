"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useCompany } from "@/features/companies/use-companies";
import { usePeriods } from "@/features/periods/use-periods";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { formatDate, formatTime, persianDigits } from "@/lib/dates";
import { message } from "@/lib/api";
import { ResultsListView } from "./results-list-view";
import { ResultDetailView, type MetricCardModel } from "./result-detail-view";
import { EvidenceView } from "./evidence-view";
import { ResultLoadingView } from "./result-loading-view";
import {
  useResultManifests,
  useResultManifest,
  useResultMetrics,
  useResultEvidence,
} from "./use-results";
import {
  coverageLabels,
  formatMoney,
  metricLabels,
  moduleLabels,
  metricReason,
  orderMetrics,
  reasonLabel,
  sourceLabels,
  statusLabels,
  unitLabel,
} from "./presentation";

export function ResultsController() {
  const { companyId } = useParams<{ companyId: string }>();
  const company = useCompany(companyId),
    manifests = useResultManifests(companyId),
    periods = usePeriods(companyId);
  if (company.isPending || manifests.isPending || periods.isPending)
    return <LoadingState layout="table" />;
  const error = company.error || manifests.error || periods.error;
  if (error)
    return (
      <ErrorState
        message={message(error)}
        onRetry={() => {
          void company.refetch();
          void manifests.refetch();
          void periods.refetch();
        }}
      />
    );
  const names = new Map(
    periods.data.pages.flatMap((p) => p.items).map((p) => [p.id, p.name]),
  );
  return (
    <ResultsListView
      company={company.data}
      items={manifests.data.pages
        .flatMap((p) => p.items)
        .map((m) => ({
          id: m.id,
          period: names.get(m.period_id) ?? "دوره مالی ثبت‌شده",
          date: formatDate(m.as_of_date),
          published: formatTime(m.published_at),
          limited: m.report_scope === "limited",
        }))}
      more={manifests.hasNextPage}
      busy={manifests.isFetchingNextPage}
      onMore={() => {
        void manifests.fetchNextPage();
      }}
    />
  );
}

export function ResultDetailController() {
  const { companyId, manifestId } = useParams<{
    companyId: string;
    manifestId: string;
  }>();
  const company = useCompany(companyId),
    manifest = useResultManifest(companyId, manifestId),
    metrics = useResultMetrics(companyId, manifestId),
    periods = usePeriods(companyId);
  const [selected, setSelected] = useState<MetricCardModel | null>(null),
    [evidenceIndex, setEvidenceIndex] = useState(0);
  const evidence = useResultEvidence(
    companyId,
    selected?.evidenceRefs[evidenceIndex] ?? null,
  );
  if (
    company.isPending ||
    manifest.isPending ||
    periods.isPending ||
    metrics.isPending
  )
    return <ResultLoadingView titles={Object.values(metricLabels)} />;
  const error = company.error || manifest.error || periods.error;
  if (error)
    return (
      <ErrorState
        message={message(error)}
        onRetry={() => {
          void company.refetch();
          void manifest.refetch();
          void periods.refetch();
        }}
      />
    );
  const unit = company.data.display_unit;
  const cards: MetricCardModel[] = orderMetrics(
    metrics.data?.pages.flatMap((p) => p.items) ?? [],
  ).map((metric) => ({
    id: metric.id,
    metricKey: metric.metric_key,
    title: metricLabels[metric.metric_key] ?? "شاخص مالی",
    value: formatMoney(metric.value, unit),
    unit: unitLabel(unit),
    status: statusLabels[metric.status],
    tone:
      metric.status === "available"
        ? "success"
        : metric.status === "unavailable"
          ? "neutral"
          : "warning",
    reason: metricReason(metric),
    previous:
      metric.comparison?.value != null
        ? formatMoney(metric.comparison.value, unit)
        : null,
    delta:
      metric.comparison?.delta != null
        ? formatMoney(metric.comparison.delta, unit)
        : null,
    comparisonReason: metric.comparison?.reason_codes.length
      ? [...new Set(metric.comparison.reason_codes.map(reasonLabel))].join(" ")
      : metric.comparison === null
        ? "داده قابل مقایسه دوره قبل موجود نیست."
        : null,
    coverage: metric.coverage.map(
      (c) =>
        `${sourceLabels[c.scope_key] ?? "داده ورودی"}: ${coverageLabels[c.state]}${c.starts_on && c.ends_on ? ` · ${formatDate(c.starts_on)} تا ${formatDate(c.ends_on)}` : ""}`,
    ),
    evidenceRefs: metric.evidence_refs,
    formula: metric.formula_version,
  }));
  const period = periods.data.pages
    .flatMap((p) => p.items)
    .find((p) => p.id === manifest.data.period_id);
  return (
    <>
      <ResultDetailView
        company={company.data}
        period={period?.name ?? "دوره مالی ثبت‌شده"}
        asOf={formatDate(manifest.data.as_of_date)}
        published={formatTime(manifest.data.published_at)}
        manifest={manifest.data}
        metrics={cards}
        missingSources={manifest.data.missing_source_kinds.map(
          (s) => sourceLabels[s] ?? "منبع مالی تکمیل‌نشده",
        )}
        missingModules={[
          ...new Set(
            manifest.data.missing_modules.map(
              (key) => moduleLabels[key] ?? "بخش تکمیلی گزارش",
            ),
          ),
        ]}
        metricsError={metrics.error ? message(metrics.error) : null}
        onRetry={() => {
          void metrics.refetch();
        }}
        more={metrics.hasNextPage}
        busy={metrics.isFetchingNextPage}
        onMore={() => {
          void metrics.fetchNextPage();
        }}
        onEvidence={(metric) => {
          setSelected(metric);
          setEvidenceIndex(0);
        }}
      />
      {selected ? (
        <EvidenceView
          metric={selected}
          evidence={evidence.data}
          loading={evidence.isPending}
          error={evidence.error ? message(evidence.error) : null}
          index={evidenceIndex}
          facts={
            evidence.data?.fact_values.map((value) =>
              formatMoney(value, unit),
            ) ?? []
          }
          row={
            evidence.data?.row_number != null
              ? persianDigits(String(evidence.data.row_number))
              : null
          }
          onClose={() => setSelected(null)}
          onIndex={setEvidenceIndex}
          onRetry={() => {
            void evidence.refetch();
          }}
        />
      ) : null}
    </>
  );
}
