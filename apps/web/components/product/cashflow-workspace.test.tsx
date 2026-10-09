import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { CashFlowWorkspace } from "./cashflow-workspace";
import { api } from "@/lib/product-api";
vi.mock("./cash-payment-plan", () => ({ CashPaymentPlan: ({ onChanged }: { onChanged: () => void }) => <button onClick={onChanged}>تغییر برنامه پرداخت</button> }));
vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
vi.mock("./workspace-provider", () => ({ useWorkspace: () => ({ company: { id: "company" } }) }));
const summary = { cash_accounts: [{ method: "running_balance", balance_irr: "1.0000000E+7", balance_date: "2026-10-09" }] };
const forecast = { projected_inflows_30d_irr: "2000000", projected_outflows_30d_irr: "15000000", weeks: [{ payments: [{ amount_irr: "15000000" }] }] };
beforeEach(() => { vi.mocked(api).mockReset(); vi.mocked(api).mockImplementation(async (path) => path.endsWith("/summary") ? summary : forecast); });
it("shows a negative closing balance in toman using only planned payments", async () => {
  render(<CashFlowWorkspace />);
  const end = await screen.findByRole("article", { name: "مانده پس از دریافت و پرداخت" });
  await waitFor(() => expect(within(end).getByTitle("-۳۰۰٬۰۰۰ تومان")).toBeInTheDocument());
  expect(vi.mocked(api).mock.calls[1][0]).toContain("horizon_days=30&outflow_mode=planned");
  expect(within(screen.getByRole("article", { name: "مانده حساب" })).getByTitle("۱٬۰۰۰٬۰۰۰ تومان")).toBeInTheDocument();
});
it("does not treat missing payment plans as zero obligations", async () => {
  vi.mocked(api).mockImplementation(async (path) => path.endsWith("/summary") ? summary : { ...forecast, projected_outflows_30d_irr: "0", weeks: [{ payments: [] }] });
  render(<CashFlowWorkspace />);
  expect(await screen.findByText("ثبت نشده")).toBeInTheDocument();
  expect(screen.getByText("قابل محاسبه نیست")).toBeInTheDocument();
});
it("recovers from a failed request through retry", async () => {
  vi.mocked(api).mockRejectedValue(Error("offline"));
  render(<CashFlowWorkspace />);
  expect(await screen.findByRole("alert")).toHaveTextContent("اطلاعات نقدینگی دریافت نشد");
  vi.mocked(api).mockImplementation(async (path) => path.endsWith("/summary") ? summary : forecast);
  fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getByTitle("-۳۰۰٬۰۰۰ تومان")).toBeInTheDocument());
});

it("refreshes the overview after the payment plan changes", async () => {
  render(<CashFlowWorkspace />);
  await screen.findByTitle("-۳۰۰٬۰۰۰ تومان");
  vi.mocked(api).mockImplementation(async (path) => path.endsWith("/summary") ? summary : { ...forecast, projected_outflows_30d_irr: "20000000" });
  fireEvent.click(screen.getByRole("button", { name: "تغییر برنامه پرداخت" }));
  expect(await screen.findByTitle("-۸۰۰٬۰۰۰ تومان")).toBeInTheDocument();
});
