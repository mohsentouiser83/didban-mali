import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ReceivablesCustomers } from "./receivables-customers";
import { api } from "@/lib/product-api";
vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
const customers = [
  { counterparty_id: "a", name: "شرکت کیان", total_outstanding_irr: "90071992547409930", overdue_amount_irr: "1000", avg_delay_days: 5 },
  { counterparty_id: "b", name: "شرکت بهار", total_outstanding_irr: "20000", overdue_amount_irr: "10000", avg_delay_days: 10 },
  { counterparty_id: "c", name: "شرکت سپید", total_outstanding_irr: "5000", overdue_amount_irr: "0", avg_delay_days: 0 },
];
const invoices = [
  { id: "1", counterparty_id: "a", invoice_no: "INV-1", remaining_amount_irr: "1000", due_date: "2026-09-20", delay_days: 19 },
  { id: "2", counterparty_id: "a", invoice_no: "INV-2", remaining_amount_irr: "3000", due_date: null, delay_days: 0 },
  { id: "3", counterparty_id: "b", invoice_no: "OTHER", remaining_amount_irr: "10000", due_date: "2026-09-30", delay_days: 9 },
  { id: "4", counterparty_id: "a", invoice_no: "PAID", remaining_amount_irr: "0", due_date: "2025-01-01", delay_days: 600 },
];
beforeEach(() => { vi.mocked(api).mockReset(); vi.mocked(api).mockImplementation(async (path) => ({ items: String(path).includes("/customers?") ? customers : invoices })); });
it("sorts by overdue amount and calculates maximum delay from unpaid invoices", async () => {
  render(<ReceivablesCustomers companyId="company" asOfDate="2026-10-09" />);
  await screen.findByRole("button", { name: "شرکت کیان" });
  const rows = screen.getAllByRole("row");
  expect(rows[1]).toHaveTextContent("شرکت بهار");
  expect(rows[2]).toHaveTextContent("۱۹ روز");
  expect(screen.getByTitle("۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳ تومان")).toBeInTheDocument();
  expect(vi.mocked(api).mock.calls.every(([path]) => String(path).endsWith("as_of_date=2026-10-09"))).toBe(true);
});
it("searches Persian variants and filters overdue customers", async () => {
  render(<ReceivablesCustomers companyId="company" asOfDate="2026-10-09" />);
  await screen.findByRole("button", { name: "شرکت کیان" });
  fireEvent.change(screen.getByRole("textbox", { name: "جستجوی مشتری" }), { target: { value: "كيان" } });
  expect(screen.getByRole("button", { name: "شرکت کیان" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "شرکت بهار" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "سررسیدگذشته" }));
  expect(screen.queryByRole("button", { name: "شرکت سپید" })).not.toBeInTheDocument();
});
it("opens only the selected customer's unpaid invoices and closes the drawer", async () => {
  render(<ReceivablesCustomers companyId="company" asOfDate="2026-10-09" />);
  fireEvent.click(await screen.findByRole("button", { name: "شرکت کیان" }));
  const drawer = within(screen.getByRole("dialog", { name: "شرکت کیان" }));
  expect(drawer.getByText("فاکتور INV-۱")).toBeInTheDocument();
  expect(drawer.getByText("سررسید نامشخص")).toBeInTheDocument();
  expect(drawer.queryByText(/OTHER|PAID/)).not.toBeInTheDocument();
  fireEvent.click(drawer.getByRole("button", { name: "بستن" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("recovers from a failed request", async () => {
  vi.mocked(api).mockRejectedValueOnce(Error("offline"));
  render(<ReceivablesCustomers companyId="company" asOfDate="2026-10-09" />);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
  expect(await screen.findByRole("button", { name: "شرکت کیان" })).toBeInTheDocument();
});
