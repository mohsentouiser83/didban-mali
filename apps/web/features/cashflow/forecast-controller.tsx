"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useCompany, useAccess } from "@/features/companies/use-companies";
import { useWorkspaceManifests } from "@/features/settlements/use-settlements";
import { useSession } from "@/features/intake/use-intake";
import { ProcessingQuestion } from "@/features/intake/processing-question";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { formatDate, persianDigits } from "@/lib/dates";
import { message } from "@/lib/api";
import { formatMoney } from "@/features/results/presentation";
import { createFinancialChartData } from "@/components/ui/financial/chart-data";
import {
  useForecastRuns,
  useForecastRun,
  useStartForecast,
} from "./use-forecast";
import { ForecastView, ForecastStartDialog } from "./forecast-view";
function PendingQuestions({
  company,
  sessionId,
  canOperate,
}: {
  company: string;
  sessionId: string;
  canOperate: boolean;
}) {
  const session = useSession(company, sessionId);
  return session.data ? (
    <ProcessingQuestion
      companyId={company}
      session={session.data}
      canOperate={canOperate}
      showTrigger
    />
  ) : null;
}
const reasonLabels: Record<string, string> = {
  balance_anchor_missing: "مانده مبنای معتبر موجود نیست.",
  expected_date_unknown: "موارد با زمان نامشخص در این برآورد نیامده‌اند.",
  invoice_balance_unknown: "مانده برخی فاکتورها قابل محاسبه نیست.",
  payment_history_unknown: "سابقه پرداخت برخی تعهدها کافی نیست.",
  future_payment_coverage_unknown: "کامل بودن پرداخت‌های آینده تأیید نشده است.",
  forecast_policy_unconfirmed: "زمان وصول به پاسخ‌های موردی کاربر وابسته است.",
  forecast_sources_missing: "فاکتور باز یا برنامه پرداخت معتبر موجود نیست.",
  receivable_source_missing: "منبع دریافت‌های آینده کامل نیست.",
  obligation_overlap: "تعهدهای هم‌پوشان نیازمند بررسی‌اند.",
};
export function ForecastController() {
  const { companyId } = useParams<{ companyId: string }>(),
    company = useCompany(companyId),
    access = useAccess(companyId),
    manifests = useWorkspaceManifests(companyId);
  const [chosen, setChosen] = useState<string | null>(null),
    [chosenRun, setChosenRun] = useState<string | null>(null),
    [selectedDay, setSelectedDay] = useState("0"),
    [dayOpen, setDayOpen] = useState(false),
    [startOpen, setStartOpen] = useState(false);
  const manifest =
    manifests.data?.find((m) => m.id === chosen) ?? manifests.data?.at(-1);
  const runs = useForecastRuns(companyId, manifest?.id),
    selected = runs.data?.find((r) => r.id === chosenRun) ?? runs.data?.at(-1),
    run = useForecastRun(companyId, selected?.id);
  const start = useStartForecast(companyId, (row) => {
    setChosenRun(row.id);
    setStartOpen(false);
  });
  if (
    company.isPending ||
    access.isPending ||
    manifests.isPending ||
    (manifest && runs.isPending) ||
    (selected && run.isPending)
  )
    return <LoadingState />;
  const error =
    company.error || access.error || manifests.error || runs.error || run.error;
  if (error)
    return (
      <ErrorState
        message={message(error)}
        onRetry={() => {
          void company.refetch();
          void access.refetch();
          void manifests.refetch();
          void runs.refetch();
          void run.refetch();
        }}
      />
    );
  if (!manifest) return <EmptyState title="نتیجه مالی آماده نیست" />;
  const data = run.data,
    forecast = data?.forecast,
    unit = company.data.display_unit,
    canOperate = access.data.permissions.includes("company.operate"),
    day = forecast?.days[Number(selectedDay)],
    summary = forecast?.summary;
  return (
    <>
      <ForecastView
        company={company.data}
        manifest={manifest.id}
        manifests={(manifests.data ?? []).map((m, i) => ({
          value: m.id,
          label: `نسخه ${persianDigits(String(i + 1))} · ${formatDate(m.as_of_date)}`,
        }))}
        onManifest={(id) => {
          setChosen(id);
          setChosenRun(null);
          setSelectedDay("0");
        }}
        run={data?.id ?? ""}
        runs={(runs.data ?? []).map((r, i) => ({
          value: r.id,
          label: `نسخه ${persianDigits(String(i + 1))} · ${r.status === "published" ? "منتشرشده" : "منتظر پاسخ"}`,
        }))}
        onRun={(id) => {
          setChosenRun(id);
          setSelectedDay("0");
        }}
        asOf={formatDate(forecast?.as_of_date ?? manifest.as_of_date)}
        status={
          data?.status === "waiting_input"
            ? "نیازمند پاسخ"
            : forecast?.status === "estimated"
              ? "برآوردی"
              : forecast?.status === "limited"
                ? "برآورد محدود"
                : "داده کافی نیست"
        }
        unit={unit === "IRT" ? "تومان" : "ریال"}
        metrics={[
          {
            title: "مانده پایان ۳۰ روز",
            value: formatMoney(summary?.ending ?? null, unit),
          },
          {
            title: "کمترین مانده برآوردی",
            value: formatMoney(summary?.minimum ?? null, unit),
            detail: summary?.minimum_on
              ? formatDate(summary.minimum_on)
              : undefined,
          },
          {
            title: "پرداخت مورد انتظار",
            value: formatMoney(summary?.expected_out ?? null, unit),
          },
        ]}
        chart={createFinancialChartData(
          (forecast?.days ?? []).map((d) => ({
            label: formatDate(d.date),
            value: d.closing,
          })),
        )}
        day={
          day
            ? {
                date: formatDate(day.date),
                opening: formatMoney(day.opening, unit),
                incoming: formatMoney(day.expected_in, unit),
                outgoing: formatMoney(day.expected_out, unit),
                closing: formatMoney(day.closing, unit),
                status: day.status,
                reason: day.reason_codes
                  .map(
                    (r) =>
                      reasonLabels[r] ?? "داده بخشی از پیش‌بینی کامل نیست.",
                  )
                  .join(" "),
              }
            : null
        }
        dayOptions={(forecast?.days ?? []).map((d, i) => ({
          value: String(i),
          label: formatDate(d.date),
        }))}
        selectedDay={selectedDay}
        onDay={setSelectedDay}
        onDetails={() => setDayOpen(true)}
        dayOpen={dayOpen}
        onCloseDay={() => setDayOpen(false)}
        assumptions={forecast?.assumptions ?? []}
        pending={data?.status === "waiting_input"}
        questions={
          data?.status === "waiting_input" ? (
            <PendingQuestions
              company={companyId}
              sessionId={data.session_id}
              canOperate={canOperate}
            />
          ) : null
        }
        canStart={canOperate && data?.status !== "waiting_input"}
        onStart={() => {
          start.reset();
          setStartOpen(true);
        }}
      />
      {startOpen ? (
        <ForecastStartDialog
          open
          onClose={() => setStartOpen(false)}
          busy={start.isPending}
          error={start.error ? message(start.error) : null}
          onSubmit={(form) =>
            start.mutate({
              manifest: manifest.id,
              minimum_events: Number(form.get("minimum_events")),
              lookback_days: Number(form.get("lookback_days")),
            })
          }
        />
      ) : null}
    </>
  );
}
