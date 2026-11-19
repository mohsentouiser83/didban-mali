import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileView } from "./profile-view";
import { api } from "@/lib/api";

const updateUserMock = vi.fn();
const mockUser = {
  id: "u-1",
  email: "user@example.test",
  name: "کاربر نمونه",
  installation_admin: false,
  avatar: null,
};

vi.mock("@/hooks/workspace", () => ({
  useWorkspace: () => ({
    user: mockUser,
    company: { id: "c-1", name: "شرکت تست", role: "owner" },
    updateUser: updateUserMock,
  }),
}));

vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));

vi.mock("@/components/ui/sonner", () => ({
  notify: { success: vi.fn() },
}));

vi.mock("@/hooks/use-bot-connections", () => ({
  useBotConnections: () => ({
    company: { id: "c-1", name: "شرکت تست" },
    scopeKey: "c-1",
    cards: [
      {
        provider: "telegram",
        label: "تلگرام",
        username: "test_bot",
        configured: true,
        active: null,
        pending: null,
        copied: false,
        remainingMinutes: 10,
      },
      {
        provider: "bale",
        label: "بله",
        username: "test_bale_bot",
        configured: true,
        active: null,
        pending: null,
        copied: false,
        remainingMinutes: 10,
      },
    ],
    busy: false,
    loading: false,
    error: undefined,
    operationError: undefined,
    pendingAction: undefined,
    create: vi.fn(),
    copy: vi.fn(),
    confirm: vi.fn(),
    revoke: vi.fn(),
    refresh: vi.fn(),
    clearError: vi.fn(),
  }),
}));

describe("ProfileView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders user information, email, role, and bot connections", () => {
    render(<ProfileView />);

    expect(screen.getByText("پروفایل کاربری")).toBeVisible();
    expect(screen.getByDisplayValue("کاربر نمونه")).toBeVisible();
    expect(screen.getByDisplayValue("user@example.test")).toBeVisible();
    expect(screen.getByText("مالک شرکت")).toBeVisible();
    expect(screen.getByText("تلگرام")).toBeVisible();
    expect(screen.getByText("بله")).toBeVisible();
  });

  it("updates user name via PATCH /auth/profile", async () => {
    vi.mocked(api).mockResolvedValueOnce({
      user: { ...mockUser, name: "نام ویرایش شده" },
    });

    render(<ProfileView />);

    const nameInput = screen.getByDisplayValue("کاربر نمونه");
    fireEvent.change(nameInput, { target: { value: "نام ویرایش شده" } });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره تغییرات" }));

    await waitFor(() => {
      expect(api).toHaveBeenCalledWith("/auth/profile", {
        method: "PATCH",
        body: { name: "نام ویرایش شده" },
      });
      expect(updateUserMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: "نام ویرایش شده" }),
      );
    });
  });
});
