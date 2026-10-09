import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ReviewWorkspace } from "./review-workspace";
import { api } from "@/lib/product-api";
import type { Company } from "@/lib/product-types";
vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
const company = { id: "company", role: "viewer" } as Company;
const item = { id: "finding", title_fa: "مغایرت پرداخت", summary_fa: "مبلغ بانک با سند یکسان نیست.", status: "in_progress", severity: "high", assigned_to_name: "رضا", due_date: null, affected_amount_irr: "10000" };
beforeEach(() => { vi.mocked(api).mockReset(); vi.mocked(api).mockImplementation(async (path) => {
  if (String(path).endsWith("/control/overview")) return { total_count: 28, review_count: 10, follow_up_count: 12, resolved_count: 2, verified_count: 3 };
  if (String(path).endsWith("/findings/finding")) return { ...item, financial_impact_irr: "90071992547409930", evidence: [{ id: "ev", title_fa: "صورت حساب بانک", description_fa: "اختلاف در مبلغ ثبت‌شده" }] };
  return { items: [item], total_count: 28 };
}); });
it("shows only the main list and pages beyond the initial results", async () => {
  render(<ReviewWorkspace company={company} />);
  await screen.findByRole("button", { name: "مغایرت پرداخت" });
  expect(screen.queryByRole("region", { name: "آمار بررسی و پیگیری" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("table")).toHaveLength(1);
  expect(vi.mocked(api).mock.calls.some(([path]) => String(path).includes("/control/overview"))).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "بعدی" }));
  await waitFor(() => expect(vi.mocked(api).mock.calls.some(([path]) => String(path).includes("offset=25"))).toBe(true));
  expect(screen.queryByRole("button", { name: "بررسی دوباره" })).not.toBeInTheDocument();
});
it("searches the server rather than only filtering the loaded page", async () => {
  render(<ReviewWorkspace company={company} />);
  await screen.findByRole("button", { name: "مغایرت پرداخت" });
  fireEvent.change(screen.getByRole("textbox", { name: "جستجوی مورد" }), { target: { value: "بانک" } });
  await waitFor(() => expect(vi.mocked(api).mock.calls.some(([path]) => String(path).includes("search="))).toBe(true));
});
it("opens evidence in the shared drawer and retains access to the full case", async () => {
  render(<ReviewWorkspace company={company} />);
  fireEvent.click(await screen.findByRole("button", { name: "مغایرت پرداخت" }));
  const drawer = within(screen.getByRole("dialog", { name: "مغایرت پرداخت" }));
  expect(await drawer.findByText("صورت حساب بانک")).toBeInTheDocument();
  expect(drawer.getByTitle("۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳ تومان")).toBeInTheDocument();
  expect(drawer.getByRole("link", { name: "باز کردن پرونده و ثبت پیگیری" })).toHaveAttribute("href", "/companies/company/findings/finding");
  fireEvent.click(drawer.getByRole("button", { name: "بستن" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("clears previous company data", async () => {
  const view = render(<ReviewWorkspace company={company} />);
  await screen.findByRole("button", { name: "مغایرت پرداخت" });
  vi.mocked(api).mockImplementation(() => new Promise(() => {}));
  view.rerender(<ReviewWorkspace company={{ ...company, id: "other" }} />);
  expect(screen.queryByRole("button", { name: "مغایرت پرداخت" })).not.toBeInTheDocument();
});
