import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsMenu } from "./notifications-menu";
import { api } from "@/lib/api";

const { resourceMock, refreshMock } = vi.hoisted(() => ({
  resourceMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("@/hooks/workspace", () => ({
  useWorkspace: () => ({
    company: { id: "test-co", name: "شرکت تست" },
    companyPath: (path: string) => `/companies/test-co/${path}`,
  }),
}));

vi.mock("@/hooks/use-resource", () => ({
  useResource: resourceMock,
}));

vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));

describe("NotificationsMenu", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset().mockResolvedValue({});
    refreshMock.mockReset();
  });

  it("renders trigger button and shows popover with notifications and unread badge", () => {
    resourceMock.mockReturnValue({
      data: {
        items: [
          {
            id: "n-1",
            title: "گزارش مالی آماده شد",
            href: "/reports",
            read: false,
            version: 1,
            created_at: "2026-11-18T10:00:00",
          },
          {
            id: "n-2",
            title: "بارگذاری با موفقیت انجام شد",
            href: "/uploads/session-1",
            read: true,
            version: 2,
            created_at: "2026-11-17T10:00:00",
          },
        ],
      },
      loading: false,
      error: undefined,
      refresh: refreshMock,
    });

    render(<NotificationsMenu />);

    // Trigger button should indicate 1 unread notification
    const trigger = screen.getByRole("button", {
      name: "اعلان‌ها (۱ خوانده‌نشده)",
    });
    expect(trigger).toBeInTheDocument();
    expect(screen.getByText("۱")).toBeInTheDocument();

    // Click trigger to open popover
    fireEvent.click(trigger);

    // Popover content should be visible
    expect(screen.getByRole("heading", { name: "اعلان‌ها" })).toBeInTheDocument();
    expect(screen.getByText("۱ جدید")).toBeInTheDocument();
    expect(screen.getByText("گزارش مالی آماده شد")).toBeInTheDocument();
    expect(screen.getByText("بارگذاری با موفقیت انجام شد")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "مشاهده" }).map((link) => link.getAttribute("href")))
      .toContain("/reports/processing/session-1");
    expect(screen.getByRole("button", { name: "خواندن همه" })).toBeInTheDocument();
  });

  it("marks a single notification as read", async () => {
    resourceMock.mockReturnValue({
      data: {
        items: [
          {
            id: "n-1",
            title: "اعلان آزمایشی",
            href: "/reports",
            read: false,
            version: 1,
            created_at: "2026-11-18T10:00:00",
          },
        ],
      },
      loading: false,
      error: undefined,
      refresh: refreshMock,
    });

    render(<NotificationsMenu />);
    fireEvent.click(screen.getByRole("button", { name: /اعلان‌ها/ }));

    const markReadBtn = screen.getByRole("button", {
      name: "علامت‌گذاری به‌عنوان خوانده‌شده",
    });
    fireEvent.click(markReadBtn);

    await waitFor(() => {
      expect(api).toHaveBeenCalledWith(
        "/companies/test-co/notifications/n-1",
        {
          method: "PATCH",
          body: { read: true },
          version: 1,
        },
      );
    });
    expect(refreshMock).toHaveBeenCalled();
  });

  it("marks all unread notifications as read when clicking mark all", async () => {
    resourceMock.mockReturnValue({
      data: {
        items: [
          {
            id: "n-1",
            title: "اعلان اول",
            href: "",
            read: false,
            version: 1,
            created_at: "2026-11-18T10:00:00",
          },
          {
            id: "n-2",
            title: "اعلان دوم",
            href: "",
            read: false,
            version: 2,
            created_at: "2026-11-18T11:00:00",
          },
        ],
      },
      loading: false,
      error: undefined,
      refresh: refreshMock,
    });

    render(<NotificationsMenu />);
    fireEvent.click(screen.getByRole("button", { name: /اعلان‌ها/ }));

    const markAllBtn = screen.getByRole("button", { name: "خواندن همه" });
    fireEvent.click(markAllBtn);

    await waitFor(() => {
      expect(api).toHaveBeenCalledTimes(2);
    });
    expect(api).toHaveBeenCalledWith(
      "/companies/test-co/notifications/n-1",
      expect.objectContaining({ method: "PATCH", body: { read: true } }),
    );
    expect(api).toHaveBeenCalledWith(
      "/companies/test-co/notifications/n-2",
      expect.objectContaining({ method: "PATCH", body: { read: true } }),
    );
    expect(refreshMock).toHaveBeenCalled();
  });

  it("renders empty state when there are no notifications", () => {
    resourceMock.mockReturnValue({
      data: { items: [] },
      loading: false,
      error: undefined,
      refresh: refreshMock,
    });

    render(<NotificationsMenu />);
    const trigger = screen.getByRole("button", { name: "اعلان‌ها" });
    fireEvent.click(trigger);

    expect(screen.getByText("اعلان تازه‌ای نیست")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "خواندن همه" })).toBeNull();
  });

  it("renders error state when request fails", () => {
    resourceMock.mockReturnValue({
      data: undefined,
      loading: false,
      error: { message: "خطا در دریافت اعلان‌ها" },
      refresh: refreshMock,
    });

    render(<NotificationsMenu />);
    fireEvent.click(screen.getByRole("button", { name: "اعلان‌ها" }));

    expect(screen.getByText("خطا در دریافت اعلان‌ها")).toBeInTheDocument();
  });
});
