import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import RegisterPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

afterEach(cleanup);

describe("RegisterPage", () => {
  it("initializes directly in registration mode", () => {
    const { container } = render(<RegisterPage />);
    expect(screen.getByRole("heading", { name: "شروع با دیدبان مالی" })).toBeInTheDocument();
    expect(container.querySelector("main.ds-root.auth-shell")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ساخت حساب امن" })).toBeInTheDocument();
    expect(screen.getByLabelText("نام و نام خانوادگی")).toBeInTheDocument();
    expect(screen.getByLabelText(/نام فضای کاری/)).toBeInTheDocument();
  });

  it("can switch from register to login mode", () => {
    render(<RegisterPage />);
    expect(screen.getByRole("heading", { name: "شروع با دیدبان مالی" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "ورود" }));
    expect(screen.getByRole("heading", { name: "خوش آمدید" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ورود به دیدبان" })).toBeInTheDocument();
  });
});
