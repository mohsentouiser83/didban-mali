"use client";
import { useEffect, useState } from "react";
import {
  api,
  ApiError,
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
  type LedgerAccount,
} from "@/lib/accounting";
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
export function useAccountOptions(companyId: string) {
  const [snapshot, setSnapshot] = useState<{
    companyId: string;
    items: LedgerAccount[];
    error?: ApiError;
  }>({ companyId: "", items: [] });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!companyId) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const items: LedgerAccount[] = [];
        const cursors = new Set<string>();
        let cursor: string | null | undefined;
        do {
          const page = await api<ResourceList<LedgerAccount>>(
            `/companies/${companyId}/accounting/accounts?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
            { signal: controller.signal },
          );
          items.push(...page.items);
          cursor = page.next_cursor;
          if (cursor) {
            if (cursors.has(cursor))
              throw new ApiError(
                0,
                "فهرست حساب‌ها کامل دریافت نشد.",
                "invalid_pagination",
              );
            cursors.add(cursor);
          }
        } while (cursor && !controller.signal.aborted);
        if (!controller.signal.aborted) setSnapshot({ companyId, items });
      } catch (error) {
        if (!controller.signal.aborted)
          setSnapshot({
            companyId,
            items: [],
            error:
              error instanceof ApiError
                ? error
                : new ApiError(0, "حساب‌ها دریافت نشد.", "unknown"),
          });
      }
    })();
    return () => controller.abort();
  }, [companyId, revision]);
  return {
    items: snapshot.companyId === companyId ? snapshot.items : [],
    error: snapshot.companyId === companyId ? snapshot.error : undefined,
    loading: !!companyId && snapshot.companyId !== companyId,
    refresh: () => setRevision((value) => value + 1),
  };
}
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
  const [value, setValue] = useState<DraftFormValue>(() => draftFormValue());
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
        workspace.periodId || workspace.periods[0]?.id || "",
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
  const hasActiveAccounts = accounts.items.some((account) => account.active);
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
    accountOptions: accounts.items.map((account) => ({
      value: account.id,
      label: `${account.code} — ${account.name}${account.active ? "" : " (غیرفعال)"}`,
      disabled: !account.active,
    })),
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
export function useLedgerAccounts() {
  const workspace = useWorkspace();
  const resource = usePagedResource<LedgerAccount>(
    workspace.companyPath("accounting/accounts"),
  );
  const capabilities = useResource<AccountingCapabilities>(
    workspace.companyPath("accounting/capabilities"),
  );
  const command = useCommand();
  const [editing, setEditing] = useState<LedgerAccount | null | undefined>();
  const [value, setValue] = useState({ code: "", name: "", active: true });
  function open(account: LedgerAccount | null) {
    setEditing(account);
    setValue(
      account
        ? { code: account.code, name: account.name, active: account.active }
        : { code: "", name: "", active: true },
    );
    command.clearError();
  }
  function save() {
    if (!value.code.trim() || !value.name.trim()) return;
    void command.run(
      workspace.companyPath(
        `accounting/accounts${editing ? `/${editing.id}` : ""}`,
      ),
      {
        method: editing ? "PATCH" : "POST",
        version: editing?.version,
        body: { ...value, code: value.code.trim(), name: value.name.trim() },
      },
      () => {
        setEditing(undefined);
        resource.refresh();
      },
      "حساب ذخیره شد.",
    );
  }
  return {
    workspace,
    resource,
    capabilities,
    command,
    editing,
    value,
    rows: listItems(resource.data),
    open,
    save,
    close: () => setEditing(undefined),
    change: (patch: Partial<typeof value>) =>
      setValue((previous) => ({ ...previous, ...patch })),
  };
}

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
        Pick<AccountingPermission, "post_journal" | "reopen_period">
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
            ...patch,
          },
        },
        resource.refresh,
        "مجوز حسابداری ذخیره شد.",
      );
    },
  };
}
