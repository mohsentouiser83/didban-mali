import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Select } from "./select";

describe("Select component", () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    window.HTMLElement.prototype.hasPointerCapture = vi.fn();
    window.HTMLElement.prototype.setPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  });

  const options = [
    { value: "manual", label: "ثبت دستی" },
    { value: "sale_service", label: "فروش خدمات" },
    { value: "purchase_service", label: "خرید خدمات" },
    { value: "payroll", label: "شناسایی حقوق" },
  ];

  it("renders trigger and does not show search input when searchable is false", () => {
    const onValueChange = vi.fn();
    render(
      <Select
        id="test-select"
        label="نوع سند"
        value="manual"
        onValueChange={onValueChange}
        options={options}
      />
    );
    expect(screen.getByRole("combobox")).toHaveTextContent("ثبت دستی");
    expect(screen.queryByPlaceholderText("جستجو...")).not.toBeInTheDocument();
  });

  it("renders search input and filters options when searchable is true", async () => {
    const onValueChange = vi.fn();
    render(
      <Select
        id="searchable-select"
        label="نوع سند"
        value=""
        onValueChange={onValueChange}
        options={options}
        searchable
        searchPlaceholder="جستجوی نوع سند..."
      />
    );

    // Press Enter or ArrowDown to open Radix Select in jsdom
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });

    const searchInput = await screen.findByPlaceholderText("جستجوی نوع سند...");
    expect(searchInput).toBeInTheDocument();

    // Type to filter
    fireEvent.change(searchInput, { target: { value: "فروش" } });
    expect(screen.getByText("فروش خدمات")).toBeInTheDocument();
    expect(screen.queryByText("خرید خدمات")).not.toBeInTheDocument();
    expect(screen.queryByText("ثبت دستی")).not.toBeInTheDocument();
  });
});
