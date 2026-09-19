import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import LoginPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

afterEach(cleanup);

describe("LoginPage", () => {
  it("shows the Persian authentication entry point", () => {
    const { container } = render(<LoginPage />);
    expect(screen.getByRole("heading", { name: "خوش آمدید" })).toBeInTheDocument();
    expect(container.querySelector("main.ds-root.auth-shell")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ورود به دیدبان" })).toBeInTheDocument();
    expect(screen.getByText("حریم خصوصی، امنیت و پشتیبانی")).toBeInTheDocument();
  });

  it("keeps registration values when switching modes", () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("tab", { name: "ساخت حساب" }));
    fireEvent.change(screen.getByLabelText("نام و نام خانوادگی"), { target: { value: "مهسا کریمی" } });
    fireEvent.change(screen.getByLabelText(/نام فضای کاری/), { target: { value: "گروه مالی آریا" } });
    fireEvent.click(screen.getByRole("tab", { name: "ورود", selected: false }));
    fireEvent.click(screen.getByRole("tab", { name: "ساخت حساب", selected: false }));
    expect(screen.getByLabelText("نام و نام خانوادگی")).toHaveValue("مهسا کریمی");
    expect(screen.getByLabelText(/نام فضای کاری/)).toHaveValue("گروه مالی آریا");
  });

  it("supports password visibility and recovery guidance", () => {
    render(<LoginPage />);
    const password = screen.getByLabelText("رمز عبور");
    expect(password).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "نمایش رمز عبور" }));
    expect(password).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: "رمز را فراموش کرده‌اید؟" }));
    expect(screen.getByText("راهنمای بازیابی رمز")).toBeInTheDocument();
    expect(screen.getByText(/بازیابی ایمیلی در نسخهٔ فعلی فعال نیست/)).toBeInTheDocument();
  });

  it("shows localized inline validation", () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("tab", { name: "ساخت حساب" }));
    fireEvent.click(screen.getByRole("button", { name: "ساخت حساب امن" }));
    expect(screen.getByText("نام و نام خانوادگی را کامل وارد کنید.")).toBeInTheDocument();
    expect(screen.getByText("ایمیل یا نام کاربری را وارد کنید.")).toBeInTheDocument();
    expect(screen.getByText("رمز عبور را وارد کنید.")).toBeInTheDocument();
  });
});
