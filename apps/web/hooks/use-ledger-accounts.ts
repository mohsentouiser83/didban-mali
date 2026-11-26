"use client";
import { useState } from "react";
import { listItems } from "@/lib/api";
import type { AccountNature, AccountingCapabilities, LedgerAccount } from "@/lib/accounting";
import {
  accountCodeHint,
  accountRoleLabel,
  buildAccountTreeRows,
  childAccountLevel,
  parentAccountLevel,
  isTreasuryAccount,
  suggestAccountCode,
  treasuryRoleLabel,
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
function normalizeSearch(value: string) {
  return value
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
export function useLedgerAccounts() {
  const workspace = useWorkspace();
  const [search, setSearch] = useState("");
  const [localPage, setLocalPage] = useState(0);
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
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
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
  function openChild(parent: LedgerAccount) {
    const nextLevel = childAccountLevel(parent.level);
    if (!nextLevel) return;
    setEditing(null);
    setCodeTouched(false);
    setValue({
      ...blank(),
      level: nextLevel,
      parent_id: parent.id,
      nature: parent.nature ?? "debit",
      code: suggestAccountCode(catalogue.items, nextLevel, parent.id),
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
    const hierarchyUnchanged = Boolean(
      editing &&
      value.level === (editing.level || "") &&
      value.parent_id === (editing.parent_id || ""),
    );
    if ((!editing || !hierarchyUnchanged) && value.level) {
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
  const normalizedTerm = normalizeSearch(search);
  const localFiltersActive = Boolean(normalizedTerm) || categoryFilter === "treasury";
  const serverFiltersActive = !localFiltersActive && (levelFilter !== "all" || parentFilter !== "all");
  const filtersActive = serverFiltersActive || localFiltersActive;
  const localRows = localFiltersActive ? catalogue.items.filter((account) => {
    if (levelFilter !== "all" && (account.level || "unclassified") !== levelFilter) return false;
    if (parentFilter !== "all" && account.parent_id !== parentFilter) return false;
    if (categoryFilter === "treasury" && !isTreasuryAccount(account)) return false;
    const roleText = account.role ? (treasuryRoleLabel(account.role) || accountRoleLabel(account.role)) : "";
    return normalizeSearch(
      [account.code, account.name, account.parent_code, account.parent_name, roleText].filter(Boolean).join(" "),
    ).includes(normalizedTerm);
  }) : [];
  const pageSize = 25;
  const page = Math.min(localPage, Math.max(0, Math.ceil(localRows.length / pageSize) - 1));
  const rows = localFiltersActive
    ? localRows.slice(page * pageSize, (page + 1) * pageSize)
    : serverFiltersActive ? listItems(resource.data) : catalogue.items;
  const treeRows = filtersActive
    ? rows.map((account) => ({
        account,
        depth: 0,
        hasChildren: !!account.has_children,
        childCount: 0,
        expanded: false,
        childLevel: childAccountLevel(account.level),
      }))
    : buildAccountTreeRows(catalogue.items, collapsedIds);
  const expandableIds = catalogue.items
    .filter((item) => catalogue.items.some((child) => child.parent_id === item.id))
    .map((item) => item.id);
  const toggleExpand = (accountId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  };
  const expandAll = () => setCollapsedIds(new Set());
  const collapseAll = () => setCollapsedIds(new Set(expandableIds));
  const selectedParentCode = value.parent_id
    ? catalogue.items.find((account) => account.id === value.parent_id)?.code
    : undefined;
  const suggestedCode = !editing && value.level
    ? suggestAccountCode(catalogue.items, value.level, value.parent_id)
    : "";
  return {
    workspace, resource, catalogue, capabilities, command, editing, value, errors,
    rows, treeRows, open, openChild, save, change, refresh,
    suggestedCode,
    applySuggestedCode: () => {
      if (suggestedCode) change({ code: suggestedCode });
    },
    toggleExpand, expandAll, collapseAll,
    hasExpandableNodes: !filtersActive && expandableIds.length > 0,
    allCollapsed: expandableIds.length > 0 && expandableIds.every((id) => collapsedIds.has(id)),
    close: () => setEditing(undefined),
    search, setSearch: (term: string) => { setLocalPage(0); setSearch(term); },
    levelFilter, parentFilter,
    setParentFilter: (parent: string) => { setLocalPage(0); setParentFilter(parent); },
    categoryFilter,
    setCategoryFilter: (category: "all" | "treasury") => { setLocalPage(0); setCategoryFilter(category); },
    setLevelFilter: (level: string) => { setLocalPage(0); setLevelFilter(level); setParentFilter("all"); },
    resetFilters: () => { setLocalPage(0); setSearch(""); setLevelFilter("all"); setParentFilter("all"); setCategoryFilter("all"); },
    localPagination: {
      page, total: localRows.length, pageSize,
      onPrevious: () => setLocalPage(Math.max(0, page - 1)),
      onNext: () => setLocalPage(page + 1),
    },
    parentLevel, parentOptions: choices(parentLevel),
    codeHint: accountCodeHint(value.level, selectedParentCode),
    parentLabel: parentLevel === "group"
      ? "حساب گروه بالادست"
      : parentLevel === "general"
        ? "حساب کل بالادست"
        : "حساب معین بالادست",
    canFilterParent: levelFilter !== "group" && levelFilter !== "unclassified",
    filtersActive,
    serverFiltersActive,
    filterParentOptions: catalogue.items.filter((account) =>
      levelFilter === "detail" ? account.level === "subsidiary"
        : levelFilter === "subsidiary" ? account.level === "general"
          : levelFilter === "general" ? account.level === "group"
            : !!account.level && account.level !== "detail",
    ).map((account) => ({ value: account.id, label: `${account.code} — ${account.name}` })),
  };
}
