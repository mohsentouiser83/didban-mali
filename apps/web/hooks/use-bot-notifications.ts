"use client";
import { useState } from "react";
import { useResource } from "./use-resource";
import { usePagedResource } from "./use-paged-resource";
import { useCommand } from "./use-command";
import { useWorkspace } from "./workspace";
export type NoticeEvent =
  | "report_ready"
  | "question_open"
  | "daily_summary"
  | "cheque_due"
  | "draft_approval";
export interface NoticeSettings {
  enabled: boolean;
  events: NoticeEvent[];
  quiet_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
  summary_time: string;
}
export interface NoticePreference extends NoticeSettings {
  provider: "telegram" | "bale";
  version: number;
  connected: boolean;
  binding_current: boolean;
  configured: boolean;
  timezone: string;
}
interface Delivery {
  id: string;
  provider: string;
  event_type: NoticeEvent;
  state: string;
  created_at: string;
  due_at: string;
}
export const noticeLabels: Record<NoticeEvent, string> = {
  report_ready: "گزارش تازه",
  question_open: "پرسش منتظر پاسخ",
  daily_summary: "خلاصه روزانه",
  cheque_due: "چک سررسیدشده",
  draft_approval: "پیش‌نویس منتظر تأیید",
};
const settings = (p: NoticePreference): NoticeSettings => ({
  enabled: p.enabled,
  events: p.events,
  quiet_enabled: p.quiet_enabled,
  quiet_start: p.quiet_start,
  quiet_end: p.quiet_end,
  summary_time: p.summary_time,
});
export function useBotNotificationPreferences() {
  const workspace = useWorkspace();
  const base = workspace.companyPath("bot-notifications");
  const resource = useResource<{ items: NoticePreference[] }>(base);
  const history = usePagedResource<Delivery>(
    base ? base + "/deliveries" : null,
  );
  const command = useCommand();
  const [edits, setEdits] = useState<
    Record<string, { version: number; values: NoticeSettings }>
  >({});
  const cards = (resource.data?.items || []).map((pref) => {
    const local = edits[pref.provider];
    const value =
      local?.version === pref.version ? local.values : settings(pref);
    return {
      ...pref,
      value,
      invalidEvents: value.enabled && !value.events.length,
      providerLabel: pref.provider === "telegram" ? "تلگرام" : "بله",
    };
  });
  const change = (pref: NoticePreference, patch: Partial<NoticeSettings>) => {
    const local = edits[pref.provider];
    setEdits({
      ...edits,
      [pref.provider]: {
        version: pref.version,
        values: {
          ...(local?.version === pref.version ? local.values : settings(pref)),
          ...patch,
        },
      },
    });
    command.clearError();
  };
  function toggle(
    pref: NoticePreference,
    event: NoticeEvent,
    checked: boolean,
  ) {
    const current =
      edits[pref.provider]?.version === pref.version
        ? edits[pref.provider].values
        : settings(pref);
    change(pref, {
      events: checked
        ? [...current.events, event]
        : current.events.filter((v) => v !== event),
    });
  }
  function save(pref: NoticePreference) {
    const card = cards.find((row) => row.provider === pref.provider);
    if (!card || card.invalidEvents) return;
    void command.run(
      base + `/${pref.provider}`,
      { method: "PATCH", version: pref.version, body: card.value },
      () => {
        resource.refresh();
        history.refresh();
      },
      "تنظیم اعلان ذخیره شد.",
    );
  }
  return {
    cards,
    resource,
    history,
    historyRows: (history.data?.items || []).map((item) => ({
      ...item,
      scheduledTime: new Intl.DateTimeFormat("fa-IR", {
        timeZone: "Asia/Tehran",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(item.due_at)),
    })),
    command,
    change,
    toggle,
    save,
  };
}
