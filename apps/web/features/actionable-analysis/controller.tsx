"use client";
import { AnalysisEvidence } from "./evidence";
import { AnalysisSettings } from "./settings";
import { formatDate, persianDigits } from "@/lib/dates";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, message } from "@/lib/api";
import { useCommand } from "@/lib/use-command";
import { useReports } from "@/features/reports/use-reports";
import { useAccess } from "@/features/companies/use-companies";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/features/companies/company-view";
import {
  AnalysisProposalView,
  type Proposal,
  type EvidenceSelection,
} from "./view";
export function ActionableAnalysisController() {
  const { companyId } = useParams<{ companyId: string }>(),
    reports = useReports(companyId),
    access = useAccess(companyId),
    cache = useQueryClient();
  const [choice, setChoice] = useState("");
  const [evidence, setEvidence] = useState<EvidenceSelection | null>(null);
  const rows = reports.data?.pages.flatMap((p) => p.items) ?? [],
    report = choice || rows.at(-1)?.id || "",
    base = `/api/v1/companies/${companyId}`;
  const query = useQuery({
    queryKey: ["actionable", companyId, report],
    enabled: !!report,
    queryFn: ({ signal }) =>
      api.get<{ items: Proposal[] }>(
        `${base}/reports/${report}/actionable-analysis`,
        signal,
      ),
  });
  const payrollAccess = useQuery({
    queryKey: ["payroll-access", companyId],
    queryFn: ({ signal }) =>
      api.get<{ manage: boolean }>(`${base}/payroll-access`, signal),
  });
  const refresh = async () => {
    await cache.invalidateQueries({
      queryKey: ["actionable", companyId, report],
    });
  };
  const generate = useCommand<undefined, { items: Proposal[] }>(
    (_, key) =>
      api.mutate(
        `${base}/reports/${report}/actionable-analysis`,
        "POST",
        undefined,
        key,
      ),
    refresh,
  );
  const follow = useCommand<
    { item: Proposal; status: string; reason: string },
    Proposal
  >(
    (v, key) =>
      api.mutate(
        `${base}/analysis-proposals/${v.item.id}/followup`,
        "PATCH",
        { status: v.status, reason: v.reason },
        key,
        v.item.version,
      ),
    refresh,
  );
  if (reports.isPending || access.isPending) return <LoadingState />;
  if (reports.error || access.error)
    return (
      <ErrorState
        message={message(reports.error || access.error)}
        onRetry={() => {
          void reports.refetch();
          void access.refetch();
        }}
      />
    );
  if (!rows.length) return <EmptyState title="گزارشی موجود نیست" />;
  const selectedReport = rows.find((r) => r.id === report);
  const basisLabels: Record<string, string> = {
    ledger: "دفتر",
    bank: "بانک",
    invoice: "فاکتور",
    comparable_difference: "تطبیق",
    trial_balance: "تراز",
  };
  const reportBasis = [
    ...new Set(
      selectedReport?.metrics?.map((m) => basisLabels[m.basis] ?? m.basis) ??
        [],
    ),
  ].join("، ");
  const canEdit = access.data.permissions.includes("company.operate");
  return (
    <section className="space-y-5 motion-safe:animate-reveal">
      <PageHeader
        icon="ChartNoAxesCombined"
        title="پیشنهادهای مدیریتی"
        description={[
          selectedReport?.company_name,
          selectedReport?.period_name,
          reportBasis ? `مبنا: ${reportBasis}` : undefined,
          selectedReport?.as_of_date
            ? formatDate(selectedReport.as_of_date)
            : undefined,
        ]
          .filter(Boolean)
          .join(" · ")}
      />
      <AnalysisSettings
        company={companyId}
        canEdit={access.data.role === "finance_manager"}
      />
      <Select
        id="analysis-report"
        label="نسخه گزارش"
        value={report}
        onValueChange={setChoice}
        options={rows.map((r, i) => ({
          value: r.id,
          label: `${r.company_name ?? "شرکت"} · ${r.period_name ?? "دوره"} · ${r.as_of_date ? formatDate(r.as_of_date) : formatDate(r.created_at)} · نسخه ${persianDigits(String(r.revision_number ?? i + 1))}`,
        }))}
      />
      {canEdit ? (
        <Button
          onClick={() => generate.mutate(undefined)}
          disabled={generate.isPending}
        >
          {generate.isPending ? "در حال تحلیل…" : "استخراج پیشنهادها"}
        </Button>
      ) : null}
      {generate.error ? <ErrorState message={message(generate.error)} /> : null}
      {query.isPending ? (
        <LoadingState />
      ) : query.error ? (
        <ErrorState
          message={message(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : query.data.items.length ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {query.data.items.map((item) => (
            <AnalysisProposalView
              key={item.id}
              item={item}
              onEvidence={setEvidence}
              canEdit={
                canEdit &&
                (item.axis !== "payroll" || payrollAccess.data?.manage === true)
              }
              busy={follow.isPending}
              error={follow.error ? message(follow.error) : undefined}
              onSave={(status, reason) =>
                follow.mutate({ item, status, reason })
              }
            />
          ))}
        </div>
      ) : (
        <EmptyState title="پیشنهادی برای این نسخه ثبت نشده" />
      )}
      {evidence ? (
        <AnalysisEvidence
          company={companyId}
          selection={evidence}
          onClose={() => setEvidence(null)}
        />
      ) : null}
    </section>
  );
}
