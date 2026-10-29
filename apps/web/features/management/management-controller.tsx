"use client";

import { IconTile } from "@/components/ui/app-icon";
import { AppIcon } from "@/components/ui/app-icon";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CalendarDays, FileText, Layers, Plus } from "lucide-react";
import type { Schema } from "@didban/api-client";
import { useCompany, useAccess } from "@/features/companies/use-companies";
import { useResultManifests } from "@/features/results/use-results";
import { useReports } from "@/features/reports/use-reports";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { message } from "@/lib/api";
import { formatDate, formatTime, persianDigits } from "@/lib/dates";
import { formatMoney } from "@/features/results/presentation";
import { useManagement, useManagementCommands } from "./use-management";
import {
  managementModel,
  sourceDetail,
  titles,
  type ManagementKind,
  type DetailModel,
} from "./presentation";
import { StatementsView } from "./statements-view";
import { CashStatementView } from "./cash-statement-view";
import { DailyView } from "./daily-view";
import { AnalysisView } from "./analysis-view";
import { GenerationDialog } from "./generation-dialog";
import { ManagementDetails } from "./details-dialog";

export function ManagementController({ kind }: { kind: ManagementKind }) {
  const { companyId } = useParams<{ companyId: string }>();
  const company = useCompany(companyId),
    access = useAccess(companyId),
    manifests = useResultManifests(companyId),
    reports = useReports(companyId);
  const [manifestChoice, setManifest] = useState(""),
    [reportChoice, setReport] = useState(""),
    [generationOpen, setGenerationOpen] = useState(false),
    [dayChoice, setDay] = useState(""),
    [detailChoice, setDetail] = useState<{ kind: string; key: string } | null>(
      null,
    ),
    [detailPage, setDetailPage] = useState(0),
    [template, setTemplate] = useState<Schema<"StatementTemplate"> | null>(
      null,
    ),
    [templateChoice, setTemplateChoice] = useState("base");
  const manifestRows = manifests.data?.pages.flatMap((p) => p.items) ?? [];
  const manifest = manifestChoice || manifestRows.at(-1)?.id || "";
  const reportRows = (reports.data?.pages.flatMap((p) => p.items) ?? []).filter(
    (r) => r.manifest_id === manifest,
  );
  const selected =
    reportRows.find((r) => r.id === reportChoice) ?? reportRows.at(-1);
  const data = useManagement(
    companyId,
    selected?.id ?? "",
    selected?.management_available === true,
  );
  const commands = useManagementCommands(
    companyId,
    (report) => {
      setReport(report.id);
      setGenerationOpen(false);
      setDay("");
      setDetail(null);
    },
    (parsed) => {
      setTemplate(parsed);
      setTemplateChoice("custom");
    },
  );
  if (
    company.isPending ||
    access.isPending ||
    manifests.isPending ||
    reports.isPending ||
    (!!selected?.management_available && data.isPending)
  )
    return <LoadingState label="در حال دریافت گزارش تحلیلی" layout="table" />;
  const failure =
    company.error ||
    access.error ||
    manifests.error ||
    reports.error ||
    data.error;
  if (failure)
    return (
      <ErrorState
        message={message(failure)}
        onRetry={() => {
          void company.refetch();
          void access.refetch();
          void manifests.refetch();
          void reports.refetch();
          if (selected?.management_available) void data.refetch();
        }}
      />
    );
  const unit = company.data.display_unit;
  const model = data.data ? managementModel(data.data, unit) : null;
  const day =
    model?.days.find((d) => d.date === dayChoice) ?? model?.days.at(-1);
  const rawDay = data.data?.daily.days.find((d) => d.date === day?.date);
  const canOperate = access.data.permissions.includes("company.operate");
  const show = (detailKind: string, key = "") => {
    setDetail({ kind: detailKind, key });
    setDetailPage(0);
  };
  let detail: DetailModel | null = null;
  if (detailChoice && data.data) {
    const sourceRefs =
      detailChoice.kind === "cash-section"
        ? (data.data.cashflow_statement?.sections.find(
            (s) => s.key === detailChoice.key,
          )?.source_refs ?? [])
        : detailChoice.kind === "cash-unclassified"
          ? (data.data.cashflow_statement?.unclassified_refs ?? [])
          : detailChoice.kind === "line"
            ? (data.data.statements.lines
                .find((l) => l.key === detailChoice.key)
                ?.details.flatMap((d) => d.source_refs) ?? [])
            : detailChoice.kind === "driver"
              ? (() => {
                  const driver =
                    data.data.analysis.drivers[Number(detailChoice.key)];
                  return driver
                    ? [...driver.source_refs, ...driver.previous_source_refs]
                    : [];
                })()
              : detailChoice.kind === "expenses"
                ? (rawDay?.expense_source_refs ?? [])
                : [];
    const cash =
      detailChoice.kind === "all-cash"
        ? data.data.analysis.cash_movements
        : detailChoice.kind === "cash-driver"
          ? (data.data.analysis.cash?.drivers[Number(detailChoice.key)]
              ?.source_refs ?? [])
          : detailChoice.kind === "cash"
            ? (rawDay?.movements ?? [])
            : [];
    const rows = sourceRefs
      .map((ref) => sourceDetail(ref, unit))
      .concat(
        cash.map((m, i) => ({
          key: String(i),
          account: m.account_name,
          date: formatDate(m.date),
          file: `${data.data?.sources?.find((source) => source.source_file_id === m.source_file_id)?.file_name ?? m.source_file_id} · ${m.sheet_name}`,
          row: persianDigits(String(m.row_number)),
          amount: formatMoney(m.amount, unit),
        })),
      );
    detail = {
      title:
        detailChoice.kind === "line"
          ? "اسناد سرفصل"
          : detailChoice.kind === "driver"
            ? "اسناد دو دوره"
            : detailChoice.kind === "expenses"
              ? "اسناد هزینه"
              : detailChoice.kind.startsWith("cash-")
                ? "ردیف‌های جریان وجوه نقد"
                : "گردش بانک",
      rows: rows.slice(detailPage * 20, (detailPage + 1) * 20),
      page: `صفحه ${persianDigits(String(detailPage + 1))} از ${persianDigits(String(Math.max(1, Math.ceil(rows.length / 20))))}`,
      more: (detailPage + 1) * 20 < rows.length,
      previous: detailPage > 0,
    };
  }
  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="flex items-center gap-3 font-heading text-[26px] font-medium">
            <IconTile name="ClipboardList" />
            {titles[kind]}
          </h1>
          <p className="text-sm text-muted">{company.data.name}</p>
        </div>
        {canOperate ? (
          <Button
            disabled={!manifest}
            onClick={() => {
              commands.generate.reset();
              commands.resetTemplateError();
              setGenerationOpen(true);
            }}
          >
            <Plus size={17} aria-hidden />
            تهیه گزارش
          </Button>
        ) : null}
      </header>
      <section className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <label
            htmlFor="management-manifest"
            className="flex items-center gap-2 flex items-center gap-2"
          >
            <Layers size={17} aria-hidden />
            نسخه داده
          </label>
          <Select
            id="management-manifest"
            disabled={!manifestRows.length}
            label="نسخه داده"
            value={manifest}
            onValueChange={(value) => {
              setManifest(value);
              setReport("");
              setDay("");
              setDetail(null);
            }}
            options={manifestRows.map((m) => ({
              value: m.id,
              label: `تا ${formatDate(m.as_of_date)} · ${formatTime(m.published_at)}`,
            }))}
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor="management-report"
            className="flex items-center gap-2"
          >
            <FileText size={17} aria-hidden />
            نسخه گزارش
          </label>
          <Select
            id="management-report"
            disabled={!reportRows.length}
            label="نسخه گزارش"
            value={selected?.id ?? ""}
            onValueChange={(value) => {
              setReport(value);
              setDay("");
              setDetail(null);
            }}
            options={reportRows.map((r) => ({
              value: r.id,
              label: `نسخه ${persianDigits(String(r.revision_number ?? r.version))} · ${formatTime(r.created_at)}`,
            }))}
          />
        </div>
      </section>
      {model ? (
        <>
          <section className="flex flex-wrap items-center justify-between gap-4 rounded-summary border border-border bg-surface p-5 sm:p-7">
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm">
                <CalendarDays size={17} aria-hidden />
                {model.range}
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge tone="neutral">تولیدشده سامانه</Badge>
                <Badge tone="neutral">
                  {data.data?.statement_basis === "trial_balance"
                    ? "مبنای صورت‌ها: تراز آزمایشی"
                    : "مبنای صورت‌ها: دفتر"}
                </Badge>
                {selected?.scope_status === "limited" ? (
                  <Badge tone="warning">پوشش محدود</Badge>
                ) : null}
                <Badge
                  tone={selected?.approval_ids.length ? "success" : "neutral"}
                >
                  {selected?.approval_ids.length
                    ? "تأیید مسئول مالی ثبت شده"
                    : "بدون تأیید مسئول مالی"}
                </Badge>
              </div>
            </div>
            <Button asChild variant="secondary">
              <Link
                href={`/companies/${companyId}/reports/${selected?.id}`}
                prefetch={false}
              >
                <AppIcon name="Check" />
                دانلود و تأیید همین نسخه
              </Link>
            </Button>
          </section>
          {kind === "statements" ? (
            <StatementsView
              model={model}
              onDetails={(key) => show("line", key)}
            />
          ) : kind === "cash-statement" ? (
            <CashStatementView
              model={model}
              onDetails={(key) =>
                show(
                  key === "unclassified" ? "cash-unclassified" : "cash-section",
                  key,
                )
              }
            />
          ) : kind === "daily" ? (
            <DailyView
              model={model}
              day={day}
              onDay={setDay}
              onDetails={(detailKind) => show(detailKind)}
              showForecast={day?.date === data.data?.as_of_date}
            />
          ) : (
            <AnalysisView
              key={selected?.id}
              model={model}
              onDriver={(key) => show("driver", key)}
              onCash={() => show("all-cash")}
              onCashDriver={(key) => show("cash-driver", key)}
            />
          )}
        </>
      ) : (
        <EmptyState
          icon="ClipboardList"
          title={
            !manifest ? "نتیجه مالی آماده نیست" : "این نسخه گزارش تحلیلی ندارد"
          }
          action={
            canOperate ? (
              manifest ? (
                <Button onClick={() => setGenerationOpen(true)}>
                  <AppIcon name="ClipboardList" />
                  تهیه گزارش تحلیلی
                </Button>
              ) : (
                <Button asChild>
                  <Link
                    href={`/companies/${companyId}/uploads`}
                    prefetch={false}
                  >
                    <AppIcon name="UploadCloud" />
                    بارگذاری فایل‌ها
                  </Link>
                </Button>
              )
            ) : null
          }
        />
      )}
      {reports.hasNextPage || manifests.hasNextPage ? (
        <div className="flex flex-wrap gap-3">
          {reports.hasNextPage ? (
            <Button
              variant="secondary"
              disabled={reports.isFetchingNextPage}
              onClick={() => {
                void reports.fetchNextPage();
              }}
            >
              <AppIcon name="ChevronsDown" />
              گزارش‌های بیشتر
            </Button>
          ) : null}
          {manifests.hasNextPage ? (
            <Button
              variant="secondary"
              disabled={manifests.isFetchingNextPage}
              onClick={() => {
                void manifests.fetchNextPage();
              }}
            >
              <AppIcon name="ChevronsDown" />
              نسخه‌های داده بیشتر
            </Button>
          ) : null}
        </div>
      ) : null}
      <GenerationDialog
        open={generationOpen}
        onOpen={setGenerationOpen}
        busy={commands.generate.isPending}
        parsing={commands.importing}
        error={
          commands.generate.error ? message(commands.generate.error) : null
        }
        parseError={
          commands.fileError ??
          (commands.parse.error ? message(commands.parse.error) : null)
        }
        company={companyId}
        report={selected?.management_available ? selected.id : undefined}
        templateName={
          templateChoice === "custom"
            ? (template?.name ?? "")
            : templateChoice === "current"
              ? (data.data?.template?.name ?? "")
              : ""
        }
        templateChoice={templateChoice}
        templateOptions={[
          { value: "base", label: "قالب پایه" },
          ...(data.data?.template
            ? [{ value: "current", label: "قالب همین گزارش" }]
            : []),
          ...(template
            ? [{ value: "custom", label: "قالب Excel انتخاب‌شده" }]
            : []),
        ]}
        onTemplateChoice={setTemplateChoice}
        onFile={(file) => {
          void commands.importTemplate(file);
        }}
        onSubmit={(form) => {
          const options: Schema<"ManagementReportRequest"> = {};
          const start = String(form.get("starts_on") ?? "");
          const cutoff = String(form.get("as_of_date") ?? "");
          const basis = form.get("statement_basis");
          if (basis === "ledger" || basis === "trial_balance")
            options.statement_basis = basis;
          if (start) options.starts_on = start;
          if (cutoff) options.as_of_date = cutoff;
          const chosen =
            templateChoice === "custom"
              ? template
              : templateChoice === "current"
                ? data.data?.template
                : null;
          if (chosen) options.template = chosen;
          commands.generate.mutate({ manifest, options });
        }}
      />
      <ManagementDetails
        detail={detail}
        onClose={() => setDetail(null)}
        onNext={() => setDetailPage((p) => p + 1)}
        onPrevious={() => setDetailPage((p) => Math.max(0, p - 1))}
      />
    </div>
  );
}
