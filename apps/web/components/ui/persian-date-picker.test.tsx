import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PersianDatePicker } from "./persian-date-picker";

function Example({ required = false }: { required?: boolean }) {
  const [value, setValue] = useState("2026-03-21");
  return <form><PersianDatePicker name="date" aria-label="تاریخ" value={value} onValueChange={setValue} required={required} /></form>;
}

describe("PersianDatePicker", () => {
  it("shows Persian dates while submitting the original ISO value", () => {
    const { container } = render(<Example />);
    const input = screen.getByRole("textbox", { name: "تاریخ" });
    expect(input).toHaveValue("۱۴۰۵/۰۱/۰۱");
    expect(container.querySelector('input[type="date"]')).toBeNull();
    fireEvent.change(input, { target: { value: "۱۴۰۵/۰۳/۳۱" } });
    expect(new FormData(container.querySelector("form")!).get("date")).toBe("2026-06-21");
    fireEvent.blur(input);
    expect(input).toHaveValue("۱۴۰۵/۰۳/۳۱");
  });

  it("rejects invalid dates instead of submitting the previous date", () => {
    const { container } = render(<Example required />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "۱۴۰۵/۰۷/۳۱" } });
    expect(input).toHaveValue("۱۴۰۵/۰۷/۳۱");
    expect(input).toBeInvalid();
    expect(screen.getByRole("alert")).toBeVisible();
    expect(new FormData(container.querySelector("form")!).get("date")).toBe("");
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toBeInvalid();
  });

  it("updates when the controlled date changes and respects disabled state", () => {
    const change = vi.fn();
    const { rerender } = render(<PersianDatePicker value="2026-03-21" onValueChange={change} disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByRole("button")).toBeDisabled();
    rerender(<PersianDatePicker value="2026-06-21" onValueChange={change} />);
    expect(screen.getByRole("textbox")).toHaveValue("۱۴۰۵/۰۳/۳۱");
  });

  it("validates date limits using ISO dates", () => {
    render(<PersianDatePicker value="2026-03-21" min="2026-03-22" onValueChange={vi.fn()} />);
    expect(screen.getByRole("textbox")).toBeInvalid();
    expect(screen.getByRole("alert")).toHaveTextContent("۱۴۰۵/۰۱/۰۲");
  });

  it("opens a Persian calendar and clears optional dates", () => {
    const { container } = render(<Example />);
    fireEvent.click(screen.getByRole("button", { name: "انتخاب تاریخ" }));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getAllByText(/فروردین/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "پاک کردن" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(new FormData(container.querySelector("form")!).get("date")).toBe("");
  });
});
