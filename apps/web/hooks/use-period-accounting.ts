"use client";
import { useState } from "react";
import { listItems, type ResourceList } from "@/lib/api";
import type { JournalDraft } from "@/lib/accounting";
import { useWorkspace } from "./workspace";
import { useAccountOptions } from "./use-accounting";
import { useAccountRoles } from "./use-account-roles";
import { useCommand } from "./use-command";
import { useResource } from "./use-resource";

interface TrialBalanceRow {
  account_id: string;
  balance: string;
}

export function usePeriodAccounting() {
  const workspace = useWorkspace();
  const accounts = useAccountOptions(workspace.company?.id || "");
  const roles = useAccountRoles();
  const roleOf = (id: string) =>
    roles.resource.data?.items.find((item) => item.account_id === id)?.role;
  const command = useCommand();
  const [kind, setKind] = useState("temporary_closing");
  const target = workspace.periodId;
  const current = workspace.periods.find((item) => item.id === target);
  const adjacent = current ? workspace.periods.filter((item) =>
    new Date(`${item.end}T00:00:00Z`).getTime() + 86_400_000 ===
    new Date(`${current.start}T00:00:00Z`).getTime(),
  ) : [];
  const source = current?.previous_period_id || (adjacent.length === 1 ? adjacent[0].id : "");
  const sourcePeriod = workspace.periods.find((item) => item.id === source);
  const isClosing = kind === "temporary_closing" || kind === "permanent_closing" || kind === "closing";
  const period = isClosing ? target : source;
  const [resultAccount, setResultAccount] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [query, setQuery] = useState("");
  const [created, setCreated] = useState(false);

  const trialBalance = useResource<{ items: TrialBalanceRow[] }>(
    period ? workspace.companyPath(`accounting/trial-balance?period_id=${period}`) : null,
  );
  const drafts = useResource<ResourceList<JournalDraft>>(
    workspace.companyPath("accounting/drafts?limit=15"),
  );

  const closingPayloadKind = kind === "permanent_closing" ? "permanent_closing" : "closing";

  function save() {
    if (!reason.trim() || !period || (kind === "opening" && !target)) return;
    const apiKind = isClosing ? "closing" : "opening";
    void command.run(
      workspace.companyPath(`accounting/period-${apiKind}-drafts`),
      {
        body:
          isClosing
            ? {
                period_id: period,
                kind: closingPayloadKind,
                account_ids: selected,
                result_account_id: resultAccount,
                reason: reason.trim(),
              }
            : {
                source_period_id: period,
                target_period_id: target,
                account_ids: selected,
                reason: reason.trim(),
              },
      },
      () => {
        setCreated(true);
        drafts.refresh();
      },
      "پیش‌نویس دوره ساخته شد؛ ثبت نهایی نیازمند تأیید است.",
    );
  }

  const prerequisites: string[] = [];
  if (!target) {
    prerequisites.push("دورهٔ مالی مقصد از هدر انتخاب نشده است.");
  }
  if (kind === "opening") {
    if (!source) prerequisites.push("دورهٔ مبدأ (دورهٔ قبلی) به دورهٔ منتخب متصل نیست.");
    else if (sourcePeriod && !sourcePeriod.closed) {
      prerequisites.push(`دورهٔ مبدأ («${sourcePeriod.name}») هنوز قفل نشده است.`);
    }
  }
  if (isClosing && !resultAccount) {
    prerequisites.push(
      kind === "permanent_closing"
        ? "حساب تراز اختتامیه (با نقش حقوق مالکانه) انتخاب نشده است."
        : "حساب سود و زیان جاری (با نقش حقوق مالکانه) انتخاب نشده است.",
    );
  }
  if (!selected.length) {
    prerequisites.push("حداقل یک حساب برای بستن یا انتقال مانده انتخاب کنید.");
  }
  const missingRoleCount = selected.filter((id) => !roleOf(id)).length;
  if (missingRoleCount > 0) {
    prerequisites.push("برای برخی حساب‌های انتخابی نقش حساب در صورت‌های مالی تعیین نشده است.");
  }

  const balanceByAccount = new Map<string, number>();
  for (const row of trialBalance.data?.items || []) {
    balanceByAccount.set(row.account_id, (balanceByAccount.get(row.account_id) ?? 0) + Number(row.balance || 0));
  }
  const nonZeroSelectedCount = selected.filter((id) => (balanceByAccount.get(id) ?? 0) !== 0).length;
  const estimatedNetBalance = selected.reduce((sum, id) => sum + (balanceByAccount.get(id) ?? 0), 0);

  const latestPeriodDoc = listItems(drafts.data).find(
    (d) =>
      (!target || d.period_id === target) &&
      (d.description.includes("بستن") ||
        d.description.includes("اختتامیه") ||
        d.description.includes("انتقال مانده") ||
        d.description.includes("افتتاح") ||
        (d.operation_kind && ["period_closing", "period_opening", "closing", "opening"].includes(d.operation_kind))),
  ) ?? null;

  return {
    workspace,
    accounts,
    roles,
    command,
    kind,
    isClosing,
    period,
    target,
    currentPeriod: current,
    sourcePeriod,
    resultAccount,
    selected,
    reason,
    query,
    created,
    prerequisites,
    nonZeroSelectedCount,
    estimatedNetBalance,
    latestPeriodDoc,
    save,
    setResultAccount: (value: string) => {
      setResultAccount(value);
      setCreated(false);
    },
    setReason: (value: string) => {
      setReason(value);
      setCreated(false);
    },
    setQuery,
    setKind: (value: string) => {
      setKind(value);
      setSelected([]);
      setCreated(false);
      command.clearError();
    },
    toggle: (id: string, checked: boolean) => {
      setCreated(false);
      setSelected((old) =>
        checked
          ? [...new Set([...old, id])]
          : old.filter((item) => item !== id),
      );
    },
    selectAll: () => {
      const allIds = accounts.items
        .filter(
          (item) =>
            item.active &&
            (kind === "temporary_closing" || kind === "closing"
              ? ["revenue", "expense"].includes(roleOf(item.id) || "")
              : !["revenue", "expense"].includes(roleOf(item.id) || "")),
        )
        .map((item) => item.id);
      setSelected(allIds);
      setCreated(false);
    },
    deselectAll: () => {
      setSelected([]);
      setCreated(false);
    },
    visibleAccounts: accounts.items.filter(
      (item) =>
        item.active &&
        (kind === "temporary_closing" || kind === "closing"
          ? ["revenue", "expense"].includes(roleOf(item.id) || "")
          : !["revenue", "expense"].includes(roleOf(item.id) || "")) &&
        `${item.code} ${item.name}`.includes(query),
    ),
    periodOptions: workspace.periods.map((item) => ({
      value: item.id,
      label: item.name,
    })),
    accountOptions: accounts.items
      .filter((item) => item.active && roleOf(item.id) === "equity")
      .map((item) => ({
        value: item.id,
        label: `${item.code} · ${item.name}`,
      })),
  };
}
