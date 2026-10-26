"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useCompany } from "@/features/companies/use-companies";
import { useResultManifests } from "@/features/results/use-results";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { formatDate, formatTime } from "@/lib/dates";
import { message } from "@/lib/api";
import { formatMoney, unitLabel } from "@/features/results/presentation";
import { useCashflowReport } from "./use-cashflow-report";
import {
  cashflowReportModel,
  cashflowReason,
  dayModel,
} from "./cashflow-report-presentation";
import { CashflowReportView } from "./cashflow-report-view";
import {
  CashflowDayDetails,
  CashflowAccounts,
} from "./cashflow-report-details";
export function CashflowReportController() {
  const { companyId } = useParams<{ companyId: string }>(),
    company = useCompany(companyId),
    manifests = useResultManifests(companyId);
  const [selectedManifest, setManifest] = useState(""),
    [date, setDate] = useState(""),
    [details, setDetails] = useState(false),
    [accountsOpen, setAccountsOpen] = useState(false),
    [offset, setOffset] = useState(0);
  const all = manifests.data?.pages.flatMap((p) => p.items) ?? [],
    manifest = selectedManifest || all.at(-1)?.id || "",
    report = useCashflowReport(companyId, manifest);
  if (
    company.isPending ||
    manifests.isPending ||
    (!!manifest && report.isPending)
  )
    return <LoadingState label="در حال دریافت گزارش گردش نقد" />;
  const error = company.error || manifests.error || report.error;
  if (error)
    return (
      <ErrorState
        message={message(error)}
        onRetry={() => {
          void company.refetch();
          void manifests.refetch();
          void report.refetch();
        }}
      />
    );
  if (!manifest || !report.data)
    return <EmptyState title="نتیجه مالی آماده نیست" />;
  const unit = company.data.display_unit,
    days = report.data.days,
    model = cashflowReportModel(days, unit);
  const dayIndex = Math.max(
      0,
      date ? days.findIndex((d) => d.date === date) : days.length - 1,
    ),
    selected = days[dayIndex],
    day = selected ? dayModel(selected, unit) : undefined;
  const accounts = report.data.accounts.map((a, i) => ({
    key: a.bank_account_id ?? String(i),
    name: a.name,
    balance: formatMoney(a.balance, unit),
    reason: a.reason_codes.map(cashflowReason).join(" "),
  }));
  return (
    <>
      <CashflowReportView
        company={company.data.name}
        manifest={manifest}
        options={all.map((m) => ({
          value: m.id,
          label: `تا ${formatDate(m.as_of_date)} · تولید ${formatTime(m.published_at)}`,
        }))}
        onManifest={(id) => {
          setManifest(id);
          setDate("");
          setDetails(false);
        }}
        moreManifests={manifests.hasNextPage}
        manifestBusy={manifests.isFetchingNextPage}
        onMoreManifests={() => {
          void manifests.fetchNextPage();
        }}
        unit={unitLabel(unit)}
        model={model}
        day={day}
        dayIndex={dayIndex}
        onDay={(v) => {
          setDate(v);
          setOffset(0);
        }}
        onPrevious={() => setDate(days[dayIndex - 1].date)}
        onNext={() => setDate(days[dayIndex + 1].date)}
        onDetails={() => {
          setDetails(true);
          setOffset(0);
        }}
        onAccounts={() => setAccountsOpen(true)}
        frozenAt={report.data.created ? formatTime(report.data.created) : null}
        reasons={report.data.reasons.map(cashflowReason)}
      />
      {details && day ? (
        <CashflowDayDetails
          day={day}
          unit={unitLabel(unit)}
          offset={offset}
          onOffset={setOffset}
          onClose={() => setDetails(false)}
        />
      ) : null}
      {accountsOpen ? (
        <CashflowAccounts
          accounts={accounts}
          unit={unitLabel(unit)}
          onClose={() => setAccountsOpen(false)}
        />
      ) : null}
    </>
  );
}
