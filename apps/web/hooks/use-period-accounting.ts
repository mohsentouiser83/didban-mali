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
  const [kind, setKind] = useState("closing");
  const [period, setPeriod] = useState(
    workspace.periodId || workspace.periods[0]?.id || "",
  );
  const [target, setTarget] = useState("");
  const [resultAccount, setResultAccount] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [query, setQuery] = useState("");
  const [created, setCreated] = useState(false);
  function save() {
    if (!reason.trim()) return;
    void command.run(
      workspace.companyPath(`accounting/period-${kind}-drafts`),
      {
        body:
          kind === "closing"
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
    setPeriod: (value: string) => {
      setPeriod(value);
      setCreated(false);
    },
    setTarget: (value: string) => {
      setTarget(value);
      setCreated(false);
    },
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
    visibleAccounts: accounts.items.filter(
      (item) =>
        item.active &&
        !!roleOf(item.id) &&
        (kind === "closing"
          ? ["revenue", "expense"].includes(roleOf(item.id)!)
          : !["revenue", "expense"].includes(roleOf(item.id)!)) &&
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
