"use client";
import { useEffect, useState } from "react";
import {
  listItems,
  type Member,
  type ResourceList,
} from "@/lib/api";
import {
  draftFormValue,
  draftPayload,
  draftValidation,
  emptyDraftLine,
  type AccountingCapabilities,
  type AccountingPermission,
  type DraftFormValue,
  type JournalDraft,
  type JournalDraftLine,
} from "@/lib/accounting";
import { isAccountPostable } from "@/lib/account-catalogue";
import { useAccountOptions } from "./use-account-options";
import { useCommand } from "./use-command";
import { usePagedResource } from "./use-paged-resource";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";

function focusError(errors: Record<string, string>) {
  requestAnimationFrame(() =>
    document
      .getElementById(errors.balance ? "line-0-debit" : Object.keys(errors)[0])
      ?.focus(),
  );
}
export { useAccountOptions };

export function useJournalDrafts() {
  const workspace = useWorkspace();
  const drafts = usePagedResource<JournalDraft>(
    workspace.companyPath("accounting/drafts"),
  );
  const capabilities = useResource<AccountingCapabilities>(
    workspace.companyPath("accounting/capabilities"),
  );
  const accounts = useAccountOptions(workspace.company?.id || "");
  const command = useCommand();
  const [editing, setEditing] = useState<JournalDraft | null | undefined>();
  const [discarding, setDiscarding] = useState<JournalDraft | null>(null);
  const [discardReason, setDiscardReason] = useState("");
  const [valueState, setValue] = useState<DraftFormValue>(() => draftFormValue());
  const value = { ...valueState, period_id: workspace.periodId };
  const [errors, setErrors] = useState<Record<string, string>>({});
  const totals = draftValidation(value);
  const [replacement, setReplacement] = useState<{
    id: string;
    reason: string;
  } | null>(null);
  function open(draft: JournalDraft | null) {
    setReplacement(null);
    setEditing(draft);
    setValue(
      draftFormValue(
        draft || undefined,
        workspace.periodId,
      ),
    );
    setErrors({});
    command.clearError();
  }
  function change<K extends keyof DraftFormValue>(
    key: K,
    next: DraftFormValue[K],
  ) {
    setValue((previous) => ({ ...previous, [key]: next }));
    setErrors({});
    command.clearError();
  }
  function line(index: number, patch: Partial<JournalDraftLine>) {
    change(
      "lines",
      value.lines.map((item, position) =>
        position === index ? { ...item, ...patch } : item,
      ),
    );
  }
  function save() {
    const validation = draftValidation(value);
    setErrors(validation.errors);
    if (replacement && !replacement.reason.trim()) {
      setErrors({ "replacement-reason": "دلیل اصلاح لازم است." });
      return;
    }
    if (Object.keys(validation.errors).length) {
      focusError(validation.errors);
      return;
    }
    void command.run<JournalDraft>(
      workspace.companyPath(
        replacement
          ? `accounting/journals/${replacement.id}/replacement-draft`
          : `accounting/drafts${editing ? `/${editing.id}` : ""}`,
      ),
      {
        method: editing ? "PATCH" : "POST",
        body: replacement
          ? { ...draftPayload(value), reason: replacement.reason.trim() }
          : draftPayload(value),
        version: editing?.version,
      },
      () => {
        setEditing(undefined);
        drafts.refresh();
      },
      "پیش‌نویس ذخیره شد.",
    );
  }
  const loading = drafts.loading || capabilities.loading || accounts.loading;
  const error = drafts.error || capabilities.error || accounts.error;
  const hasActiveAccounts = accounts.items.some((account) => isAccountPostable(account));
  const requiresAccounts = !hasActiveAccounts;
  const requiresPeriod = workspace.periods.length === 0;
  const canPrepare = !!capabilities.data?.can_prepare;
  const canCreateDraft =
    canPrepare && !loading && !error && !requiresAccounts && !requiresPeriod;
  const rows = listItems(drafts.data).map((draft) => ({
    ...draft,
    totals: draftValidation({ ...draft, unit: "IRR" }),
  }));
  return {
    discarding,
    discardReason,
    setDiscardReason,
    openDiscard: (draft: JournalDraft) => {
      setDiscarding(draft);
      setDiscardReason("");
      command.clearError();
    },
    closeDiscard: () => {
      if (!command.busy) setDiscarding(null);
    },
    discard: () => {
      if (!discarding || !discardReason.trim()) return;
      void command.run(
        workspace.companyPath(`accounting/drafts/${discarding.id}/discard`),
        { version: discarding.version, body: { reason: discardReason.trim() } },
        () => {
          setDiscarding(null);
          drafts.refresh();
        },
        "پیش‌نویس کنار گذاشته شد.",
      );
    },
    replacement,
    setReplacementReason: (reason: string) =>
      setReplacement((old) => (old ? { ...old, reason } : null)),
    prepareReplacement: (journal: {
      id: string;
      snapshot: {
        period_id: string;
        date: string;
        description: string;
        lines: JournalDraftLine[];
      };
    }) => {
      open(null);
      setReplacement({ id: journal.id, reason: "" });
      setValue({
        period_id: journal.snapshot.period_id,
        date: journal.snapshot.date,
        description: journal.snapshot.description,
        unit: "IRR",
        lines: journal.snapshot.lines.map((line) => ({
          ...line,
          original_debit: undefined,
          original_credit: undefined,
        })),
      });
    },
    workspace,
    drafts,
    capabilities,
    accounts,
    command,
    editing,
    value,
    errors,
    totals,
    rows,
    loading,
    error,
    hasActiveAccounts,
    requiresAccounts,
    requiresPeriod,
    canPrepare,
    canCreateDraft,
    refresh: () => {
      drafts.refresh();
      capabilities.refresh();
      accounts.refresh();
    },
    accountOptions: accounts.items.map((account) => {
      const postable = isAccountPostable(account);
      const suffix = !account.active
        ? " (غیرفعال)"
        : account.level === "group"
          ? " (گروه — غیرقابل ثبت)"
          : account.has_children
            ? " (دارای زیرمجموعه — غیرقابل ثبت)"
            : "";
      return {
        value: account.id,
        label: `${account.code} — ${account.name}${suffix}`,
        disabled: !postable,
      };
    }),
    open,
    close: () => setEditing(undefined),
    change,
    line,
    save,
    addLine: () => change("lines", [...value.lines, emptyDraftLine()]),
    removeLine: (index: number) =>
      change(
        "lines",
        value.lines.filter((_, position) => position !== index),
      ),
  };
}
export { useLedgerAccounts } from "./use-ledger-accounts";

export function useAccountingPermissions(
  membershipSnapshot?: ResourceList<Member>,
) {
  const workspace = useWorkspace();
  const owner = workspace.company?.role === "owner";
  const resource = useResource<ResourceList<AccountingPermission>>(
    owner ? workspace.companyPath("accounting/permissions") : null,
  );
  const command = useCommand();
  const refreshPermissions = resource.refresh;
  useEffect(() => {
    if (membershipSnapshot) refreshPermissions();
  }, [membershipSnapshot, refreshPermissions]);
  return {
    owner,
    resource,
    command,
    rows: listItems(resource.data),
    change: (
      permission: AccountingPermission,
      patch: Partial<
        Pick<
          AccountingPermission,
          "post_journal" | "reopen_period" | "view_payroll"
        >
      >,
    ) => {
      void command.run(
        workspace.companyPath(
          `accounting/permissions/${permission.membership_id}`,
        ),
        {
          method: "PATCH",
          version: permission.version,
          body: {
            post_journal: permission.post_journal,
            reopen_period: permission.reopen_period,
            view_payroll: permission.view_payroll,
            ...patch,
          },
        },
        resource.refresh,
        "مجوز حسابداری ذخیره شد.",
      );
    },
  };
}
