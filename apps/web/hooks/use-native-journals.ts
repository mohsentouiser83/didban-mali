"use client";
import { useState } from "react";
import { useWorkspace } from "./workspace";
import { usePagedResource } from "./use-paged-resource";
import { useResource } from "./use-resource";
import { useCommand } from "./use-command";
import type { PostingPreview } from "./use-posting";
import type { AccountingCapabilities } from "@/lib/accounting";
export interface NativeJournal {
  id: string;
  draft_id: string;
  digest: string;
  sequence: number;
  date: string;
  draft_version: number;
  reversal_of: string | null;
  replacement_of: string | null;
  snapshot: PostingPreview["snapshot"] & { period_id: string };
}
interface BookBalance {
  items: {
    account_id: string;
    party_id: string;
    code: string;
    name: string;
    debit: string;
    credit: string;
    balance: string;
  }[];
  total_debit: string;
  total_credit: string;
}
export function useNativeJournals() {
  const workspace = useWorkspace();
  const path = workspace.companyPath("accounting");
  const journals = usePagedResource<NativeJournal>(
    path ? path + "/journals" : null,
  );
  const reportRuns = usePagedResource<{
    id: string;
    created_at: string;
    snapshot: { as_of: string; period_id: string };
  }>(path ? path + "/trial-balance/runs" : null);
  const capabilities = useResource<AccountingCapabilities>(
    path ? path + "/capabilities" : null,
  );
  const [period, setPeriod] = useState(
    workspace.periodId || workspace.periods[0]?.id || "",
  );
  const balance = useResource<BookBalance>(
    path && period ? path + `/trial-balance?period_id=${period}` : null,
  );
  const command = useCommand();
  const [selected, setSelected] = useState<NativeJournal | null>(null);
  const [reversal, setReversal] = useState<NativeJournal | null>(null);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState("");
  function openReversal(item: NativeJournal) {
    setReversal(item);
    setReason("");
    setDate("");
    command.clearError();
  }
  function saveReversal() {
    if (!reversal || !date || !reason.trim() || !period) return;
    void command.run(
      path + `/journals/${reversal.id}/reversal-draft`,
      { body: { period_id: period, date, reason: reason.trim() } },
      () => setReversal(null),
      "پیش‌نویس برگشت ساخته شد؛ تأیید آن در اسناد انجام می‌شود.",
    );
  }
  function saveReport() {
    void command.run(
      path + "/trial-balance/runs",
      { body: { period_id: period } },
      reportRuns.refresh,
      "نسخه ثابت گزارش ذخیره شد.",
    );
  }
  return {
    workspace,
    journals,
    reportRuns,
    capabilities,
    period,
    setPeriod,
    balance,
    command,
    selected,
    setSelected,
    reversal,
    reason,
    setReason,
    date,
    setDate,
    openReversal,
    saveReversal,
    saveReport,
    closeReversal: () => {
      if (!command.busy) setReversal(null);
    },
  };
}
