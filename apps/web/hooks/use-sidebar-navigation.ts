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

  const [prevPathname, setPrevPathname] = useState(pathname);

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

  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    const activeGroup = groups.find((group) =>
      group.items.some((item) => isItemOrChildActive(item, pathname)),
    );
    if (activeGroup && collapsed[activeGroup.label]) {
      const next = { ...collapsed, [activeGroup.label]: false };
      setCollapsed(next);
      persistState(next);
    }

    // Auto-expand any active subgroup with children
    for (const group of groups) {
      for (const item of group.items) {
        if (
          item.children?.length &&
          isItemOrChildActive(item, pathname) &&
          collapsedSubgroups[item.label]
        ) {
          const next = { ...collapsedSubgroups, [item.label]: false };
          setCollapsedSubgroups(next);
          persistSubgroupsState(next);
        }
      }
    }
  }

  const toggleGroup = useCallback(
    (groupLabel: string) => {
      setCollapsed((prev) => {
        const next = { ...prev, [groupLabel]: !prev[groupLabel] };
        persistState(next);
        return next;
      });
    },
    [persistState],
  );

  const expandGroup = useCallback(
    (groupLabel: string) => {
      setCollapsed((prev) => {
        if (!prev[groupLabel]) return prev;
        const next = { ...prev, [groupLabel]: false };
        persistState(next);
        return next;
      });
    },
    [persistState],
  );

  const collapseGroup = useCallback(
    (groupLabel: string) => {
      setCollapsed((prev) => {
        if (prev[groupLabel]) return prev;
        const next = { ...prev, [groupLabel]: true };
        persistState(next);
        return next;
      });
    },
    [persistState],
  );

  const toggleSubgroup = useCallback(
    (subgroupLabel: string) => {
      setCollapsedSubgroups((prev) => {
        const next = { ...prev, [subgroupLabel]: !prev[subgroupLabel] };
        persistSubgroupsState(next);
        return next;
      });
    },
    [persistSubgroupsState],
  );

  const expandSubgroup = useCallback(
    (subgroupLabel: string) => {
      setCollapsedSubgroups((prev) => {
        if (!prev[subgroupLabel]) return prev;
        const next = { ...prev, [subgroupLabel]: false };
        persistSubgroupsState(next);
        return next;
      });
    },
    [persistSubgroupsState],
  );

  const collapseSubgroup = useCallback(
    (subgroupLabel: string) => {
      setCollapsedSubgroups((prev) => {
        if (prev[subgroupLabel]) return prev;
        const next = { ...prev, [subgroupLabel]: true };
        persistSubgroupsState(next);
        return next;
      });
    },
    [persistSubgroupsState],
  );

  const expandAll = useCallback(() => {
    setCollapsed({});
    persistState({});
    setCollapsedSubgroups({});
    persistSubgroupsState({});
  }, [persistState, persistSubgroupsState]);

  const collapseAll = useCallback(() => {
    const next: Record<string, boolean> = {};
    for (const g of groups) {
      next[g.label] = true;
    }
    setCollapsed(next);
    persistState(next);
  }, [groups, persistState]);

  const isGroupExpanded = useCallback(
    (groupLabel: string) => !collapsed[groupLabel],
    [collapsed],
  );

  const isSubgroupExpanded = useCallback(
    (subgroupLabel: string) => !collapsedSubgroups[subgroupLabel],
    [collapsedSubgroups],
  );

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
    toggleGroup,
    expandGroup,
    collapseGroup,
    toggleSubgroup,
    expandSubgroup,
    collapseSubgroup,
    expandAll,
    collapseAll,
  };
}

export type SidebarNavigationReturn = ReturnType<typeof useSidebarNavigation>;
