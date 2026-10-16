import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Form, FormMessage } from "./form";
import { Input } from "./input";
import { Textarea } from "./textarea";
import { Button } from "./button";
import { FieldError } from "./field";
import { PersianDatePicker } from "./persian-date-picker";

afterEach(cleanup);

it("blocks invalid submission, links Persian messages and focuses the first invalid control", async () => {
  const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
  render(<Form onSubmit={submit}><label htmlFor="email">ایمیل</label><Input id="email" type="email" required aria-describedby="hint" /><p id="hint">ایمیل کاری</p><label htmlFor="body">توضیح</label><Textarea id="body" required /><Button type="submit">ثبت</Button></Form>);
  fireEvent.click(screen.getByRole("button", { name: "ثبت" }));
  expect(submit).not.toHaveBeenCalled();
  expect(screen.getByLabelText("ایمیل")).toHaveFocus();
  expect(screen.getByLabelText("ایمیل")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("ایمیل")).toHaveAttribute("aria-describedby", "hint email-validation");
  expect(screen.getAllByText("این فیلد را تکمیل کنید.")).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("ایمیل"), { target: { value: "person@example.com" } });
  fireEvent.change(screen.getByLabelText("توضیح"), { target: { value: "آزمون فرم" } });
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(screen.getByLabelText("ایمیل")).toHaveAttribute("aria-describedby", "hint");
  fireEvent.click(screen.getByRole("button", { name: "ثبت" }));
  expect(submit).toHaveBeenCalledTimes(1);
});

it("checks trimmed required text, optional minimum length and email format", () => {
  render(<Form><Input aria-label="نام" required defaultValue="  " /><Input aria-label="شناسه" minLength={8} defaultValue="123" /><Input aria-label="ایمیل" type="email" defaultValue="invalid" /><Button>ثبت</Button></Form>);
  fireEvent.click(screen.getByRole("button", { name: "ثبت" }));
  expect(screen.getByText("این فیلد را تکمیل کنید.")).toBeInTheDocument();
  expect(screen.getByText("حداقل ۸ نویسه وارد کنید.")).toBeInTheDocument();
  expect(screen.getByText("ایمیل معتبر وارد کنید.")).toBeInTheDocument();
});

it("preserves explicit custom form validation", () => {
  const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
  render(<Form noValidate onSubmit={submit}><Input required /><Button>ثبت</Button></Form>);
  fireEvent.click(screen.getByRole("button", { name: "ثبت" }));
  expect(submit).toHaveBeenCalledTimes(1);
});

it("blocks invalid Persian dates without duplicating their existing field message", () => {
  const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
  render(<Form onSubmit={submit}><label htmlFor="date">تاریخ</label><PersianDatePicker id="date" value="2026-03-20" min="2026-03-21" onValueChange={() => {}} required /><Button>ثبت</Button></Form>);
  fireEvent.click(screen.getByRole("button", { name: "ثبت" }));
  expect(submit).not.toHaveBeenCalled();
  expect(screen.getAllByText(/تاریخ باید از/)).toHaveLength(1);
  expect(screen.getByLabelText("تاریخ")).toHaveFocus();
});

it("does not announce empty field errors and distinguishes errors from success", () => {
  const { rerender } = render(<FieldError errors={[undefined, {}]} />);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  rerender(<><FormMessage>ذخیره انجام نشد.</FormMessage><FormMessage variant="success">ذخیره شد.</FormMessage></>);
  expect(screen.getByRole("alert")).toHaveTextContent("ذخیره انجام نشد.");
  expect(screen.getByRole("status")).toHaveTextContent("ذخیره شد.");
});
