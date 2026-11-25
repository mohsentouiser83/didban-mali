"use client";
import { useState } from "react";
import { toast } from "sonner";
import type { ParsedTableImport } from "@/components/ui/table-import-dialog";
import { api, listItems } from "@/lib/api";
import type { AccountNature, AccountingCapabilities, LedgerAccount } from "@/lib/accounting";
import {
  accountCodeHint,
  accountImportRows,
  parentAccountLevel,
  isTreasuryAccount,
  suggestAccountCode,
  validateAccountCodePattern,
  type AccountLevel,
} from "@/lib/account-catalogue";
import { useAccountOptions } from "./use-account-options";
import { useCommand } from "./use-command";
import { usePagedResource } from "./use-paged-resource";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";

type AccountForm = {
  code: string;
  name: string;
  nature: AccountNature;
  active: boolean;
  level: AccountLevel | "";
  parent_id: string;
  role: string;
};
const blank = (): AccountForm => ({
  code: "",
  name: "",
  nature: "debit",
  active: true,
  level: "group",
  parent_id: "",
  role: "",
});
export function useLedgerAccounts() {
  const workspace = useWorkspace();
  const [levelFilter, setLevelFilter] = useState("all");
  const [parentFilter, setParentFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "treasury">("all");
  const params = new URLSearchParams();
  if (levelFilter !== "all") params.set("level", levelFilter);
  if (parentFilter !== "all") params.set("parent_id", parentFilter);
  const resource = usePagedResource<LedgerAccount>(
    workspace.companyPath(`accounting/accounts${params.size ? `?${params}` : ""}`),
  );
  const catalogue = useAccountOptions(workspace.company?.id || "");
  const capabilities = useResource<AccountingCapabilities>(workspace.companyPath("accounting/capabilities"));
  const command = useCommand();
  const [editing, setEditing] = useState<LedgerAccount | null | undefined>();
  const [value, setValue] = useState<AccountForm>(blank);
  const [codeTouched, setCodeTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const parentLevel = parentAccountLevel(value.level);
  const choices = (level?: string | null) => catalogue.items
    .filter((account) => (!level || account.level === level) && account.id !== editing?.id)
    .map((account) => ({ value: account.id, label: `${account.code} — ${account.name}` }));
  function open(account: LedgerAccount | null) {
    setEditing(account);
    setCodeTouched(!!account);
    setValue(account ? {
      code: account.code, name: account.name, nature: account.nature ?? "debit", active: account.active,
      level: account.level || "", parent_id: account.parent_id || "", role: account.role || "",
    } : {
      ...blank(),
      code: suggestAccountCode(catalogue.items, "group", ""),
    });
    setErrors({});
    command.clearError();
  }
  function change(patch: Partial<AccountForm>) {
    if (patch.code !== undefined) {
      setCodeTouched(true);
    }
    setValue((previous) => {
      const levelChanged = patch.level !== undefined && patch.level !== previous.level;
      const parentChanged = patch.parent_id !== undefined && patch.parent_id !== previous.parent_id;
      const nextLevel = patch.level ?? previous.level;
      const nextParentId = levelChanged ? "" : (patch.parent_id ?? previous.parent_id);
      let nextCode = patch.code ?? previous.code;
      if (!editing && patch.code === undefined && (levelChanged || parentChanged)) {
        const suggested = suggestAccountCode(catalogue.items, nextLevel, nextParentId);
        if (!codeTouched || levelChanged || parentChanged) {
          nextCode = suggested;
        }
      }
      return {
        ...previous,
        ...patch,
        ...(levelChanged ? { parent_id: "" } : {}),
        code: nextCode,
      };
    });
    setErrors({});
    command.clearError();
  }
  function refresh() { resource.refresh(); catalogue.refresh(); }
  function save() {
    const next: Record<string, string> = {};
    if (!value.name.trim()) next.name = "نام حساب لازم است.";
    if (!value.level) next.level = "سطح حساب را انتخاب کنید.";
    if (parentLevel && !value.parent_id) next.parent_id = "حساب بالادست را انتخاب کنید.";
    const selectedParent = value.parent_id
      ? catalogue.items.find((account) => account.id === value.parent_id)
      : undefined;
    if (!editing && value.level) {
      const patternError = validateAccountCodePattern(value.code, value.level, selectedParent?.code);
      if (patternError) next.code = patternError;
    } else if (!value.code.trim()) {
      next.code = "کد حساب لازم است.";
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    const body: Record<string, unknown> = {
      ...value,
      code: value.code.trim(),
      name: value.name.trim(),
      parent_id: value.parent_id || null,
    };
    if (value.role) {
      body.role = value.role;
    } else if (editing?.role) {
      body.role = null;
    } else {
      delete body.role;
    }
    void command.run(workspace.companyPath(`accounting/accounts${editing ? `/${editing.id}` : ""}`), {
      method: editing ? "PATCH" : "POST", version: editing?.version,
      body,
    }, () => { setEditing(undefined); refresh(); }, "حساب ذخیره شد.");
  }
  const allRows = listItems(resource.data);
  const rows = categoryFilter === "treasury" ? allRows.filter(isTreasuryAccount) : allRows;
  const selectedParentCode = value.parent_id
    ? catalogue.items.find((account) => account.id === value.parent_id)?.code
    : undefined;
  return {
    workspace, resource, catalogue, capabilities, command, editing, value, errors,
    rows, open, save, change, refresh,
    close: () => setEditing(undefined),
    levelFilter, parentFilter, setParentFilter,
    categoryFilter, setCategoryFilter,
    setLevelFilter: (level: string) => { setLevelFilter(level); setParentFilter("all"); },
    resetFilters: () => { setLevelFilter("all"); setParentFilter("all"); setCategoryFilter("all"); },
    parentLevel, parentOptions: choices(parentLevel),
    codeHint: accountCodeHint(value.level, selectedParentCode),
    parentLabel: parentLevel === "group"
      ? "حساب گروه بالادست"
      : parentLevel === "general"
        ? "حساب کل بالادست"
        : "حساب معین بالادست",
    canFilterParent: levelFilter !== "group" && levelFilter !== "unclassified",
    filtersActive: levelFilter !== "all" || parentFilter !== "all" || categoryFilter !== "all",
    filterParentOptions: catalogue.items.filter((account) =>
      levelFilter === "detail" ? account.level === "subsidiary"
        : levelFilter === "subsidiary" ? account.level === "general"
          : levelFilter === "general" ? account.level === "group"
            : !!account.level && account.level !== "detail",
    ).map((account) => ({ value: account.id, label: `${account.code} — ${account.name}` })),
    importFromExcel: async (parsed: ParsedTableImport) => {
      if (!workspace.company || !parsed.rows.length) return;
      try {
        const preview = await api<{ preview_id: string }>(workspace.companyPath("accounting/setup/chart-preview")!, {
          method: "POST", body: { rows: accountImportRows(parsed) },
        });
        await api(workspace.companyPath("accounting/setup/chart-import")!, {
          method: "POST", body: { preview_id: preview.preview_id },
        });
        refresh();
        toast.success("کدینگ وارد شد.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "ورود کدینگ انجام نشد.");
        throw error;
      }
    },
  };
}
