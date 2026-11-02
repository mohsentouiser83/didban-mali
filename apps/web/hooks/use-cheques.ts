"use client";
import { useState } from "react";
import { useWorkspace } from "./workspace";
import { usePagedResource } from "./use-paged-resource";
import { useResource } from "./use-resource";
import { useCommand } from "./use-command";
import { amount, displayDate } from "@/lib/utils";
import type { ResourceList } from "@/lib/api";
export interface Cheque {
  id: string;
  version: number;
  direction: "received" | "issued";
  number: string;
  bank_name: string;
  bank_account: string;
  party_id: string;
  amount: string;
  issue_date: string;
  due_date: string;
  state: string;
}
interface Event {
  id: string;
  action: string;
  event_date: string;
  reason: string;
  previous_state: string | null;
  new_state: string;
}
interface Bank {
  party_id?: string;
  id: string;
  reference: string;
  account: string;
  amount: string;
  date: string;
}
export const chequeStateLabels: Record<string, string> = {
  received: "دریافت‌شده",
  issued: "صادرشده",
  deposited: "تحویل بانک",
  endorsed: "واگذارشده",
  cleared: "وصول یا پرداخت بانکی",
  returned: "برگشتی",
  cancelled: "لغوشده",
};
export const chequeActionLabels: Record<string, string> = {
  deposit: "تحویل به بانک",
  endorse: "واگذاری",
  clear: "ثبت شاهد وصول یا پرداخت",
  return: "ثبت برگشت",
  cancel: "لغو چک",
  registered: "ثبت چک",
};
const blank = () => ({
  direction: "received" as "received" | "issued",
  number: "",
  bank_name: "",
  bank_account: "",
  party_id: "",
  amount: "",
  unit: "IRR" as "IRR" | "TOMAN",
  issue_date: "",
  due_date: "",
  period_id: "",
});
const allowed: Record<string, string[]> = {
  received: ["deposit", "endorse", "clear", "return", "cancel"],
  issued: ["clear", "return", "cancel"],
  deposited: ["clear", "return"],
  endorsed: ["return"],
  cleared: ["return"],
  returned: ["deposit", "endorse", "clear", "cancel"],
  cancelled: [],
};
export function useCheques() {
  const workspace = useWorkspace();
  const base = workspace.companyPath("cheques");
  const resource = usePagedResource<Cheque>(base);
  const command = useCommand();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Cheque | null>(null);
  const [action, setAction] = useState("return");
  const [eventDate, setEventDate] = useState("");
  const [eventPeriod, setEventPeriod] = useState("");
  const [reason, setReason] = useState("");
  const [endorsedTo, setEndorsedTo] = useState("");
  const [bankId, setBankId] = useState("");
  const [bankLabel, setBankLabel] = useState("");
  const [bankPartyKnown, setBankPartyKnown] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const history = usePagedResource<Event>(
    selected && base ? base + `/${selected.id}/events` : null,
  );
  const banks = useResource<ResourceList<Bank>>(
    selected && action === "clear" && base
      ? base + `/bank-options?q=${encodeURIComponent(query)}`
      : null,
  );
  const actionOptions = (selected ? allowed[selected.state] || [] : [])
    .filter(
      (value) =>
        selected?.direction !== "issued" ||
        !["deposit", "endorse"].includes(value),
    )
    .map((value) => ({ value, label: chequeActionLabels[value] }));
  function showCreate() {
    setCreating(true);
    setForm({
      ...blank(),
      period_id: workspace.periodId || workspace.periods[0]?.id || "",
    });
    setErrors({});
    command.clearError();
  }
  function inspect(item: Cheque) {
    setSelected(item);
    setAction(
      (allowed[item.state] || []).filter(
        (value) =>
          item.direction !== "issued" ||
          !["deposit", "endorse"].includes(value),
      )[0] || "",
    );
    setEventDate("");
    setEventPeriod(workspace.periodId || workspace.periods[0]?.id || "");
    setReason("");
    setEndorsedTo("");
    setBankId("");
    setBankLabel("");
    setBankPartyKnown(null);
    setQuery("");
    setErrors({});
    command.clearError();
  }
  function validate(fields: Record<string, string>) {
    setErrors(fields);
    if (Object.keys(fields).length) {
      requestAnimationFrame(() =>
        document.getElementById(Object.keys(fields)[0])?.focus(),
      );
      return false;
    }
    return true;
  }
  function create() {
    const problem: Record<string, string> = {};
    if (!form.period_id) problem["cheque-period"] = "دوره را انتخاب کنید.";
    if (!form.issue_date)
      problem["cheque-issue"] = "تاریخ دریافت یا صدور لازم است.";
    if (!form.due_date) problem["cheque-due"] = "سررسید لازم است.";
    if (!validate(problem)) return;
    void command.run(
      base,
      { body: form },
      () => {
        setCreating(false);
        resource.refresh();
      },
      "چک ثبت شد؛ سند مالی ایجاد نشد.",
    );
  }
  function apply() {
    if (!selected) return;
    const problem: Record<string, string> = {};
    if (!eventPeriod) problem["cheque-event-period"] = "دوره را انتخاب کنید.";
    if (!eventDate) problem["cheque-event-date"] = "تاریخ رویداد لازم است.";
    if (action === "clear" && !bankId)
      problem["cheque-event-bank"] = "گردش بانک را انتخاب کنید.";
    if (!validate(problem)) return;
    void command.run(
      base + `/${selected.id}/actions`,
      {
        version: selected.version,
        body: {
          action,
          period_id: eventPeriod,
          event_date: eventDate,
          reason: reason.trim(),
          bank_id: action === "clear" ? bankId : null,
          endorsed_to: action === "endorse" ? endorsedTo.trim() : null,
        },
      },
      () => {
        setSelected(null);
        resource.refresh();
      },
      "رویداد چک ثبت شد.",
    );
  }
  return {
    workspace,
    resource,
    command,
    creating,
    form,
    errors,
    selected,
    action,
    eventDate,
    eventPeriod,
    reason,
    endorsedTo,
    bankId,
    bankLabel,
    bankPartyKnown,
    query,
    history,
    banks,
    actionOptions,
    showCreate,
    inspect,
    create,
    apply,
    setCreating,
    setSelected,
    setAction,
    setEventDate,
    setEventPeriod,
    setReason,
    setEndorsedTo,
    setQuery,
    change: (patch: Partial<ReturnType<typeof blank>>) =>
      setForm((old) => ({ ...old, ...patch })),
    periodOptions: workspace.periods.map((p) => ({
      value: p.id,
      label: p.name,
    })),
    bankOptions: (banks.data?.items || []).map((bank) => ({
      value: bank.id,
      label: `${bank.account} · ${bank.reference || "بدون مرجع"} · ${displayDate(bank.date)} · ${amount(bank.amount)} ریال`,
    })),
    selectBank: (id: string, label: string) => {
      setBankId(id);
      setBankLabel(label);
      setBankPartyKnown(
        !!banks.data?.items.find((bank) => bank.id === id)?.party_id,
      );
    },
  };
}
export type ChequeController = ReturnType<typeof useCheques>;
