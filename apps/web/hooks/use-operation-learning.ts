"use client";
import { useEffect, useRef, useState } from "react";
import { usePagedResource } from "./use-paged-resource";
import { useCommand } from "./use-command";

export interface OperationSuggestion {
  operation_id: string;
  kind: string;
  journal_id: string;
  journal_sequence: number;
  journal_digest: string;
  approved_draft_version: number;
  policy_version: string;
  accounts: Record<
    string,
    { id: string; code: string; name: string; version: number }
  >;
  name: string;
  enabled: boolean;
  version: number;
  learning_basis?: "posted_operation" | "human_corrected_accounts";
}
export interface OperationCorrectionCandidate {
  operation_id: string;
  title: string;
  journal_id: string;
  journal_digest: string;
  journal_sequence: number;
  approved_draft_version: number;
  roles: { key: string; label: string }[];
  account_choices: {
    id: string;
    code: string;
    name: string;
    side: "debit" | "credit";
  }[];
}
interface Scope {
  company?: { id: string; role: string } | null;
  user?: { id: string } | null;
  canWrite: boolean;
  companyPath: (path: string) => string | null;
}
interface OperationForm {
  kind: string;
  party_id: string;
  accounts: Record<string, string>;
}
interface Editor {
  scope: string;
  item: OperationSuggestion;
  name: string;
  enabled: boolean;
}
const excluded = new Set(["payroll", "payroll_payment", "cheque_endorsed"]);
export function useOperationLearning(
  workspace: Scope,
  form: OperationForm,
  roles: { key: string; label: string }[],
  onAccounts: (accounts: Record<string, string>) => void,
) {
  const available =
    workspace.canWrite &&
    !excluded.has(form.kind) &&
    (!!form.party_id.trim() || form.kind === "transfer");
  const base = workspace.companyPath("accounting/operation-learning");
  const query = `kind=${encodeURIComponent(form.kind)}&party_id=${encodeURIComponent(form.party_id.trim())}`;
  const resource = usePagedResource<OperationSuggestion>(
    available && base ? `${base}?${query}` : null,
  );
  const corrections = usePagedResource<OperationCorrectionCandidate>(
    available && base ? `${base}/corrections/candidates?${query}` : null,
  );
  const command = useCommand();
  const scope = JSON.stringify([
    workspace.company?.id,
    workspace.company?.role,
    workspace.user?.id,
    workspace.canWrite,
    form.kind,
    form.party_id,
    form.accounts,
  ]);
  const current = useRef(scope);
  useEffect(() => {
    current.current = scope;
  }, [scope]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const activeEditor = editor?.scope === scope ? editor : null;
  const [correctionState, setCorrection] = useState<{
    scope: string;
    item: OperationCorrectionCandidate;
    accounts: Record<string, string>;
    reason: string;
  } | null>(null);
  const correction = correctionState?.scope === scope ? correctionState : null;

  function applySuggestion(item: OperationSuggestion) {
    if (!available || !item.enabled) return;
    const requestedScope = scope;
    void command.run<OperationSuggestion>(
      base ? `${base}/${item.operation_id}?${query}` : null,
      { method: "GET" },
      (fresh) => {
        if (current.current === requestedScope) {
          const suggested = Object.fromEntries(
            Object.entries(fresh.accounts).map(([role, value]) => [
              role,
              value.id,
            ]),
          );
          onAccounts({ ...form.accounts, ...suggested });
        }
      },
    );
  }
  function save() {
    if (!activeEditor || !activeEditor.name.trim()) return;
    void command.run(
      base ? `${base}/${activeEditor.item.operation_id}` : null,
      {
        method: "PATCH",
        version: activeEditor.item.version,
        body: {
          name: activeEditor.name.trim(),
          enabled: activeEditor.enabled,
        },
      },
      () => {
        setEditor(null);
        resource.refresh();
      },
      "پیشنهاد حساب به‌روز شد.",
    );
  }
  function adoptCorrection() {
    if (
      !correction ||
      !correction.reason.trim() ||
      correction.item.roles.some((role) => !correction.accounts[role.key])
    )
      return;
    void command.run(
      base ? `${base}/${correction.item.operation_id}/correction` : null,
      {
        body: {
          journal_id: correction.item.journal_id,
          journal_digest: correction.item.journal_digest,
          approved_draft_version: correction.item.approved_draft_version,
          accounts: correction.accounts,
          reason: correction.reason.trim(),
        },
      },
      () => {
        setCorrection(null);
        corrections.refresh();
        resource.refresh();
      },
      "اصلاح حساب‌ها برای پیشنهادهای بعدی ثبت شد.",
    );
  }
  return {
    available,
    resource,
    command,
    editor: activeEditor,
    corrections,
    correction,
    adoptCorrection,
    canAdoptCorrection:
      !!correction &&
      !!correction.reason.trim() &&
      correction.item.roles.every((role) => !!correction.accounts[role.key]),
    reviewCorrection: (item: OperationCorrectionCandidate) => {
      command.clearError();
      setCorrection({ scope, item, accounts: {}, reason: "" });
    },
    closeCorrection: () => setCorrection(null),
    changeCorrection: (patch: {
      accounts?: Record<string, string>;
      reason?: string;
    }) => correction && setCorrection({ ...correction, ...patch }),
    canManage: ["owner", "finance_manager"].includes(
      workspace.company?.role || "",
    ),
    rows: (resource.data?.items || []).map((item) => ({
      ...item,
      accountRows: Object.entries(item.accounts).map(([role, account]) => ({
        ...account,
        role,
        label: roles.find((item) => item.key === role)?.label || role,
      })),
    })),
    applySuggestion,
    save,
    edit: (item: OperationSuggestion) => {
      command.clearError();
      setEditor({ scope, item, name: item.name, enabled: item.enabled });
    },
    close: () => setEditor(null),
    changeEditor: (patch: { name?: string; enabled?: boolean }) =>
      activeEditor && setEditor({ ...activeEditor, ...patch }),
  };
}
