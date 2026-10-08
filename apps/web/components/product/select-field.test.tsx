import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SelectField, SelectOption } from "./select-field";

it("names the visible trigger and preserves the selected value in form data", () => {
  const { container } = render(
    <form>
      <SelectField name="period" defaultValue="current" aria-label="دورهٔ تحلیل" aria-describedby="period-help">
        <SelectOption value="current">دورهٔ جاری</SelectOption>
        <SelectOption value="previous">دورهٔ قبل</SelectOption>
      </SelectField>
      <p id="period-help">دورهٔ گزارش را انتخاب کنید</p>
    </form>,
  );
  expect(screen.getByRole("combobox", { name: "دورهٔ تحلیل" })).toHaveAttribute("aria-describedby", "period-help");
  expect(new FormData(container.querySelector("form")!).get("period")).toBe("current");
});

it("blocks a disabled select and preserves its accessible error state", () => {
  render(
    <SelectField defaultValue="current" disabled isInvalid aria-label="دورهٔ تحلیل">
      <SelectOption value="current">دورهٔ جاری</SelectOption>
    </SelectField>,
  );
  const trigger = screen.getByRole("combobox", { name: "دورهٔ تحلیل" });
  expect(trigger).toBeDisabled();
  expect(trigger).toHaveAttribute("aria-invalid", "true");
});
