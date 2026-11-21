import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SIDEBAR_COLLAPSED_GROUPS_STORAGE_KEY,
  SIDEBAR_COLLAPSED_SUBGROUPS_STORAGE_KEY,
  useSidebarNavigation,
} from "./use-sidebar-navigation";
import { navigationGroups } from "@/lib/navigation-catalog";

let currentPathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
}));

const storage: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => storage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete storage[key];
  }),
  clear: vi.fn(() => {
    for (const key of Object.keys(storage)) {
      delete storage[key];
    }
  }),
};

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  writable: true,
});

describe("useSidebarNavigation", () => {
  beforeEach(() => {
    currentPathname = "/";
    localStorageMock.clear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
  });

  it("initializes with all groups and subgroups expanded by default", () => {
    const { result } = renderHook(() => useSidebarNavigation());

    navigationGroups.forEach((group) => {
      expect(result.current.isGroupExpanded(group.label)).toBe(true);
    });
    expect(result.current.isSubgroupExpanded("انبار")).toBe(true);
    expect(result.current.collapsed).toEqual({});
    expect(result.current.collapsedSubgroups).toEqual({});
  });

  it("toggles collapse and expand state for a group", () => {
    const { result } = renderHook(() => useSidebarNavigation());

    act(() => {
      result.current.toggleGroup("حسابداری");
    });
    expect(result.current.isGroupExpanded("حسابداری")).toBe(false);
    expect(result.current.isGroupExpanded("داشبورد")).toBe(true);

    act(() => {
      result.current.toggleGroup("حسابداری");
    });
    expect(result.current.isGroupExpanded("حسابداری")).toBe(true);
  });

  it("persists collapsed state to localStorage", () => {
    const { result } = renderHook(() => useSidebarNavigation());

    act(() => {
      result.current.collapseGroup("گزارش‌ها");
    });

    const stored = JSON.parse(
      window.localStorage.getItem(SIDEBAR_COLLAPSED_GROUPS_STORAGE_KEY) || "{}",
    );
    expect(stored["گزارش‌ها"]).toBe(true);
  });

  it("restores collapsed state from localStorage on mount", () => {
    window.localStorage.setItem(
      SIDEBAR_COLLAPSED_GROUPS_STORAGE_KEY,
      JSON.stringify({ داشبورد: true }),
    );
    window.localStorage.setItem(
      SIDEBAR_COLLAPSED_SUBGROUPS_STORAGE_KEY,
      JSON.stringify({ انبار: true }),
    );

    const { result } = renderHook(() => useSidebarNavigation());

    expect(result.current.isGroupExpanded("داشبورد")).toBe(false);
    expect(result.current.isGroupExpanded("حسابداری")).toBe(true);
    expect(result.current.isSubgroupExpanded("انبار")).toBe(false);
  });

  it("supports collapseAll and expandAll", () => {
    const { result } = renderHook(() => useSidebarNavigation());

    act(() => {
      result.current.collapseAll();
    });
    navigationGroups.forEach((group) => {
      expect(result.current.isGroupExpanded(group.label)).toBe(false);
    });

    act(() => {
      result.current.expandAll();
    });
    navigationGroups.forEach((group) => {
      expect(result.current.isGroupExpanded(group.label)).toBe(true);
    });
    expect(result.current.isSubgroupExpanded("انبار")).toBe(true);
  });

  it("auto-expands a collapsed category when pathname changes into it", () => {
    const { result, rerender } = renderHook(() => useSidebarNavigation());

    act(() => {
      result.current.collapseGroup("حسابداری");
    });
    expect(result.current.isGroupExpanded("حسابداری")).toBe(false);

    // Navigate to /accounting/journals
    currentPathname = "/accounting/journals";
    rerender();

    expect(result.current.isGroupExpanded("حسابداری")).toBe(true);
  });

  it("allows user to manually collapse category containing active page without auto-reopening while on same pathname", () => {
    currentPathname = "/accounting/journals";
    const { result, rerender } = renderHook(() => useSidebarNavigation());

    expect(result.current.isGroupExpanded("حسابداری")).toBe(true);

    act(() => {
      result.current.collapseGroup("حسابداری");
    });
    expect(result.current.isGroupExpanded("حسابداری")).toBe(false);

    // Re-rendering on the same pathname must NOT force-expand it
    rerender();
    expect(result.current.isGroupExpanded("حسابداری")).toBe(false);
  });

  it("toggles and auto-expands inventory subcategory under accounting", () => {
    const { result, rerender } = renderHook(() => useSidebarNavigation());

    expect(result.current.isSubgroupExpanded("انبار")).toBe(true);

    act(() => {
      result.current.toggleSubgroup("انبار");
    });
    expect(result.current.isSubgroupExpanded("انبار")).toBe(false);

    // Navigating to /accounting/inventory/items auto-expands both accounting group and inventory subgroup
    currentPathname = "/accounting/inventory/items";
    rerender();

    expect(result.current.isGroupExpanded("حسابداری")).toBe(true);
    expect(result.current.isSubgroupExpanded("انبار")).toBe(true);
  });

  it("toggles and auto-expands reconciliation subcategory under accounting", () => {
    const { result, rerender } = renderHook(() => useSidebarNavigation());

    expect(result.current.isSubgroupExpanded("تطبیق و مغایرت‌گیری")).toBe(true);

    act(() => {
      result.current.toggleSubgroup("تطبیق و مغایرت‌گیری");
    });
    expect(result.current.isSubgroupExpanded("تطبیق و مغایرت‌گیری")).toBe(false);

    // Navigating to /reconciliation/counterparties auto-expands both accounting group and reconciliation subgroup
    currentPathname = "/reconciliation/counterparties";
    rerender();

    expect(result.current.isGroupExpanded("حسابداری")).toBe(true);
    expect(result.current.isSubgroupExpanded("تطبیق و مغایرت‌گیری")).toBe(true);
  });
});
