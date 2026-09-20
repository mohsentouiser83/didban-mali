import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Checkbox } from "./checkbox";

describe("Checkbox Component", () => {
  it("renders with default props", () => {
    render(<Checkbox aria-label="تایید تراکنش" />);
    const checkbox = screen.getByRole("checkbox", { name: "تایید تراکنش" });
    expect(checkbox).toBeDefined();
    expect(checkbox.getAttribute("aria-checked")).toBe("false");
  });

  it("applies size sm for high-density financial tables", () => {
    render(<Checkbox size="sm" aria-label="انتخاب سطر جدول" />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox.className).toContain("h-4");
    expect(checkbox.className).toContain("w-4");
  });

  it("applies size lg for touch interfaces", () => {
    render(<Checkbox size="lg" aria-label="انتخاب لمسی" />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox.className).toContain("h-[22px]");
  });

  it("handles isInvalid error state and aria-invalid", () => {
    render(<Checkbox isInvalid aria-label="پذیرش الزامی" />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox.getAttribute("aria-invalid")).toBe("true");
    expect(checkbox.className).toContain("border-[var(--ds-danger)]");
  });

  it("supports indeterminate checked state", () => {
    render(<Checkbox checked="indeterminate" aria-label="انتخاب گروهی" />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox.getAttribute("aria-checked")).toBe("mixed");
  });

  it("supports disabled state", () => {
    render(<Checkbox disabled aria-label="غیرفعال" />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox.hasAttribute("disabled")).toBe(true);
  });
});
