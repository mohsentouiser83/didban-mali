import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { Field } from "./field";
import { Form } from "./form";
import { Input } from "./input";
describe("accessible form validation", () => {
  it("blocks whitespace values and focuses the field associated with its error", () => {
    const submit = vi.fn((event) => event.preventDefault());
    render(
      <Form onSubmit={submit}>
        <Field id="name" label="نام">
          <Input id="name" required defaultValue="   " />
        </Field>
        <Button type="submit">ذخیره</Button>
      </Form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));
    const input = screen.getByLabelText("نام");
    expect(submit).not.toHaveBeenCalled();
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("این مورد را وارد کنید.");
    fireEvent.input(input, { target: { value: "نام شرکت" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
it("associates server field errors and removes corrected errors while preserving helper text", () => {
  render(
    <Form fieldErrors={{ email: "این ایمیل قابل استفاده نیست." }}>
      <Field id="account-email" label="ایمیل" description="ایمیل سازمانی">
        <Input id="account-email" defaultValue="old@example.test" />
      </Field>
    </Form>,
  );
  const input = screen.getByLabelText("ایمیل");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription(
    "این ایمیل قابل استفاده نیست. ایمیل سازمانی",
  );
  fireEvent.input(input, { target: { value: "new@example.test" } });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(input).toHaveAccessibleDescription("ایمیل سازمانی");
});
