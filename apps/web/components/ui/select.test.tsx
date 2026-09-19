import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from "./select";

describe("Select Component", () => {
  it("renders trigger with placeholder", () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="انتخاب حساب بانکی" />
        </SelectTrigger>
      </Select>,
    );

    expect(screen.getByText("انتخاب حساب بانکی")).toBeDefined();
  });

  it("applies size variants correctly", () => {
    const { rerender } = render(
      <Select>
        <SelectTrigger size="sm">
          <SelectValue placeholder="فیلتر" />
        </SelectTrigger>
      </Select>,
    );
    expect(screen.getByRole("combobox").className).toContain("h-9");

    rerender(
      <Select>
        <SelectTrigger size="lg">
          <SelectValue placeholder="فیلتر" />
        </SelectTrigger>
      </Select>,
    );
    expect(screen.getByRole("combobox").className).toContain("h-12");
  });

  it("applies error invalid styling and aria-invalid attribute", () => {
    render(
      <Select>
        <SelectTrigger isInvalid>
          <SelectValue placeholder="خطای معین" />
        </SelectTrigger>
      </Select>,
    );

    const trigger = screen.getByRole("combobox");
    expect(trigger.getAttribute("aria-invalid")).toBe("true");
    expect(trigger.className).toContain("border-[var(--ds-danger)]");
    expect(trigger.className).toContain("bg-[var(--ds-danger-subtle)]");
  });
});
