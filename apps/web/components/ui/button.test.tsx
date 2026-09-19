import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Button } from "./button";

describe("Button Component", () => {
  it("renders with default props", () => {
    render(<Button>تأیید عملیات</Button>);
    const btn = screen.getByRole("button", { name: "تأیید عملیات" });
    expect(btn).toBeDefined();
    expect(btn.getAttribute("disabled")).toBeNull();
  });

  it("applies the accent variant for AI and intelligence actions", () => {
    render(<Button variant="accent">تحلیل هوشمند</Button>);
    const btn = screen.getByRole("button", { name: "تحلیل هوشمند" });
    expect(btn.className).toContain("bg-[var(--ds-accent)]");
  });

  it("applies destructive-subtle variant for non-critical rejections", () => {
    render(<Button variant="destructive-subtle">رد مغایرت</Button>);
    const btn = screen.getByRole("button", { name: "رد مغایرت" });
    expect(btn.className).toContain("text-[var(--ds-danger)]");
  });

  it("applies xs size for dense accounting tables", () => {
    render(<Button size="xs">اقدام متراکم</Button>);
    const btn = screen.getByRole("button", { name: "اقدام متراکم" });
    expect(btn.className).toContain("h-7");
  });

  it("renders in loading state with accessible spinner and aria-busy", () => {
    render(
      <Button loading loadingText="در حال ذخیره...">
        ذخیره
      </Button>,
    );
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("در حال ذخیره...")).toBeDefined();
    expect(screen.getByLabelText("Loading")).toBeDefined();
  });

  it("renders disabled state properly", () => {
    render(<Button disabled>غیرفعال</Button>);
    const btn = screen.getByRole("button", { name: "غیرفعال" });
    expect(btn.hasAttribute("disabled")).toBe(true);
  });
});
