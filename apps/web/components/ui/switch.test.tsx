import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Switch } from "./switch";

describe("Switch Component", () => {
  it("renders with default props and switch role", () => {
    render(<Switch aria-label="ارسال پیامک" />);
    const switchEl = screen.getByRole("switch", { name: "ارسال پیامک" });
    expect(switchEl).toBeDefined();
    expect(switchEl.getAttribute("aria-checked")).toBe("false");
  });

  it("applies size sm for compact table toolbars", () => {
    render(<Switch size="sm" aria-label="تطبیق سریع" />);
    const switchEl = screen.getByRole("switch");
    expect(switchEl.className).toContain("h-[18px]");
    expect(switchEl.className).toContain("w-8");
  });

  it("applies size lg for prominent settings", () => {
    render(<Switch size="lg" aria-label="پایش کلی" />);
    const switchEl = screen.getByRole("switch");
    expect(switchEl.className).toContain("h-7");
    expect(switchEl.className).toContain("w-[52px]");
  });

  it("applies variant success for operational status", () => {
    render(<Switch variant="success" checked aria-label="سامانه مودیان" />);
    const switchEl = screen.getByRole("switch");
    expect(switchEl.className).toContain("data-[state=checked]:bg-[var(--ds-success)]");
    expect(switchEl.getAttribute("aria-checked")).toBe("true");
  });

  it("supports disabled state", () => {
    render(<Switch disabled aria-label="قفل شده" />);
    const switchEl = screen.getByRole("switch");
    expect(switchEl.hasAttribute("disabled")).toBe(true);
  });
});
