import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Field } from "./field";
import { AmountInput, Input, Textarea } from "./input";
import { PersianDatePicker } from "./persian-date-picker";
import { Select } from "./select";
import { SearchSelect } from "./search-select";

describe("required field labels", () => {
  it.each([
    <Input key="input" required />,
    <Textarea key="textarea" required />,
    <AmountInput key="amount" required value="1" onValueChange={vi.fn()} />,
    <PersianDatePicker key="date" required value="" onChange={vi.fn()} />,
  ])("marks required controls without changing their accessible label (%#)", (control) => {
    const { container } = render(<Field id="required-field" label="عنوان">{control}</Field>);
    expect(container.querySelector("[aria-hidden='true'].text-danger")).toHaveTextContent("*");
    expect(screen.getByLabelText("عنوان", { exact: true })).toHaveAttribute("aria-required", "true");
  });

  it.each([
    <Select key="select" value="" options={[]} onValueChange={vi.fn()} />,
    <SearchSelect key="search" value="" query="" options={[]} onQueryChange={vi.fn()} onValueChange={vi.fn()} />,
  ])("exposes the requirement on custom selection controls (%#)", (control) => {
    render(<Field id="selection" label="انتخاب" required>{control}</Field>);
    expect(screen.getByRole("combobox", { name: "انتخاب" })).toHaveAttribute("aria-required", "true");
  });

  it("updates the marker when a conditional requirement changes and leaves optional controls unmarked", () => {
    const { container, rerender } = render(
      <Field id="date" label="تاریخ" required><Input /></Field>,
    );
    expect(container.querySelector(".text-danger")).toHaveTextContent("*");
    rerender(<Field id="date" label="تاریخ" required={false}><Input /></Field>);
    expect(container.querySelector(".text-danger")).toBeNull();
    expect(screen.getByLabelText("تاریخ")).not.toHaveAttribute("aria-required");
    rerender(<Field id="date" label="تاریخ"><Input /></Field>);
    expect(container.querySelector(".text-danger")).toBeNull();
  });
});
