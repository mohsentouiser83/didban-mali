"use client";
import { useParams } from "next/navigation";
import { useAccess, useCompany } from "@/features/companies/use-companies";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { formatTime } from "@/lib/dates";
import { count, sessionLabel } from "./presentation";
import { message } from "@/lib/api";
import { useSessions } from "./use-intake";
import { useUploadBatch } from "./use-upload-batch";
import { UploadListView } from "./uploads-view";
export function UploadsController() {
  const { companyId } = useParams<{ companyId: string }>(),
    company = useCompany(companyId),
    access = useAccess(companyId),
    sessions = useSessions(companyId),
    batch = useUploadBatch(companyId);
  if (company.isPending || access.isPending || sessions.isPending)
    return <LoadingState />;
  if (company.error || access.error || sessions.error)
    return (
      <ErrorState
        message={message(company.error || access.error || sessions.error)}
        onRetry={() => {
          void company.refetch();
          void access.refetch();
          void sessions.refetch();
        }}
      />
    );
  return (
    <UploadListView
      companyId={companyId}
      company={company.data.name}
      sessions={sessions.data.pages
        .flatMap((p) => p.items)
        .map((session) => ({
          id: session.id,
          created: formatTime(session.created_at),
          prepared: count(
            session.steps.filter(
              (s) => s.kind.startsWith("prepare:") && s.status === "succeeded",
            ).length,
          ),
          status: sessionLabel(session),
          tone:
            session.status === "waiting_input" || session.status === "failed"
              ? "warning"
              : session.interpretation_finished_at
                ? "success"
                : "neutral",
        }))}
      canOperate={access.data.permissions.includes("company.operate")}
      onFiles={(files) => batch.start(files, null)}
      busy={batch.busy}
      error={batch.error}
      progress={batch.progress}
      onRetry={batch.retryable ? batch.retry : undefined}
      more={sessions.hasNextPage}
      onMore={() => {
        void sessions.fetchNextPage();
      }}
      moreBusy={sessions.isFetchingNextPage}
    />
  );
}
