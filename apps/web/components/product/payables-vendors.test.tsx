import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { PayablesVendors } from "./payables-vendors";
import { api } from "@/lib/product-api";
vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
const vendors = [
  { counterparty_id: "a", name: "شرکت کیان", total_payable_irr: "90071992547409930", overdue_amount_irr: "1000", avg_delay_days: 5 },
  { counterparty_id: "b", name: "شرکت بهار", total_payable_irr: "20000", overdue_amount_irr: "10000", avg_delay_days: 10 },
  { counterparty_id: "c", name: "شرکت سپید", total_payable_irr: "5000", overdue_amount_irr: "0", avg_delay_days: 0 },
];
const entries = [
  { id: "1", entry_number: "J-1", description: "خرید مواد", credit_irr: "10000", debit_irr: "0", entry_date: "2026-09-01", estimated_due_date: "2026-10-16" },
  { id: "2", entry_number: "J-2", description: "پرداخت", credit_irr: "0", debit_irr: "3000", entry_date: "2026-09-05", estimated_due_date: null },
];
beforeEach(() => { vi.mocked(api).mockReset(); vi.mocked(api).mockImplementation(async (path) => ({ items: String(path).includes("/entries?") ? entries : vendors })); });
it("sorts by overdue amount without losing monetary precision", async () => {
  render(<PayablesVendors companyId="company" asOfDate="2026-10-09" />);
  await screen.findByRole("button", { name: "شرکت کیان" });
  expect(screen.getAllByRole("row")[1]).toHaveTextContent("شرکت بهار");
  expect(screen.getByTitle("۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳ تومان")).toBeInTheDocument();
});
it("searches Persian names and filters overdue vendors", async () => {
  render(<PayablesVendors companyId="company" asOfDate="2026-10-09" />);
  await screen.findByRole("button", { name: "شرکت کیان" });
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "كيان" } });
  expect(screen.queryByRole("button", { name: "شرکت بهار" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "سررسیدگذشته" }));
  expect(screen.queryByRole("button", { name: "شرکت سپید" })).not.toBeInTheDocument();
});
it("loads only the selected vendor's accounting entries with estimated due dates", async () => {
  render(<PayablesVendors companyId="company" asOfDate="2026-10-09" />);
  fireEvent.click(await screen.findByRole("button", { name: "شرکت کیان" }));
  const drawer = within(screen.getByRole("dialog", { name: "شرکت کیان" }));
  expect(await drawer.findByText("سند J-۱")).toBeInTheDocument();
  expect(drawer.getByText("افزایش بدهی")).toBeInTheDocument();
  expect(drawer.getByText("کاهش بدهی")).toBeInTheDocument();
  expect(drawer.getAllByText("سررسید تخمینی")).toHaveLength(1);
  expect(vi.mocked(api).mock.calls[1][0]).toBe("/companies/company/payables/vendors/a/entries?as_of_date=2026-10-09");
  fireEvent.click(drawer.getByRole("button", { name: "بستن" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("retries a failed entry request without closing the drawer", async () => {
  vi.mocked(api).mockImplementation(async (path) => { if (String(path).includes("/entries?")) throw Error("offline"); return { items: vendors }; });
  render(<PayablesVendors companyId="company" asOfDate="2026-10-09" />);
  fireEvent.click(await screen.findByRole("button", { name: "شرکت کیان" }));
  await screen.findByText("اسناد دریافت نشد.");
  vi.mocked(api).mockResolvedValue({ items: entries });
  fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
  expect(await screen.findByText("سند J-۱")).toBeInTheDocument();
});
