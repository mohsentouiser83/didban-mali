"use client";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import type { Manifest, ProcessingSession } from "@/lib/api";
import { useWorkspace } from "./workspace";
import { useResource } from "./use-resource";
import { useCommand } from "./use-command";
export function useExistingSourceReport() {
  const workspace = useWorkspace();
  const router = useRouter();
  const command = useCommand();
  const keys = useRef(new Map<string, string>());
  const latest = useResource<Manifest>(
    workspace.periodId && workspace.canWrite
      ? workspace.companyPath("results/latest?view=summary")
      : null,
    { allowMissing: true },
  );
  const available = !!workspace.periodId && workspace.canWrite && !!latest.data;
  const create = () => {
    if (!available || !latest.data) return;
    const intent = latest.data.id + ":" + workspace.periodId;
    if (!keys.current.has(intent))
      keys.current.set(intent, crypto.randomUUID());
    void command.run<ProcessingSession>(
      workspace.companyPath("processing-sessions/from-result"),
      {
        body: { parent_id: latest.data.id, period_id: workspace.periodId },
        key: keys.current.get(intent),
      },
      (session) => router.push(`/uploads/${session.id}`),
    );
  };
  return {
    workspace,
    available,
    create,
    busy: command.busy,
    error: command.error,
  };
}
