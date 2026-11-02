"use client";
import { useState } from "react";
import { useWorkspace } from "./workspace";
import { useCommand } from "./use-command";
import { useResource } from "./use-resource";
import { usePagedResource } from "./use-paged-resource";
import type { AccountingCapabilities } from "@/lib/accounting";
export function useOpeningEvidence(onSaved: () => void) {
  const workspace = useWorkspace();
  const command = useCommand();
  const capabilities = useResource<AccountingCapabilities>(
    workspace.companyPath("accounting/capabilities"),
  );
  const history = usePagedResource<{
    id: string;
    period_id: string;
    reason: string;
    revoked: boolean;
  }>(workspace.companyPath("accounting/zero-opening-evidence"));
  const [target, setTarget] = useState<{
    kind: "zero" | "journal" | "revoke";
    id: string;
    digest?: string;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);
  function open(
    kind: "zero" | "journal" | "revoke",
    id: string,
    digest?: string,
  ) {
    setTarget({ kind, id, digest });
    setReason("");
    setAck(false);
    command.clearError();
  }
  function save() {
    if (!target || !reason.trim() || !ack) return;
    const suffix =
      target.kind === "zero"
        ? "zero-opening-evidence"
        : target.kind === "journal"
          ? "opening-evidence"
          : `zero-opening-evidence/${target.id}/revoke`;
    const body =
      target.kind === "zero"
        ? { period_id: target.id, reason: reason.trim() }
        : target.kind === "journal"
          ? {
              journal_id: target.id,
              digest: target.digest,
              reason: reason.trim(),
            }
          : { reason: reason.trim() };
    void command.run(
      workspace.companyPath(`accounting/${suffix}`),
      { body },
      () => {
        setTarget(null);
        history.refresh();
        onSaved();
      },
      "مبنای افتتاحیه ثبت شد.",
    );
  }
  return {
    target,
    reason,
    setReason,
    ack,
    setAck,
    command,
    history,
    canDeclare:
      !!capabilities.data?.can_post && !!capabilities.data?.posting_available,
    openZero: (period: string) => open("zero", period),
    openJournal: (id: string, digest: string) => open("journal", id, digest),
    openRevoke: (id: string) => open("revoke", id),
    close: () => {
      if (!command.busy) setTarget(null);
    },
    save,
  };
}
