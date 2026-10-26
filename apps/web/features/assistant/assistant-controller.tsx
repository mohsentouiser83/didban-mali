"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { LoadingState, ErrorState } from "@/components/ui/states";
import {
  useResultManifests,
  useResultEvidence,
} from "@/features/results/use-results";
import { usePeriods } from "@/features/periods/use-periods";
import { formatTime } from "@/lib/dates";
import { message } from "@/lib/api";
import { AssistantView } from "./assistant-view";
import { AssistantEvidenceView } from "./assistant-evidence-view";
import { formatMoney } from "@/features/results/presentation";
import {
  useAssistantCommands,
  useAssistantQuestions,
  useModelStatus,
} from "./use-assistant";
const statuses: Record<string, string> = {
  pending: "در انتظار پردازش",
  ready: "پاسخ آماده",
  waiting_dependency: "در انتظار سرویس",
  failed: "پاسخ آماده نشد",
};
const reasons: Record<string, string> = {
  model_unavailable: "مدل در دسترس نیست.",
  budget_exhausted: "سقف هزینه پر شده است.",
  budget_not_configured: "سقف هزینه تنظیم نشده است.",
  usage_unknown: "مصرف درخواست نامشخص است؛ مدیر باید بررسی کند.",
  model_output_invalid: "پاسخ مدل معتبر نبود.",
  model_result_unavailable: "نتیجه درخواست دریافت نشد؛ پرسش تازه ثبت کنید.",
  permission_revoked: "دسترسی درخواست‌کننده لغو شده است.",
  model_input_limit: "پرسش طولانی است؛ کوتاه‌تر بپرسید.",
};
export function AssistantController() {
  const { companyId } = useParams<{ companyId: string }>();
  const manifests = useResultManifests(companyId),
    periods = usePeriods(companyId),
    questions = useAssistantQuestions(companyId),
    status = useModelStatus(companyId),
    commands = useAssistantCommands(companyId);
  const [manifest, setManifest] = useState(""),
    [question, setQuestion] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [index, setIndex] = useState(0);
  const rows = questions.data?.pages.flatMap((p) => p.items) ?? [];
  const selectedQuestion = rows.find((q) => q.id === selected);
  const evidence = useResultEvidence(
    companyId,
    selectedQuestion?.evidence_refs[index] ?? null,
  );
  if (
    manifests.isPending ||
    questions.isPending ||
    periods.isPending ||
    status.isPending
  )
    return <LoadingState />;
  const error =
    manifests.error || questions.error || periods.error || status.error;
  if (error)
    return (
      <ErrorState
        message={message(error)}
        onRetry={() => {
          void manifests.refetch();
          void questions.refetch();
          void periods.refetch();
          void status.refetch();
        }}
      />
    );
  const periodNames = new Map(
    periods.data.pages.flatMap((p) => p.items).map((p) => [p.id, p.name]),
  );
  const options = manifests.data.pages
    .flatMap((p) => p.items)
    .map((m) => ({
      value: m.id,
      label: `${periodNames.get(m.period_id) ?? "نسخه مالی"} · ${formatTime(m.published_at)}`,
    }));
  const busy = commands.ask.isPending || commands.retry.isPending;
  return (
    <>
      <AssistantView
        company={companyId}
        configured={status.data.configured}
        manifests={options}
        manifest={manifest}
        question={question}
        questions={rows.map((q) => ({
          id: q.id,
          question: q.question,
          answer:
            q.answer_fa ??
            (q.dependency_code
              ? (reasons[q.dependency_code] ??
                "برای ادامه، سرویس باید بررسی شود.")
              : null),
          status: statuses[q.status],
          tone:
            q.status === "ready"
              ? "success"
              : q.status === "waiting_dependency"
                ? "warning"
                : "neutral",
          time: formatTime(q.created_at),
          manifestPath: `/companies/${companyId}/results/${q.manifest_id}`,
          relatedPath: q.related_path,
          canRetry:
            q.status === "waiting_dependency" &&
            [
              "model_unavailable",
              "budget_exhausted",
              "budget_not_configured",
            ].includes(q.dependency_code ?? ""),
          hasEvidence: q.evidence_refs.length > 0,
        }))}
        busy={busy}
        error={
          commands.ask.error || commands.retry.error
            ? message(commands.ask.error || commands.retry.error)
            : null
        }
        more={questions.hasNextPage}
        busyMore={questions.isFetchingNextPage}
        onManifest={setManifest}
        onQuestion={setQuestion}
        onAsk={() =>
          commands.ask.mutate(
            { manifest, question },
            { onSuccess: () => setQuestion("") },
          )
        }
        onRetry={(id) => {
          const row = rows.find((q) => q.id === id);
          if (row) commands.retry.mutate(row);
        }}
        onEvidence={(id) => {
          setSelected(id);
          setIndex(0);
        }}
        onMore={() => {
          void questions.fetchNextPage();
        }}
        moreManifests={manifests.hasNextPage}
        onMoreManifests={() => {
          void manifests.fetchNextPage();
        }}
      />
      {selectedQuestion ? (
        <AssistantEvidenceView
          loading={evidence.isPending}
          error={evidence.error ? message(evidence.error) : null}
          description={evidence.data?.description_fa ?? null}
          sheet={evidence.data?.sheet_name ?? null}
          row={evidence.data?.row_number?.toLocaleString("fa-IR") ?? "—"}
          facts={(evidence.data?.fact_values ?? []).map(
            (value) => `${formatMoney(value, "IRR")} ریال`,
          )}
          position={(index + 1).toLocaleString("fa-IR")}
          total={selectedQuestion.evidence_refs.length.toLocaleString("fa-IR")}
          first={index === 0}
          last={index + 1 >= selectedQuestion.evidence_refs.length}
          onClose={() => setSelected(null)}
          onPrevious={() => setIndex(index - 1)}
          onNext={() => setIndex(index + 1)}
          onRetry={() => {
            void evidence.refetch();
          }}
        />
      ) : null}
    </>
  );
}
