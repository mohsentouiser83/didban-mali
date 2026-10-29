"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useAccess, useCompany } from "@/features/companies/use-companies";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { message } from "@/lib/api";
import { formatTime } from "@/lib/dates";
import {
  useSession,
  useFiles,
  useSessionCommands,
  useIssues,
} from "./use-intake";
import { useUploadBatch } from "./use-upload-batch";
import {
  count,
  size,
  sessionLabel,
  errors,
  dependencies,
} from "./presentation";
import { ProcessingQuestion } from "./processing-question";
import { SessionView } from "./session-view";
import { processingProgress, processingFileState } from "./processing-progress";
import { InputReviewController } from "@/features/input-review/input-review-controller";
import { useReport } from "@/features/reports/use-reports";
export function SessionController() {
  const { companyId, sessionId } = useParams<{
      companyId: string;
      sessionId: string;
    }>(),
    access = useAccess(companyId),
    company = useCompany(companyId),
    session = useSession(companyId, sessionId);
  const finished =
    !!session.data?.interpretation_finished_at ||
    ["failed", "cancelled"].includes(session.data?.status ?? "");
  const files = useFiles(companyId, sessionId, finished),
    commands = useSessionCommands(companyId, sessionId),
    batch = useUploadBatch(companyId, sessionId);
  const report = useReport(companyId, session.data?.report_id ?? undefined);
  const issues = useIssues(
    companyId,
    sessionId,
    session.data?.status === "waiting_input",
  );
  const [manualOpen, setManualOpen] = useState(false);
  if (
    access.isPending ||
    company.isPending ||
    session.isPending ||
    files.isPending
  )
    return <LoadingState />;
  if (access.error || company.error || session.error || files.error)
    return (
      <ErrorState
        message={message(
          access.error || company.error || session.error || files.error,
        )}
        onRetry={() => {
          void access.refetch();
          void company.refetch();
          void session.refetch();
          void files.refetch();
        }}
      />
    );
  const data = session.data,
    canOperate = access.data.permissions.includes("company.operate");
  const stepDependency = data.steps.find(
      (s) => s.status === "waiting_dependency" && s.dependency_code,
    )?.dependency_code,
    waitingSteps = data.steps
      .filter((s) => s.status === "waiting_dependency")
      .map((s) => s.id);
  const actionError =
    commands.cancel.error ||
    commands.seal.error ||
    commands.retry.error ||
    commands.calculate.error ||
    commands.analyze.error ||
    commands.interpret.error;
  const fileRows = files.data.items.map((f) => ({
    id: f.id,
    name: f.original_name,
    size: size(f.byte_size),
    ...processingFileState(f, data),
    rows: f.preparation_summary
      ? count(f.preparation_summary.nonempty_rows)
      : undefined,
    error: f.error_code
      ? (errors[f.error_code] ?? "فایل نیاز به بررسی دارد.")
      : undefined,
    rejected: f.status === "rejected",
    href: f.preparation_summary
      ? `/companies/${companyId}/uploads/${sessionId}/files/${f.id}`
      : undefined,
    summary: f.interpretation_summary
      ? `${count(f.interpretation_summary.valid_rows)} معتبر · ${count(f.interpretation_summary.rejected_rows)} ردشده · ${count(f.interpretation_summary.excluded_rows)} کنارگذاشته`
      : undefined,
  }));
  return (
    <>
      <SessionView
        review={
          canOperate &&
          data.input_review_required &&
          data.interpretation_finished_at &&
          !data.manifest_id ? (
            <InputReviewController
              companyId={companyId}
              sessionId={sessionId}
            />
          ) : undefined
        }
        companyId={companyId}
        title={`${company.data.name} · ${formatTime(data.created_at)}`}
        purpose={data.purpose}
        state={sessionLabel(data)}
        files={fileRows}
        processingStages={processingProgress(
          data,
          files.data.items,
          report.data?.exports,
        )}
        completed={
          data.purpose === "forecast"
            ? "بر پایه نسخه مشخص نتایج مالی"
            : `${count(data.steps.filter((s) => s.kind.startsWith("prepare:") && s.status === "succeeded").length)} از ${count(files.data.items.length)} فایل آماده`
        }
        canOperate={canOperate}
        receiving={data.status === "receiving"}
        canCancel={
          !["cancelled", "failed", "completed", "completed_limited"].includes(
            data.status,
          )
        }
        canRetry={
          waitingSteps.length > 0 && data.status === "waiting_dependency"
        }
        prepared={!!data.interpretation_finished_at}
        financialFinished={!!data.financial_finished_at}
        analysisFinished={!!data.analysis_finished_at}
        reportHref={
          data.report_id
            ? `/companies/${companyId}/reports/${data.report_id}`
            : undefined
        }
        onAnalyze={
          data.manifest_id &&
          !data.analysis_finished_at &&
          data.status === "waiting_dependency" &&
          !data.steps.some((step) => step.kind.startsWith("analysis:"))
            ? () => commands.analyze.mutate(data.session_version)
            : undefined
        }
        resultHref={
          data.manifest_id
            ? `/companies/${companyId}/results/${data.manifest_id}`
            : undefined
        }
        onCalculate={
          data.period_id &&
          data.interpretation_finished_at &&
          (!data.input_review_required || data.input_review_confirmed) &&
          !data.financial_finished_at &&
          data.status === "waiting_dependency" &&
          !data.steps.some((step) => step.kind.startsWith("financial:"))
            ? () => commands.calculate.mutate(data.session_version)
            : undefined
        }
        onInterpret={
          data.preparation_finished_at &&
          !data.manifest_id &&
          ((data.status === "waiting_dependency" &&
            !data.steps.some((s) => s.kind.startsWith("interpret:"))) ||
            (data.status === "waiting_input" &&
              issues.data?.items.some((issue) =>
                ["interpretation_mapping", "interpretation_kind"].includes(
                  issue.code,
                ),
              )))
            ? () => commands.interpret.mutate(data.session_version)
            : undefined
        }
        interpretLabel={
          data.status === "waiting_input"
            ? "تشخیص خودکار دوباره"
            : "ادامه تفسیر فایل‌ها"
        }
        dependency={stepDependency ? dependencies[stepDependency] : undefined}
        onFiles={(files) => batch.start(files, data.period_id)}
        onSeal={() =>
          commands.seal.mutate({
            version: data.session_version,
            files: files.data.items.map((f) => f.id),
          })
        }
        onCancel={() => commands.cancel.mutate(data.session_version)}
        onRetry={() =>
          commands.retry.mutate({
            version: data.session_version,
            steps: waitingSteps,
          })
        }
        onQuestion={() => setManualOpen(true)}
        question={data.status === "waiting_input"}
        commandBusy={
          commands.cancel.isPending ||
          commands.seal.isPending ||
          commands.retry.isPending ||
          commands.calculate.isPending ||
          commands.analyze.isPending ||
          commands.interpret.isPending
        }
        error={batch.error || (actionError ? message(actionError) : undefined)}
        uploadBusy={batch.busy}
        progress={batch.progress}
        onUploadRetry={batch.retryable ? batch.retry : undefined}
      />
      <ProcessingQuestion
        companyId={companyId}
        session={data}
        canOperate={canOperate}
        requested={manualOpen}
        onClose={() => setManualOpen(false)}
      />
    </>
  );
}
