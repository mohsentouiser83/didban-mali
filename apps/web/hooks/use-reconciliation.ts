"use client";
import { useState } from "react";
import type {
  ReconciliationCandidate,
  ReconciliationOptions,
  ReconciliationRun,
} from "@/lib/api";
import { useWorkspace } from "./workspace";
import { useResource } from "./use-resource";
import { useCommand } from "./use-command";
export function useReconciliation() {
  const workspace = useWorkspace();
  const latest = useResource<ReconciliationRun>(
    workspace.companyPath("reconciliations/latest"),
    { allowMissing: true },
  );
  const options = useResource<ReconciliationOptions>(
    workspace.companyPath("reconciliation-options"),
    { allowMissing: true },
  );
  const command = useCommand();
  const [mapping, setMappingState] = useState<{
    manifestId?: string;
    values: Record<string, string>;
  }>({ values: {} });
  const [pageState, setPageState] = useState<{ runId?: string; page: number }>({
    page: 0,
  });
  const page = pageState.runId === latest.data?.id ? pageState.page : 0;
  const candidates =
    latest.data?.candidates.slice(page * 25, (page + 1) * 25) || [];
  const selectedMapping = {
    ...(latest.data?.manifest_id === options.data?.manifest_id
      ? latest.data?.bank_to_ledger
      : {}),
    ...(mapping.manifestId === options.data?.manifest_id ? mapping.values : {}),
  };
  const setMapping = (bank: string, account: string) =>
    setMappingState((previous) => ({
      manifestId: options.data?.manifest_id,
      values: {
        ...(previous.manifestId === options.data?.manifest_id
          ? previous.values
          : {}),
        [bank]: account,
      },
    }));
  const create = () =>
    command.run<ReconciliationRun>(
      workspace.companyPath("reconciliations"),
      {
        body: {
          manifest_id: options.data?.manifest_id,
          bank_to_ledger: Object.fromEntries(
            Object.entries(selectedMapping).filter(([, account]) => !!account),
          ),
        },
      },
      () => latest.refresh(),
      "تطبیق انجام شد.",
    );
  const decide = (
    candidate: ReconciliationCandidate,
    decision: "accepted" | "rejected",
    reason: string,
    onDone: () => void,
  ) =>
    command.run(
      workspace.companyPath(
        `reconciliation-proposals/${candidate.id}/decisions`,
      ),
      {
        body: {
          run_id: latest.data?.id,
          expected_version: candidate.version,
          decision,
          reason: reason.trim(),
        },
        version: candidate.version,
      },
      () => {
        latest.refresh();
        onDone();
      },
      "تصمیم تطبیق ثبت شد.",
    );
  return {
    workspace,
    latest,
    options,
    command,
    selectedMapping,
    setMapping,
    create,
    decide,
    candidates,
    page,
    total: latest.data?.candidates.length || 0,
    previousPage: () =>
      setPageState({ runId: latest.data?.id, page: Math.max(0, page - 1) }),
    nextPage: () => setPageState({ runId: latest.data?.id, page: page + 1 }),
  };
}
