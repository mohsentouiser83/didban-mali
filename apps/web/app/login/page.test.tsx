import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import LoginPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

describe("LoginPage", () => {
  it("shows the Persian authentication entry point", () => {
    const { container } = render(<LoginPage />);
    expect(screen.getByRole("heading", { name: "خوش آمدید" })).toBeInTheDocument();
    expect(container.querySelector("main.ds-root.auth-shell")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ورود به دیدبان" })).toBeInTheDocument();
    expect(screen.getByText("اطلاعات نشست در کوکی امن نگهداری می‌شود.")).toBeInTheDocument();
  });
});
