"use client";

import { useCallback, useState } from "react";
import { usePathname } from "next/navigation";
import {
  isItemOrChildActive,
  navigationGroups,
  type NavigationGroup,
} from "@/lib/navigation-catalog";

export const SIDEBAR_COLLAPSED_GROUPS_STORAGE_KEY =
  "didban_sidebar_collapsed_groups";
export const SIDEBAR_COLLAPSED_SUBGROUPS_STORAGE_KEY =
  "didban_sidebar_collapsed_subgroups";

export interface UseSidebarNavigationOptions {
  groups?: NavigationGroup[];
  storageKey?: string;
  subgroupsStorageKey?: string;
}

export function useSidebarNavigation(options?: UseSidebarNavigationOptions) {
  const groups = options?.groups ?? navigationGroups;
  const storageKey =
    options?.storageKey ?? SIDEBAR_COLLAPSED_GROUPS_STORAGE_KEY;
  const subgroupsStorageKey =
    options?.subgroupsStorageKey ?? SIDEBAR_COLLAPSED_SUBGROUPS_STORAGE_KEY;
  const pathname = usePathname();

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === "object") {
          return parsed;
        }
      }
    } catch {
      // Ignore storage errors in restricted contexts
    }
    return {};
  });

  const [collapsedSubgroups, setCollapsedSubgroups] = useState<
    Record<string, boolean>
  >(() => {
    if (typeof window === "undefined") return {};
    try {
      const stored = window.localStorage.getItem(subgroupsStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === "object") {
          return parsed;
        }
      }
    } catch {
      // Ignore storage errors in restricted contexts
    }
    return {};
  });

  const activeGroup = groups.find((group) =>
    group.items.some((item) => isItemOrChildActive(item, pathname)),
  );
  const activeSubgroup = activeGroup?.items.find(
    (item) => item.children?.length && isItemOrChildActive(item, pathname),
  );
  const [pathOverrides, setPathOverrides] = useState<{
    pathname: string;
    group?: boolean;
    subgroup?: boolean;
  }>({ pathname });
  if (pathOverrides.pathname !== pathname) setPathOverrides({ pathname });

  const isGroupExpanded = (label?: string) =>
    !label || (label === activeGroup?.label ? !pathOverrides.group : !collapsed[label]);
  const isSubgroupExpanded = (label: string) =>
    label === activeSubgroup?.label
      ? !pathOverrides.subgroup
      : collapsedSubgroups[label] === false;

  const persistState = useCallback(
    (next: Record<string, boolean>) => {
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        }
      } catch {
        // Ignore storage errors in restricted contexts
      }
    },
    [storageKey],
  );

  const persistSubgroupsState = useCallback(
    (next: Record<string, boolean>) => {
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem(subgroupsStorageKey, JSON.stringify(next));
        }
      } catch {
        // Ignore storage errors in restricted contexts
      }
    },
    [subgroupsStorageKey],
  );

  function setGroupCollapsed(label: string, value: boolean) {
    const next = { ...collapsed, [label]: value };
    setCollapsed(next);
    persistState(next);
    if (label === activeGroup?.label) {
      setPathOverrides({ ...pathOverrides, group: value });
    }
  }

  function setSubgroupCollapsed(label: string, value: boolean) {
    const next = { ...collapsedSubgroups, [label]: value };
    setCollapsedSubgroups(next);
    persistSubgroupsState(next);
    if (label === activeSubgroup?.label) {
      setPathOverrides({ ...pathOverrides, subgroup: value });
    }
  }

  function expandAll() {
    const nextSubgroups = Object.fromEntries(groups.flatMap((group) =>
      group.items.filter((item) => item.children?.length).map((item) => [item.label, false]),
    ));
    setCollapsed({});
    persistState({});
    setCollapsedSubgroups(nextSubgroups);
    persistSubgroupsState(nextSubgroups);
    setPathOverrides({ pathname });
  }

  function collapseAll() {
    const next = Object.fromEntries(groups.flatMap((group) =>
      group.label ? [[group.label, true]] : [],
    ));
    setCollapsed(next);
    persistState(next);
    setPathOverrides({ ...pathOverrides, group: true });
  }

  const isGroupActive = useCallback(
    (group: NavigationGroup) =>
      group.items.some((item) => isItemOrChildActive(item, pathname)),
    [pathname],
  );

  return {
    pathname,
    collapsed,
    collapsedSubgroups,
    isGroupExpanded,
    isSubgroupExpanded,
    isGroupActive,
    toggleGroup: (label: string) => setGroupCollapsed(label, isGroupExpanded(label)),
    expandGroup: (label: string) => setGroupCollapsed(label, false),
    collapseGroup: (label: string) => setGroupCollapsed(label, true),
    toggleSubgroup: (label: string) => setSubgroupCollapsed(label, isSubgroupExpanded(label)),
    expandSubgroup: (label: string) => setSubgroupCollapsed(label, false),
    collapseSubgroup: (label: string) => setSubgroupCollapsed(label, true),
    expandAll,
    collapseAll,
  };
}

export type SidebarNavigationReturn = ReturnType<typeof useSidebarNavigation>;
