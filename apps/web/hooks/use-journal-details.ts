"use client";
import { useState } from "react";
import { listItems, type ResourceList } from "@/lib/api";
import type { JournalDraft } from "@/lib/accounting";
import type { NativeJournal } from "./use-native-journals";
import { useResource } from "./use-resource";
import { useCommand } from "./use-command";
import { useWorkspace } from "./workspace";

export function useJournalDetails(onCreated: () => void) {
  const workspace = useWorkspace();
  const [selected, setSelected] = useState<JournalDraft | null>(null);
  const resource = useResource<ResourceList<NativeJournal>>(
    selected
      ? workspace.companyPath(
          `accounting/journals?draft_id=${encodeURIComponent(selected.id)}`,
        )
      : null,
  );
  const journal = listItems(resource.data).find(
    (item) => item.draft_id === selected?.id,
  );
  const command = useCommand();
  const [correcting, setCorrecting] = useState(false);
  const [period, setPeriod] = useState("");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  return {
    selected,
    journal,
    resource,
    command,
    correcting,
    period,
    date,
    reason,
    setPeriod,
    setDate,
    setReason,
    open: (item: JournalDraft) => {
      setSelected(item);
      setCorrecting(false);
      setPeriod(item.period_id);
      setDate("");
      setReason("");
      command.clearError();
    },
    close: () => {
      if (!command.busy) setSelected(null);
    },
    openReversal: () => setCorrecting(true),
    saveReversal: () => {
      if (!journal || !period || !date || !reason.trim()) return;
      void command.run(
        workspace.companyPath(
          `accounting/journals/${journal.id}/reversal-draft`,
        ),
        {
          body: { period_id: period, date, reason: reason.trim() },
        },
        () => {
          setSelected(null);
          onCreated();
        },
        "پیش‌نویس برگشت به فهرست اسناد اضافه شد.",
      );
    },
    periods: workspace.periods.map((item) => ({
      value: item.id,
      label: item.name,
    })),
  };
}
