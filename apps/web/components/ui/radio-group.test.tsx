import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { RadioGroup, RadioGroupItem, RadioCard } from "./radio-group";

describe("RadioGroup Component", () => {
  it("renders with default props and radiogroup role", () => {
    render(
      <RadioGroup defaultValue="monthly" aria-label="دوره گزارش">
        <RadioGroupItem value="monthly" id="r1" aria-label="ماهانه" />
        <RadioGroupItem value="yearly" id="r2" aria-label="سالانه" />
      </RadioGroup>
    );
    const group = screen.getByRole("radiogroup", { name: "دوره گزارش" });
    expect(group).toBeDefined();
    const checkedRadio = screen.getByRole("radio", { name: "ماهانه" });
    expect(checkedRadio.getAttribute("aria-checked")).toBe("true");
  });

  it("applies size sm and lg to RadioGroupItem", () => {
    render(
      <RadioGroup defaultValue="1">
        <RadioGroupItem value="1" size="sm" aria-label="کوچک" />
        <RadioGroupItem value="2" size="lg" aria-label="بزرگ" />
      </RadioGroup>
    );
    const smRadio = screen.getByRole("radio", { name: "کوچک" });
    const lgRadio = screen.getByRole("radio", { name: "بزرگ" });
    expect(smRadio.className).toContain("h-4");
    expect(lgRadio.className).toContain("h-[22px]");
  });

  it("handles isInvalid state with aria-invalid", () => {
    render(
      <RadioGroup>
        <RadioGroupItem value="opt" isInvalid aria-label="خطادار" />
      </RadioGroup>
    );
    const radio = screen.getByRole("radio", { name: "خطادار" });
    expect(radio.getAttribute("aria-invalid")).toBe("true");
    expect(radio.className).toContain("border-[var(--ds-danger)]");
  });

  it("renders RadioCard container properly with selected state", () => {
    const { container } = render(
      <RadioCard selected>
        <span>کارت انتخاب</span>
      </RadioCard>
    );
    const card = container.firstChild as HTMLElement;
    expect(card.getAttribute("data-selected")).toBe("true");
    expect(card.className).toContain("border-[var(--ds-primary)]");
  });
});
