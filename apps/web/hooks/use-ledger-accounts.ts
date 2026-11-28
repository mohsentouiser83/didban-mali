"use client";
import { useState } from "react";
import { listItems } from "@/lib/api";
import { accountNatureLabel, type AccountNature, type AccountingCapabilities, type LedgerAccount } from "@/lib/accounting";
import {
  accountLevelLabel,
  accountRoleLabel,
  accountPostableStatus,
  buildAccountTreeRows,
  childAccountLevel,
  parentAccountLevel,
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
import { useTableColumnFilters } from "./use-table-column-filters";

type AccountForm = {
  code: string;
  name: string;
  nature: AccountNature;
  active: boolean;
  level: AccountLevel | "";
  parent_id: string;
  role: string;
  linked_account_ids: string[];
};
const blank = (): AccountForm => ({
  code: "",
  name: "",
  nature: "debit",
  active: true,
  level: "group",
  parent_id: "",
  role: "",
  linked_account_ids: [],
});
export function useLedgerAccounts() {
  const workspace = useWorkspace();
  const [localPage, setLocalPage] = useState(0);
  const [levelFilter, setLevelFilter] = useState("all");
  const [parentFilter, setParentFilter] = useState("all");
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
  const needsParent = Boolean(parentLevel && (value.level !== "detail" || value.parent_id));
  const choices = (level?: string | null) => catalogue.items
    .filter((account) => (!level || account.level === level) && account.id !== editing?.id)
    .map((account) => ({ value: account.id, label: `${account.code} — ${account.name}` }));
  const detailTargetOptions = catalogue.items
    .filter((account) => account.active && account.level && account.level !== "detail"
      && account.id !== editing?.id && !value.linked_account_ids.includes(account.id))
    .map((account) => ({
      value: account.id,
      label: `${account.code} — ${account.name} (${accountLevelLabel(account.level)})`,
    }));
  const detailTargets = value.linked_account_ids.map((id) => {
    const target = catalogue.items.find((account) => account.id === id);
    return { id, label: target ? `${target.code} — ${target.name} (${accountLevelLabel(target.level)})` : id };
  });
  function open(account: LedgerAccount | null) {
    setEditing(account);
    setCodeTouched(!!account);
    setValue(account ? {
      code: account.code, name: account.name, nature: account.nature ?? "debit", active: account.active,
      level: account.level || "", parent_id: account.parent_id || "", role: account.role || "",
      linked_account_ids: account.linked_account_ids ?? [],
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
    const floating = nextLevel === "detail";
    setEditing(null);
    setCodeTouched(false);
    setValue({
      ...blank(),
      level: nextLevel,
      parent_id: floating ? "" : parent.id,
      linked_account_ids: floating ? [parent.id] : [],
      nature: parent.nature ?? "debit",
      code: suggestAccountCode(catalogue.items, nextLevel, floating ? null : parent.id),
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
        ...(nextLevel !== "detail" ? { linked_account_ids: [] } : {}),
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
    if (needsParent && !value.parent_id) next.parent_id = "حساب بالادست را انتخاب کنید.";
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
    if (value.level !== "detail") delete body.linked_account_ids;
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
  const scopedAccounts = catalogue.items.filter((account) =>
    (levelFilter === "all" || (account.level || "unclassified") === levelFilter) &&
    (parentFilter === "all" || account.parent_id === parentFilter),
  );
  const filters = useTableColumnFilters(scopedAccounts, {
    code: (account) => account.code,
    name: (account) => account.name,
    nature: (account) => accountNatureLabel(account.nature),
    role: (account) => account.role ? treasuryRoleLabel(account.role) || accountRoleLabel(account.role) : "—",
    status: (account) => `${account.active ? "فعال" : "غیرفعال"} · ${accountPostableStatus(account).label}`,
  });
  const localFiltersActive = filters.active;
  const serverFiltersActive = !localFiltersActive && (levelFilter !== "all" || parentFilter !== "all");
  const filtersActive = serverFiltersActive || localFiltersActive;
  const localRows = filters.rows;
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
    columnFilter: (key: Parameters<typeof filters.bind>[0]) => filters.bind(key, () => setLocalPage(0)),
    levelFilter, parentFilter,
    setParentFilter: (parent: string) => { setLocalPage(0); setParentFilter(parent); },
    setLevelFilter: (level: string) => { setLocalPage(0); setLevelFilter(level); setParentFilter("all"); },
    localPagination: {
      page, total: localRows.length, pageSize,
      onPrevious: () => setLocalPage(Math.max(0, page - 1)),
      onNext: () => setLocalPage(page + 1),
    },
    parentLevel, needsParent, parentOptions: choices(parentLevel),
    detailTargetOptions, detailTargets,
    addDetailTarget: (id: string) => change({ linked_account_ids: [...value.linked_account_ids, id] }),
    removeDetailTarget: (id: string) => change({ linked_account_ids: value.linked_account_ids.filter((target) => target !== id) }),
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
