import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { DashboardWorkspace } from "./dashboard-workspace";
import { api } from "@/lib/product-api";
import type { Company } from "@/lib/product-types";
vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
vi.mock("./dashboard-cash-chart", () => ({ DashboardCashChart: ({ points, hasPayments }: { points: { balance: string }[]; hasPayments: boolean }) => <div data-testid="forecast">{points.length} روز؛ مانده آخر {points[29].balance}؛ برنامه {String(hasPayments)}</div> }));
const company = { id: "company" } as Company;
const cash = { cash_accounts: [{ method: "running_balance", balance_irr: "1000" }] };
const forecast = { as_of_date: "2026-10-09", projected_outflows_30d_irr: "1500", weeks: [{ receipts: [{ due_date: "2026-10-10", amount_irr: "300" }], payments: [{ source_id: "payment", title: "اجاره", due_date: "2026-10-11", amount_irr: "1500" }] }] };
function respond(path: string) {
  if (path.includes("cashflow/summary")) return cash;
  if (path.includes("cashflow/forecast")) return forecast;
  if (path.includes("receivables/summary")) return { total_overdue_irr: "5000" };
  if (path.includes("payables/summary")) return { total_overdue_irr: "2000" };
  if (path.includes("receivables/customers")) return { items: [{ counterparty_id: "c", name: "کیان", overdue_amount_irr: "5000" }] };
  if (path.includes("payables/vendors")) return { items: [] };
  return { items: [] };
}
beforeEach(() => { vi.mocked(api).mockReset(); vi.mocked(api).mockImplementation(async (path) => respond(String(path))); });
it("shows four shared statistics and a daily forecast based on the reported bank balance", async () => {
  render(<DashboardWorkspace company={company} />);
  expect(await screen.findByTestId("forecast")).toHaveTextContent("30 روز؛ مانده آخر -20");
  expect(within(screen.getByRole("article", { name: "مانده حساب" })).getByTitle("۱۰۰ تومان")).toBeInTheDocument();
  expect(within(screen.getByRole("article", { name: "پرداخت‌های ۳۰ روز آینده" })).getByTitle("۱۵۰ تومان")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /اجاره/ })).toHaveAttribute("href", "/companies/company/cashflow");
  expect(screen.getByRole("link", { name: /کیان/ })).toHaveAttribute("href", "/companies/company/receivables");
  expect(vi.mocked(api).mock.calls.filter(([path]) => !String(path).includes("/findings?")).every(([path]) => String(path).includes("as_of_date="))).toBe(true);
});
it("does not present an absent payment plan as zero obligations", async () => {
  vi.mocked(api).mockImplementation(async (path) => String(path).includes("cashflow/forecast") ? { ...forecast, weeks: [{ receipts: [], payments: [] }] } : respond(String(path)));
  render(<DashboardWorkspace company={company} />);
  await screen.findByTestId("forecast");
  expect(within(screen.getByRole("article", { name: "پرداخت‌های ۳۰ روز آینده" })).getByText("ثبت نشده")).toBeInTheDocument();
  expect(screen.getByTestId("forecast")).toHaveTextContent("برنامه false");
});
it("retains available summaries when the forecast request fails and allows retry", async () => {
  vi.mocked(api).mockImplementation(async (path) => { if (String(path).includes("cashflow/forecast")) throw Error("offline"); return respond(String(path)); });
  render(<DashboardWorkspace company={company} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("پیش‌بینی");
  expect(within(screen.getByRole("article", { name: "مطالبات سررسیدگذشته" })).getByTitle("۵۰۰ تومان")).toBeInTheDocument();
  vi.mocked(api).mockImplementation(async (path) => respond(String(path)));
  fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
  await screen.findByTestId("forecast");
});
it("requires a single reported account and clears company-specific data on navigation", async () => {
  vi.mocked(api).mockImplementation(async (path) => String(path).includes("cashflow/summary") ? { cash_accounts: [{ method: "transaction_sum", balance_irr: "1000" }] } : respond(String(path)));
  const view = render(<DashboardWorkspace company={company} />);
  expect(await screen.findByText("برای نمایش نمودار، مانده ثبت‌شده یک حساب بانکی لازم است.")).toBeInTheDocument();
  expect(screen.queryByTestId("forecast")).not.toBeInTheDocument();
  vi.mocked(api).mockImplementation(() => new Promise(() => {}));
  view.rerender(<DashboardWorkspace company={{ ...company, id: "other" }} />);
  expect(screen.queryByRole("link", { name: /کیان/ })).not.toBeInTheDocument();
});
