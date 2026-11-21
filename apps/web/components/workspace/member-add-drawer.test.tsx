import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemberAddDrawer } from "./member-add-drawer";

describe("MemberAddDrawer", () => {
  const baseManagement = {
    adding: true,
    closeAdd: vi.fn(),
    add: vi.fn(),
    command: { busy: false, error: null },
    canCreateAccount: true,
    userId: "",
    setUserId: vi.fn(),
    method: "existing",
    setMethod: vi.fn(),
    account: { name: "", email: "", password: "" },
    setAccount: vi.fn(),
    newRole: "viewer",
    setNewRole: vi.fn(),
    validation: "",
    userSearchQuery: "",
    setUserSearchQuery: vi.fn(),
    userOptions: [
      { value: "u1", label: "علی رضایی (ali@example.test)" },
      { value: "u2", label: "سارا محمدی (sara@example.test)" },
    ],
    filteredUserOptions: [
      { value: "u1", label: "علی رضایی (ali@example.test)" },
      { value: "u2", label: "سارا محمدی (sara@example.test)" },
    ],
    users: { loading: false, error: null, refresh: vi.fn() },
  } as unknown as Parameters<typeof MemberAddDrawer>[0]["c"];

  it("renders member add drawer with SearchSelect for users", () => {
    render(<MemberAddDrawer c={baseManagement} />);

    expect(screen.getByRole("heading", { name: "افزودن عضو" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /حساب کاربر/i })).toBeInTheDocument();
  });

  it("submits the add form", () => {
    const add = vi.fn();
    render(<MemberAddDrawer c={{ ...baseManagement, add }} />);

    const submitBtn = screen.getByRole("button", { name: "افزودن عضو به شرکت" });
    fireEvent.click(submitBtn);

    expect(add).toHaveBeenCalled();
  });
});
