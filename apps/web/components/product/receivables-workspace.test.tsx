import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ReceivablesWorkspace } from "./receivables-workspace";
import { api } from "@/lib/product-api";
import type { Company } from "@/lib/product-types";
import type { PeriodReport } from "@/lib/financial-periods";
vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
vi.mock("./receivables-customers", () => ({ ReceivablesCustomers: ({ asOfDate }: { asOfDate: string }) => <div>تاریخ مشتریان: {asOfDate}</div> }));
const company = { id: "company", role: "owner" } as Company;
const report = {
  start_date: "2026-03-21", end_date: "2026-04-20",
  receivables: {
    opening_balance_irr: "10000000", sales_irr: "10000000", receipts_irr: "5000000", closing_balance_irr: "15000000", overdue_irr: "5000000", history_complete: true, warnings: [], customers: [], invoices: [],
    buckets: [{ bucket_key: "not_due", label_fa: "سررسیدنرسیده", amount_irr: "7000000", invoice_count: 2 }, { bucket_key: "due_date_missing", label_fa: "سررسید نامشخص", amount_irr: "3000000", invoice_count: 1 }],
  },
} as unknown as PeriodReport;
beforeEach(() => {
  vi.mocked(api).mockReset(); localStorage.clear(); window.history.replaceState(null, "", "/");
  localStorage.setItem("didban.period.v1.company", JSON.stringify({ start_date: report.start_date, end_date: report.end_date }));
  vi.mocked(api).mockImplementation(async (path) => path.includes("/report?") ? report : []);
});
it("shows movements and end-of-period customer balances with unknown due dates separated", async () => {
  render(<ReceivablesWorkspace company={company} />);
  const closing = await screen.findByRole("article", { name: "مطالبات پایان دوره" });
  await waitFor(() => expect(within(closing).getByTitle("۱٬۵۰۰٬۰۰۰ تومان")).toBeInTheDocument());
  expect(screen.getByTitle("۷۰۰٬۰۰۰ تومان")).toBeInTheDocument();
  expect(screen.getByTitle("۳۰۰٬۰۰۰ تومان")).toBeInTheDocument();
  expect(screen.getByText("تاریخ مشتریان: 2026-04-20")).toBeInTheDocument();
  expect(vi.mocked(api).mock.calls.some(([path]) => path.endsWith("/financial-periods/report?start_date=2026-03-21&end_date=2026-04-20"))).toBe(true);
});
it("retries failed report requests", async () => {
  vi.mocked(api).mockImplementation(async (path) => { if (path.includes("/report?")) throw Error("offline"); return []; });
  render(<ReceivablesWorkspace company={company} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("اطلاعات مطالبات دریافت نشد");
  vi.mocked(api).mockImplementation(async (path) => path.includes("/report?") ? report : []);
  fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
  expect(await screen.findByTitle("۱٬۵۰۰٬۰۰۰ تومان")).toBeInTheDocument();
});
it("removes the previous company's report when switching companies", async () => {
  const view = render(<ReceivablesWorkspace company={company} />);
  await screen.findByTitle("۱٬۵۰۰٬۰۰۰ تومان");
  vi.mocked(api).mockImplementation(async (path) => path.includes("/report?") ? { ...report, receivables: { ...report.receivables, closing_balance_irr: "25000000" } } : []);
  view.rerender(<ReceivablesWorkspace company={{ ...company, id: "other" }} />);
  await waitFor(() => expect(screen.queryByTitle("۱٬۵۰۰٬۰۰۰ تومان")).not.toBeInTheDocument());
  expect(await screen.findByTitle("۲٬۵۰۰٬۰۰۰ تومان")).toBeInTheDocument();
});
it("explains incomplete history without showing guessed customer balances", async () => {
  vi.mocked(api).mockImplementation(async (path) => path.includes("/report?") ? { ...report, receivables: { ...report.receivables, opening_balance_irr: null, closing_balance_irr: null, sales_irr: null, receipts_irr: null, history_complete: false, warnings: ["تاریخچه وصول کامل نیست"], buckets: [] } } : []);
  render(<ReceivablesWorkspace company={company} />);
  expect(await screen.findByRole("status")).toHaveTextContent("تاریخچه وصول کامل نیست");
  expect(screen.queryByText(/تاریخ مشتریان/)).not.toBeInTheDocument();
  expect(screen.getAllByText("اطلاعات کافی نیست")).toHaveLength(4);
});
