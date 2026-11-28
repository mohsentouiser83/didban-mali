"use client";
import { randomId } from "@/lib/random-id";
import { useRef, useState } from "react";
import { useWorkspace } from "./workspace";
import { usePagedResource } from "./use-paged-resource";
import { useResource } from "./use-resource";
import { useCommand } from "./use-command";
import { amount, asciiDigits, displayDate, persian } from "@/lib/utils";
import { api, type ResourceList } from "@/lib/api";
import { previewChequeImport, type ChequeImportPreview } from "@/lib/cheque-import";
import type { ParsedTableImport } from "@/components/ui/table";
import { toast } from "sonner";
export interface Cheque {
  id: string;
  version: number;
  direction: "received" | "issued" | "guarantee_in" | "guarantee_out";
  number: string;
  sayad_id?: string | null;
  sayad_status?: "not_verified" | "registered" | "confirmed" | "rejected" | "unknown";
  bank_name: string;
  bank_account: string;
  treasury_account_id?: string | null;
  party_id: string;
  counterparty_id?: string | null;
  issuer_name?: string | null;
  holder_name?: string | null;
  amount: string;
  issue_date: string;
  received_date?: string | null;
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
  bank_id?: string | null;
  bank_reference?: string | null;
  treasury_account_id?: string | null;
  endorsed_to?: string | null;
}
interface CounterpartyItem {
  id: string;
  code: string;
  name: string;
}
interface TreasuryBankAccount {
  id: string;
  kind: "bank" | "cash" | "petty_cash";
  name: string;
  bank_name?: string | null;
  account_number?: string | null;
  active: boolean;
}
interface Bank {
  party_id?: string;
  id: string;
  reference: string;
  account: string;
  amount: string;
  date: string;
}
export const chequeDirectionLabels: Record<string, string> = {
  received: "دریافتنی",
  issued: "پرداختنی",
  guarantee_in: "تضمین دیگران نزد ما",
  guarantee_out: "تضمین ما نزد دیگران",
};
export const chequeStateLabels: Record<string, string> = {
  received: "دریافت‌شده",
  issued: "صادرشده",
  guarantee_in: "تضمین نزد ما",
  guarantee_out: "تضمین نزد دیگران",
  deposited: "تحویل بانک",
  endorsed: "واگذارشده",
  cleared: "وصول یا پرداخت بانکی",
  returned: "برگشتی",
  cancelled: "لغوشده",
};
export const chequeSayadStatusLabels: Record<string, string> = {
  not_verified: "احراز نشده",
  registered: "ثبت‌شده در صیاد",
  confirmed: "تأییدشده",
  rejected: "ردشده",
  unknown: "نامشخص",
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
  direction: "received" as "received" | "issued" | "guarantee_in" | "guarantee_out",
  number: "",
  sayad_id: "",
  sayad_status: "not_verified" as "not_verified" | "registered" | "confirmed" | "rejected" | "unknown",
  bank_name: "",
  bank_account: "",
  treasury_account_id: "",
  party_id: "",
  issuer_name: "",
  holder_name: "",
  amount: "",
  unit: "IRR" as "IRR" | "TOMAN",
  issue_date: "",
  received_date: "",
  due_date: "",
  period_id: "",
});
const allowed: Record<string, string[]> = {
  received: ["deposit", "endorse", "clear", "return", "cancel"],
  issued: ["clear", "return", "cancel"],
  guarantee_in: ["deposit", "clear", "return", "cancel"],
  guarantee_out: ["clear", "return", "cancel"],
  deposited: ["clear", "return"],
  endorsed: ["return"],
  cleared: ["return"],
  returned: ["deposit", "endorse", "clear", "cancel"],
  cancelled: [],
};
export function useCheques() {
  const workspace = useWorkspace();
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const path = directionFilter === "all" ? "cheques" : `cheques?direction=${directionFilter}`;
  const base = workspace.companyPath("cheques");
  const resource = usePagedResource<Cheque>(workspace.companyPath(path));
  const counterparties = useResource<ResourceList<CounterpartyItem>>(
    workspace.companyPath("commercial/counterparties?limit=100"),
  );
  const treasuryAccounts = useResource<ResourceList<TreasuryBankAccount>>(
    workspace.companyPath("treasury/accounts?active_only=true"),
  );
  const command = useCommand();
  const importing = useRef(false);
  const importKeys = useRef(new Map<string, string>());
  const [importBusy, setImportBusy] = useState(false);
  const [importPreview, setImportPreview] = useState<ChequeImportPreview | null>(null);
  const [creating, setCreating] = useState(false);
  const [formState, setForm] = useState(blank);
  const form = { ...formState, period_id: workspace.periodId };
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Cheque | null>(null);
  const [action, setAction] = useState("return");
  const [eventDate, setEventDate] = useState("");
  const eventPeriod = workspace.periodId;
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
      period_id: workspace.periodId,
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
    if (!workspace.canWrite || !workspace.periodId) return;
    const problem: Record<string, string> = {};
    if (!form.period_id) problem["cheque-period"] = "دوره را انتخاب کنید.";
    const sayad_id = asciiDigits(form.sayad_id).trim();
    if (sayad_id && !/^\d{16}$/.test(sayad_id)) {
      problem["cheque-sayad"] = "شناسهٔ صیادی باید ۱۶ رقم باشد.";
    }
    if (!form.issue_date) problem["cheque-issue"] = "تاریخ صدور لازم است.";
    if (form.received_date && form.issue_date && form.received_date < form.issue_date) {
      problem["cheque-received"] = "تاریخ دریافت نباید پیش از تاریخ صدور باشد.";
    }
    if (!form.due_date) problem["cheque-due"] = "سررسید لازم است.";
    if (!validate(problem)) return;
    void command.run(
      base,
      {
        body: {
          period_id: form.period_id,
          direction: form.direction,
          number: form.number.trim(),
          sayad_id: sayad_id || null,
          sayad_status: form.sayad_status,
          bank_name: form.bank_name.trim(),
          bank_account: form.bank_account.trim(),
          treasury_account_id: form.treasury_account_id || null,
          party_id: form.party_id,
          issuer_name: form.issuer_name.trim() || null,
          holder_name: form.holder_name.trim() || null,
          amount: form.amount,
          unit: form.unit,
          issue_date: form.issue_date,
          received_date: form.received_date || null,
          due_date: form.due_date,
        },
      },
      () => {
        setCreating(false);
        resource.refresh();
      },
      "چک ثبت شد؛ سند مالی ایجاد نشد.",
    );
  }
  function apply() {
    if (!selected || !workspace.canWrite || !workspace.periodId) return;
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
    directionFilter,
    setDirectionFilter,
    counterpartyOptions: (counterparties.data?.items || []).map((cp) => ({
      value: cp.id,
      label: `${cp.name} (${cp.code})`,
    })),
    counterpartyNames: Object.fromEntries(
      (counterparties.data?.items || []).flatMap((cp) => [
        [cp.id, cp.name],
        [cp.code, cp.name],
      ]),
    ),
    treasuryBankOptions: (treasuryAccounts.data?.items || [])
      .filter((ta) => ta.kind === "bank")
      .map((ta) => ({
        value: ta.id,
        label: ta.account_number ? `${ta.name} (${ta.account_number})` : ta.name,
        bankName: ta.bank_name || ta.name,
        accountNumber: ta.account_number || "",
      })),
    importBusy,
    importPreview,
    closeImportPreview: () => { if (!importing.current) setImportPreview(null); },
    previewImport: (parsed: ParsedTableImport) => {
      if (!base || !workspace.canWrite || !parsed.rows.length || importing.current) return;
      const period = workspace.periods.find((item) => item.id === workspace.periodId);
      if (!period) {
        toast.error("دورهٔ مالی ورود چک را انتخاب کنید.");
        return;
      }
      setImportPreview(previewChequeImport(parsed, period));
    },
    confirmImport: async () => {
      if (!base || !workspace.canWrite || !importPreview || importPreview.headerError ||
          !importPreview.rows.length || importPreview.rows.some((row) => !row.valid) || importing.current) return;
      const rows = importPreview.rows.flatMap((row) => row.payload ? [row.payload] : []);
      if (rows.length !== importPreview.rows.length || rows.some((row) => row.period_id !== workspace.periodId)) {
        toast.error("دورهٔ مالی تغییر کرده است. فایل را دوباره بررسی کنید.");
        return;
      }
      importing.current = true;
      setImportBusy(true);
      let saved = 0;
      try {
        for (const body of rows) {
          const fingerprint = base + JSON.stringify(body);
          const key = importKeys.current.get(fingerprint) ?? randomId();
          importKeys.current.set(fingerprint, key);
          await api(base, { method: "POST", body, key });
          saved++;
        }
        toast.success(`${persian(saved)} فقره چک ثبت شد.`);
        setImportPreview(null);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "خطای ثبت چک";
        toast.error(`${persian(saved)} فقره ثبت شد. ورود در ردیف دادهٔ ${persian(saved + 1)} متوقف شد. ${detail}`);
        setImportPreview(null);
      } finally {
        importing.current = false;
        setImportBusy(false);
        resource.refresh();
      }
    },
  };
}
export type ChequeController = ReturnType<typeof useCheques>;
