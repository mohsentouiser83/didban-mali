import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { CashPaymentPlan } from "./cash-payment-plan";
import { api } from "@/lib/product-api";
import type { Company } from "@/lib/product-types";
vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
vi.mock("@/components/ui/persian-date-picker", () => ({ PersianDatePicker: ({ id, value, onValueChange }: { id: string; value: string; onValueChange: (date: string) => void }) => <input id={id} value={value} onChange={(event) => onValueChange(event.target.value)} /> }));
const company = { id: "company", role: "owner" } as Company;
beforeEach(() => { vi.mocked(api).mockReset(); vi.mocked(api).mockResolvedValue([]); });
it.each(["2026-10-31", "2026-12-31"])("saves payment on %s with an exact rial amount", async (paymentDate) => {
  const changed = vi.fn();
  render(<CashPaymentPlan company={company} asOfDate="2026-10-09" onChanged={changed} />);
  fireEvent.click(screen.getByRole("button", { name: "افزودن پرداخت" }));
  await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  fireEvent.change(screen.getByLabelText("عنوان پرداخت"), { target: { value: "حقوق" } });
  fireEvent.change(screen.getByLabelText("موعد پرداخت"), { target: { value: paymentDate } });
  fireEvent.change(screen.getByLabelText("مبلغ به تومان"), { target: { value: "۹۰۰٬۷۱۹٬۹۲۵٬۴۷۴٬۰۹۹٬۳" } });
  fireEvent.click(screen.getByRole("button", { name: "ثبت پرداخت" }));
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  const post = vi.mocked(api).mock.calls.find(([, options]) => options?.method === "POST");
  expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ title: "حقوق", payment_date: paymentDate, amount_irr: "90071992547409930" });
});
it("keeps payment planning read-only for viewers", async () => {
  render(<CashPaymentPlan company={{ ...company, role: "viewer" }} asOfDate="2026-10-09" onChanged={vi.fn()} />);
  await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "افزودن پرداخت" })).not.toBeInTheDocument();
});
it("keeps the entered payment when saving fails", async () => {
  vi.mocked(api).mockImplementation(async (_path, options) => { if (options?.method === "POST") throw Error("offline"); return []; });
  render(<CashPaymentPlan company={company} asOfDate="2026-10-09" onChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "افزودن پرداخت" }));
  await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  fireEvent.change(screen.getByLabelText("عنوان پرداخت"), { target: { value: "اجاره" } });
  fireEvent.change(screen.getByLabelText("موعد پرداخت"), { target: { value: "2026-10-31" } });
  fireEvent.change(screen.getByLabelText("مبلغ به تومان"), { target: { value: "100" } });
  fireEvent.click(screen.getByRole("button", { name: "ثبت پرداخت" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("پرداخت ثبت نشد");
  expect(screen.getByLabelText("عنوان پرداخت")).toHaveValue("اجاره");
});

it("lists only payments within the same 30-day window used by the cards", async () => {
  vi.mocked(api).mockResolvedValue([
    { id: "inside", title: "حقوق مهر", category: "payroll", payment_date: "2026-10-31", amount_irr: "1000000" },
    { id: "past", title: "حقوق قبل", category: "payroll", payment_date: "2026-10-08", amount_irr: "1000000" },
    { id: "future", title: "حقوق بعد", category: "payroll", payment_date: "2026-11-08", amount_irr: "1000000" },
  ]);
  render(<CashPaymentPlan company={company} asOfDate="2026-10-09" onChanged={vi.fn()} />);
  expect(await screen.findByText("حقوق مهر")).toBeInTheDocument();
  expect(screen.queryByText("حقوق قبل")).not.toBeInTheDocument();
  expect(screen.queryByText("حقوق بعد")).not.toBeInTheDocument();
});
