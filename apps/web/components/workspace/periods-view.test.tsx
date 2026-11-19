import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PeriodsView } from "./periods-view";

const openCreateMock = vi.fn();
const closeCreateMock = vi.fn();
const saveMock = vi.fn();
const removeMock = vi.fn();
const setDeletingMock = vi.fn();

vi.mock("@/hooks/workspace", () => ({
  useWorkspace: () => ({
    company: { id: "comp-1", name: "شرکت نمونه" },
    canWrite: true,
  }),
}));

vi.mock("@/hooks/use-period-management", () => ({
  isPeriodClosed: (p: { end?: string }) => p.end === "2025-12-29",
  usePeriodManagement: () => ({
    workspace: {
      company: { id: "comp-1", name: "شرکت نمونه" },
      canWrite: true,
    },
    resource: {
      loading: false,
      error: undefined,
      refresh: vi.fn(),
      data: {
        items: [
          {
            id: "p-past",
            name: "دوره ۱۴۰۴",
            start: "2025-01-01",
            end: "2025-12-29",
            version: 1,
            in_use: true,
          },
          {
            id: "p-active",
            name: "دوره ۱۴۰۵",
            start: "2026-01-01",
            end: "2026-12-29",
            version: 1,
            in_use: false,
          },
        ],
      },
    },
    command: { busy: false, error: undefined, clearError: vi.fn() },
    creating: false,
    deleting: null,
    name: "دوره ۱۴۰۵",
    start: "2026-01-01",
    end: "2026-12-29",
    setCreating: vi.fn(),
    setDeleting: setDeletingMock,
    setName: vi.fn(),
    setStart: vi.fn(),
    setEnd: vi.fn(),
    openCreate: openCreateMock,
    closeCreate: closeCreateMock,
    save: saveMock,
    remove: removeMock,
  }),
}));

describe("PeriodsView", () => {
  beforeEach(() => {
    openCreateMock.mockReset();
    closeCreateMock.mockReset();
    saveMock.mockReset();
    removeMock.mockReset();
    setDeletingMock.mockReset();
  });

  it("does not render comparison period field or removed guidance text", () => {
    render(<PeriodsView />);

    expect(screen.queryByLabelText("دوره مقایسه")).not.toBeInTheDocument();
    expect(screen.queryByText("دوره مقایسه")).not.toBeInTheDocument();
    expect(
      screen.queryByText("ابتدا و انتهای دوره را انتخاب کنید."),
    ).not.toBeInTheDocument();
  });

  it("does not render manual management action and shows automatic period status", () => {
    render(<PeriodsView />);

    expect(screen.queryByText("مشاهده و مدیریت")).not.toBeInTheDocument();
    expect(screen.getByText("بسته شده (خودکار)")).toBeInTheDocument();
    expect(screen.getByText("دوره جاری")).toBeInTheDocument();
  });

  it("does not render edit action on periods", () => {
    render(<PeriodsView />);

    expect(
      screen.queryByRole("button", { name: /ویرایش/ }),
    ).not.toBeInTheDocument();
  });

  it("prevents deletion of periods containing data and allows deletion of unused periods", () => {
    render(<PeriodsView />);

    // In-use period has badge
    expect(screen.getByText("دارای اطلاعات مالی")).toBeInTheDocument();

    // In-use period delete button is disabled
    const inUseDeleteBtn = screen.getByRole("button", {
      name: /دوره ۱۴۰۴ دارای اطلاعات است و قابل حذف نیست/,
    });
    expect(inUseDeleteBtn).toBeDisabled();

    // Unused period delete button is enabled
    const unusedDeleteBtn = screen.getByRole("button", {
      name: /حذف دوره ۱۴۰۵/,
    });
    expect(unusedDeleteBtn).not.toBeDisabled();
    fireEvent.click(unusedDeleteBtn);
    expect(setDeletingMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p-active" }),
    );
  });

  it("triggers openCreate when clicking دوره جدید", () => {
    render(<PeriodsView />);

    const newBtn = screen.getByRole("button", { name: /دوره جدید/ });
    fireEvent.click(newBtn);
    expect(openCreateMock).toHaveBeenCalled();
  });
});
