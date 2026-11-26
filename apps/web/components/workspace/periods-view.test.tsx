import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PeriodsView } from "./periods-view";

const actions = vi.hoisted(() => ({
  openCreate: vi.fn(),
  openEdit: vi.fn(),
  setDeleting: vi.fn(),
}));

const state = vi.hoisted(() => ({
  creating: false,
  workspace: {
    company: { id: "comp-1", name: "شرکت نمونه" },
    periodId: "p-active",
    canWrite: true,
  },
  items: [
    { id: "p-past", name: "دوره ۱۴۰۴", start: "2025-01-01", end: "2025-12-29", version: 1, in_use: true, closed: false },
    { id: "p-active", name: "دوره ۱۴۰۵", start: "2026-01-01", end: "2026-12-29", version: 1, in_use: false, closed: false },
    { id: "p-locked", name: "دوره قفل‌شده", start: "2024-01-01", end: "2024-12-29", version: 1, in_use: false, closed: true },
  ],
}));

vi.mock("@/hooks/workspace", () => ({ useWorkspace: () => state.workspace }));
vi.mock("@/hooks/use-period-management", () => ({
  periodDateRangeStatus: (p: { id: string }) => p.id === "p-active" ? "current" : "expired",
  usePeriodManagement: () => ({
    ...actions,
    workspace: state.workspace,
    resource: {
      loading: false,
      refresh: vi.fn(),
      data: { items: state.items },
      page: 1,
      firstPage: vi.fn(),
      previousPage: vi.fn(),
      nextPage: vi.fn(),
    },
    command: { busy: false, clearError: vi.fn() },
    creating: state.creating,
    name: "",
    start: "",
    end: "",
    previousPeriodId: "",
    comparisonCandidates: [],
    closeCreate: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
  }),
}));

describe("PeriodsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.creating = false;
  });

  it("distinguishes the expired date range, posting lock, and current header selection", () => {
    render(<PeriodsView />);
    const expired = within(screen.getByRole("row", { name: /دوره ۱۴۰۴/ }));
    expect(expired.getByText("تاریخ پایان گذشته")).toBeInTheDocument();
    expect(expired.getByText("باز برای ثبت")).toBeInTheDocument();
    expect(expired.getByRole("link", { name: "بستن / افتتاح" }))
      .toHaveAttribute("href", "/accounting/period-end?period_id=p-past");
    const locked = within(screen.getByRole("row", { name: /دوره قفل‌شده/ }));
    expect(locked.getByText("قفل‌شده (بسته)")).toBeInTheDocument();
    expect(locked.getByRole("button", { name: "ویرایش" })).toBeDisabled();
    expect(screen.getByText("دوره فعلی هدر")).toBeInTheDocument();
  });

  it("opens edits for unlocked periods and only deletes unused, unlocked periods", () => {
    render(<PeriodsView />);
    const inUse = within(screen.getByRole("row", { name: /دوره ۱۴۰۴/ }));
    expect(inUse.getByRole("button", { name: /قابل حذف نیست/ })).toBeDisabled();
    fireEvent.click(inUse.getByRole("button", { name: "ویرایش" }));
    expect(actions.openEdit).toHaveBeenCalledWith(state.items[0]);

    const deleteButton = screen.getByRole("button", { name: "حذف دوره ۱۴۰۵" });
    expect(deleteButton).toBeEnabled();
    fireEvent.click(deleteButton);
    expect(actions.setDeleting).toHaveBeenCalledWith(state.items[1]);
  });

  it("opens creation and shows the optional comparison period in the form", () => {
    const { rerender } = render(<PeriodsView />);
    fireEvent.click(screen.getByRole("button", { name: "دوره جدید" }));
    expect(actions.openCreate).toHaveBeenCalledOnce();
    state.creating = true;
    rerender(<PeriodsView />);
    const drawer = screen.getByRole("dialog", { name: "دوره مالی جدید" });
    expect(within(drawer).getByRole("combobox", { name: /دوره مقایسه قبلی/ })).toBeInTheDocument();
  });
});
