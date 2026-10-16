import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { CashPeriodReport } from "./cash-period-report";
import { api } from "@/lib/product-api";
import type { Company } from "@/lib/product-types";
vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
vi.mock("recharts", () => ({ ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, LineChart: () => <div>نمودار</div>, CartesianGrid: () => null, ReferenceLine: () => null, Line: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null }));
const company = { id: "company", role: "owner" } as Company;
const cash = { opening_balance_irr: "1000", closing_balance_irr: "2000", inflows_irr: "1000", outflows_irr: "0", warnings: [], days: [
  { date: "2026-03-21", inflows_irr: "500", outflows_irr: "0", balance_irr: "1500" },
  { date: "2026-03-22", inflows_irr: "500", outflows_irr: "0", balance_irr: "2000" },
] };
beforeEach(() => {
  localStorage.clear(); window.history.replaceState(null, "", "/");
  localStorage.setItem("didban.period.v1.company", JSON.stringify({ start_date: "2026-03-21", end_date: "2026-03-22" }));
  vi.mocked(api).mockReset(); vi.mocked(api).mockImplementation(async (path) => path.includes("/report?") ? { cash } : []);
});
it("shows an overview and opens bounded daily details on demand", async () => {
  render(<CashPeriodReport company={company} />);
  fireEvent.click(await screen.findByRole("button", { name: "جزئیات روز" }));
  const drawer = screen.getByRole("dialog", { name: "جزئیات گردش روز" });
  expect(within(drawer).getByLabelText("تاریخ روز")).toHaveValue("۱۴۰۵/۰۱/۰۲");
  expect(within(drawer).getByRole("button", { name: "روز بعد" })).toBeDisabled();
  fireEvent.click(within(drawer).getByRole("button", { name: "روز قبل" }));
  expect(within(drawer).getByLabelText("تاریخ روز")).toHaveValue("۱۴۰۵/۰۱/۰۱");
  expect(within(drawer).getByLabelText("۱۵۰ تومان")).toBeInTheDocument();
  expect(within(drawer).getByRole("button", { name: "روز قبل" })).toBeDisabled();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});
it("preserves an unavailable balance instead of showing zero", async () => {
  vi.mocked(api).mockImplementation(async (path) => path.includes("/report?") ? { cash: { ...cash, opening_balance_irr: null, closing_balance_irr: null, days: cash.days.map((day) => ({ ...day, balance_irr: null })) } } : []);
  render(<CashPeriodReport company={company} />);
  expect(await screen.findByText("مانده بانکی برای این دوره ثبت نشده است.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "جزئیات روز" }));
  expect(within(screen.getByRole("dialog")).getByText("ثبت نشده")).toBeInTheDocument();
});
