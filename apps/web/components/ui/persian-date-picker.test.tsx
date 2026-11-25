import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { PersianDatePicker } from "./persian-date-picker";

function DatePickerHarness({
  initial = "",
  onChange = () => {},
  required = false,
  disabled = false,
  label = "تاریخ سند",
}: {
  initial?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <PersianDatePicker
      id="test-date"
      label={label}
      value={value}
      required={required}
      disabled={disabled}
      onChange={(val) => {
        setValue(val);
        onChange(val);
      }}
    />
  );
}

describe("PersianDatePicker", () => {
  it("renders with formatted Jalali date from ISO value", () => {
    render(<DatePickerHarness initial="2026-07-24" />);
    const input = screen.getByRole("textbox", { name: "تاریخ سند" }) as HTMLInputElement;
    expect(input.value).toBe("1405/05/02");
  });

  it("formats typing input automatically with slashes and calls onChange with ISO date", () => {
    const onChange = vi.fn();
    render(<DatePickerHarness initial="" onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: "تاریخ سند" }) as HTMLInputElement;

    // Typing sequentially
    fireEvent.change(input, { target: { value: "1405" } });
    expect(input.value).toBe("1405/");

    fireEvent.change(input, { target: { value: "1405/05" } });
    expect(input.value).toBe("1405/05/");

    fireEvent.change(input, { target: { value: "1405/05/02" } });
    expect(input.value).toBe("1405/05/02");
    expect(onChange).toHaveBeenLastCalledWith("2026-07-24");
  });

  it("normalizes Persian digits typed or pasted", () => {
    const onChange = vi.fn();
    render(<DatePickerHarness initial="" onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: "تاریخ سند" }) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "۱۴۰۵۰۵۰۲" } });
    expect(input.value).toBe("1405/05/02");
    expect(onChange).toHaveBeenLastCalledWith("2026-07-24");
  });

  it("handles blur: clears value if empty, or restores on invalid input", () => {
    const onChange = vi.fn();
    render(<DatePickerHarness initial="2026-07-24" onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: "تاریخ سند" }) as HTMLInputElement;

    // Clear input and blur
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(input.value).toBe("");
    expect(onChange).toHaveBeenLastCalledWith("");

    // Invalid partial text restored on blur
    fireEvent.change(input, { target: { value: "1405/1" } });
    fireEvent.blur(input);
    expect(input.value).toBe(""); // previous value was empty
  });

  it("canonicalizes single-digit month and day on blur", () => {
    const onChange = vi.fn();
    render(<DatePickerHarness initial="" onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: "تاریخ سند" }) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "1405/5/2" } });
    fireEvent.blur(input);
    expect(input.value).toBe("1405/05/02");
    expect(onChange).toHaveBeenLastCalledWith("2026-07-24");
  });

  it("toggles popover on trigger button click", () => {
    render(<DatePickerHarness initial="2026-07-24" />);
    const trigger = screen.getByRole("button", { name: /انتخاب تاریخ/ });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("toggles popover on Alt+ArrowDown or F4", () => {
    render(<DatePickerHarness initial="2026-07-24" />);
    const input = screen.getByRole("textbox", { name: "تاریخ سند" });

    fireEvent.keyDown(input, { key: "ArrowDown", altKey: true });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "F4" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("disables both input and trigger button when disabled is true", () => {
    render(<DatePickerHarness initial="2026-07-24" disabled />);
    const input = screen.getByRole("textbox", { name: "تاریخ سند" });
    const trigger = screen.getByRole("button", { name: /انتخاب تاریخ/ });

    expect(input).toBeDisabled();
    expect(trigger).toBeDisabled();
  });

  it("allows clearing date via the clear button inside popover", () => {
    const onChange = vi.fn();
    render(<DatePickerHarness initial="2026-07-24" onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: /انتخاب تاریخ/ });
    fireEvent.click(trigger);

    const clearButton = screen.getByRole("button", { name: "پاک کردن تاریخ" });
    fireEvent.click(clearButton);

    const input = screen.getByRole("textbox", { name: "تاریخ سند" }) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(onChange).toHaveBeenLastCalledWith("");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
