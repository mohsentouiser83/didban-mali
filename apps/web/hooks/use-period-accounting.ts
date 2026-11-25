"use client";
import { useState } from "react";
import { useWorkspace } from "./workspace";
import { useAccountOptions } from "./use-accounting";
import { useAccountRoles } from "./use-account-roles";
import { useCommand } from "./use-command";
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
  const isClosing = kind === "temporary_closing" || kind === "permanent_closing" || kind === "closing";
  const period = isClosing ? target : source;
  const [resultAccount, setResultAccount] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [query, setQuery] = useState("");
  const [created, setCreated] = useState(false);
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
      () => setCreated(true),
      "پیش‌نویس دوره ساخته شد؛ ثبت نهایی نیازمند تأیید است.",
    );
  }
  return {
    workspace,
    accounts,
    roles,
    command,
    kind,
    period,
    target,
    resultAccount,
    selected,
    reason,
    query,
    created,
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
