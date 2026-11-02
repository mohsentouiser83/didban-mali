"use client";
import { useEffect, useRef, useState } from "react";
import { useCommand } from "./use-command";
import { useWorkspace } from "./workspace";
interface ReminderDraft {
  snapshot: { manifest_id: string; invoice_id: string; as_of_date: string };
  digest: string;
  text: string;
  external_send_available: false;
}
interface ReminderState {
  scope: string;
  invoiceId: string;
  manifestId: string;
  draft?: ReminderDraft;
  text: string;
}
export function useCollectionReminder() {
  const workspace = useWorkspace();
  const command = useCommand();
  const scope = `${workspace.user?.id}:${workspace.company?.id}:${workspace.canWrite}`;
  const currentScope = useRef(scope);
  const generation = useRef(0);
  useEffect(() => {
    currentScope.current = scope;
  }, [scope]);
  const [state, setState] = useState<ReminderState | null>(null);
  const [feedback, setFeedback] = useState<{
    error?: string;
    copied?: boolean;
  }>({});
  const current = state?.scope === scope ? state : null;
  function path(invoiceId: string, manifestId: string) {
    return workspace.companyPath(
      `collection-assistant/invoices/${invoiceId}/reminder?manifest_id=${encodeURIComponent(manifestId)}`,
    );
  }
  function open(invoiceId: string, manifestId: string) {
    if (!workspace.canWrite) return;
    const requestGeneration = ++generation.current;
    setFeedback({});
    command.clearError();
    setState({ scope, invoiceId, manifestId, text: "" });
    void command.run<ReminderDraft>(
      path(invoiceId, manifestId),
      { method: "GET" },
      (draft) => {
        if (
          generation.current === requestGeneration &&
          currentScope.current === scope
        ) {
          setState({ scope, invoiceId, manifestId, draft, text: draft.text });
        }
      },
    );
  }
  async function copy() {
    if (!current?.draft || !current.text.trim()) return;
    const requested = generation.current;
    setFeedback({});
    const fresh = await command.run<ReminderDraft>(
      path(current.invoiceId, current.manifestId),
      { method: "GET" },
    );
    if (
      !fresh ||
      generation.current !== requested ||
      currentScope.current !== scope
    )
      return;
    if (fresh.digest !== current.draft.digest) {
      setFeedback({
        error: "مانده یا نسخه فاکتور تغییر کرده؛ متن را دوباره بسازید.",
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(current.text);
      if (generation.current === requested && currentScope.current === scope)
        setFeedback({ copied: true });
    } catch {
      setFeedback({ error: "کپی انجام نشد؛ متن را دستی انتخاب کنید." });
    }
  }
  return {
    current,
    command,
    feedback,
    open,
    copy,
    canPrepare: workspace.canWrite,
    close: () => {
      generation.current += 1;
      setState(null);
    },
    change: (text: string) => {
      if (current) setState({ ...current, text });
      setFeedback({});
    },
  };
}
