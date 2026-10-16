import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/product-api";
import { SupportModal } from "./support-modal";
import { FinancialValidationModal } from "./financial-validation-modal";

vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/test" }));
afterEach(cleanup);
beforeEach(() => {
  vi.mocked(api).mockReset();
});

it("keeps support values and shows the returned operation error", async () => {
  vi.mocked(api).mockRejectedValue(new Error("درخواست ثبت نشد؛ دوباره تلاش کنید."));
  render(<SupportModal companyId="test" open onOpenChange={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("موضوع درخواست"), { target: { value: "آزمون رابط" } });
  fireEvent.change(screen.getByLabelText("شرح کامل مشکل"), { target: { value: "شرح نمونه" } });
  fireEvent.click(screen.getByRole("button", { name: "ارسال درخواست" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("درخواست ثبت نشد؛ دوباره تلاش کنید.");
  expect(screen.getByLabelText("موضوع درخواست")).toHaveValue("آزمون رابط");
  expect(screen.getByLabelText("شرح کامل مشکل")).toHaveValue("شرح نمونه");
});

it("confirms successful support submission and resets it only when dismissed", async () => {
  vi.mocked(api).mockResolvedValue({ id: "sample-ticket" });
  const close = vi.fn();
  render(<SupportModal companyId="test" open onOpenChange={close} />);
  fireEvent.change(screen.getByLabelText("موضوع درخواست"), { target: { value: "آزمون رابط" } });
  fireEvent.change(screen.getByLabelText("شرح کامل مشکل"), { target: { value: "شرح نمونه" } });
  fireEvent.click(screen.getByRole("button", { name: "ارسال درخواست" }));
  await waitFor(() => expect(screen.getByText("درخواست شما ثبت شد.")).toHaveAttribute("data-slot", "form-message"));
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /^بستن$/ }));
  expect(close).toHaveBeenCalledWith(false);
});

it("retains financial figures after a failed confirmation using mocked transport", async () => {
  vi.mocked(api).mockRejectedValue(new Error("تأیید ارقام انجام نشد."));
  render(<FinancialValidationModal companyId="test" open onOpenChange={vi.fn()} onValidated={vi.fn()} />);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "تأیید و ثبت نهایی" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("تأیید ارقام انجام نشد.");
  expect(screen.getByLabelText("موجودی نقد پایه (ریال)")).toHaveValue("15000000000");
});
