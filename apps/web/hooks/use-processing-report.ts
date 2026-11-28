"use client";

import type { ProcessingSession } from "@/lib/api";
import { useCommand } from "./use-command";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";

function pollReport(session: ProcessingSession | undefined) {
  return !!session && ["sealed", "processing", "waiting_dependency"].includes(session.state);
}

export function useProcessingReport(id: string) {
  const workspace = useWorkspace();
  const resource = useResource<ProcessingSession>(
    workspace.companyPath(`processing-sessions/${id}`),
    { poll: pollReport },
  );
  const command = useCommand();
  const session = resource.data;
  const periodName = workspace.periods.find((period) => period.id === session?.period_id)?.name;

  function run(action: "retry" | "cancel", onSuccess?: () => void) {
    if (!session) return;
    void command.run(
      workspace.companyPath(`processing-sessions/${id}/${action}`),
      { version: session.version, body: {} },
      () => {
        resource.refresh();
        onSuccess?.();
      },
    );
  }

  return {
    workspace,
    resource,
    session,
    periodName,
    issue: session?.issues?.find((issue) => !issue.answer),
    canRetry: !!session && workspace.canWrite && ["failed", "waiting_dependency"].includes(session.state),
    canCancel: !!session && workspace.canWrite && !["completed", "completed_limited", "cancelled"].includes(session.state),
    run,
    busy: command.busy,
    error: command.error?.message,
    clearError: command.clearError,
  };
}
