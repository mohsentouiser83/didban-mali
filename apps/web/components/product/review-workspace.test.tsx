import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ReviewWorkspace } from "./review-workspace";
import { api } from "@/lib/product-api";
import type { Company } from "@/lib/product-types";
vi.mock("@/lib/product-api", () => ({ api: vi.fn(), API_URL: "/api/v1" }));
const company = { id: "company", role: "viewer" } as Company;
const item = { id: "finding", title_fa: "مغایرت پرداخت", summary_fa: "مبلغ بانک با سند یکسان نیست.", status: "in_progress", severity: "high", assigned_to_name: "رضا", due_date: null, affected_amount_irr: "10000" };
beforeEach(() => { vi.mocked(api).mockReset(); vi.mocked(api).mockImplementation(async (path) => {
  if (String(path).endsWith("/control/overview")) return { reconciliation_counts: { all: 28, matched: 0, suggested: 10, missing_accounting: 12, missing_bank: 6 }, total_count: 28, review_count: 10, follow_up_count: 12, resolved_count: 2, verified_count: 3 };
  if (String(path).endsWith("/findings/finding")) return { ...item, financial_impact_irr: "90071992547409930", evidence: [{ id: "ev", title_fa: "صورت حساب بانک", description_fa: "اختلاف در مبلغ ثبت‌شده" }] };
  return { items: [item], total_count: 28 };
}); });
it("shows company statistics and pages beyond the initial results", async () => {
  render(<ReviewWorkspace company={company} />);
  await screen.findByRole("button", { name: "مغایرت پرداخت" });
  const stats = within(screen.getByRole("region", { name: "آمار بررسی و پیگیری" }));
  expect(await stats.findByLabelText("۲۸ ردیف")).toBeInTheDocument();
  expect(stats.getByLabelText("۱۰ ردیف")).toBeInTheDocument();
  expect(stats.getByLabelText("۱۸ ردیف")).toBeInTheDocument();
  expect(stats.getByLabelText("۰ ردیف")).toBeInTheDocument();
  expect(screen.getAllByRole("table")).toHaveLength(1);
  expect(vi.mocked(api).mock.calls.some(([path]) => String(path).includes("/control/overview"))).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "صفحه بعد" }));
  await waitFor(() => expect(vi.mocked(api).mock.calls.some(([path]) => String(path).includes("offset=25"))).toBe(true));
  expect(screen.queryByRole("button", { name: "بررسی دوباره" })).not.toBeInTheDocument();
});
it("searches the server rather than only filtering the loaded page", async () => {
  render(<ReviewWorkspace company={company} />);
  await screen.findByRole("button", { name: "مغایرت پرداخت" });
  fireEvent.change(screen.getByRole("textbox", { name: "جستجوی مورد" }), { target: { value: "بانک" } });
  await waitFor(() => expect(vi.mocked(api).mock.calls.some(([path]) => String(path).includes("search="))).toBe(true));
});
it("opens evidence in the shared drawer without a deleted case destination", async () => {
  render(<ReviewWorkspace company={company} />);
  fireEvent.click(await screen.findByRole("button", { name: "مغایرت پرداخت" }));
  const drawer = within(screen.getByRole("dialog", { name: "مغایرت پرداخت" }));
  expect(await drawer.findByLabelText("۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳ تومان")).toBeInTheDocument();
  expect(drawer.queryByText("صورت حساب بانک")).not.toBeInTheDocument();
  expect(drawer.getByLabelText("۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳ تومان")).toBeInTheDocument();
  expect(drawer.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.queryByText("موعد پیگیری")).not.toBeInTheDocument();
  expect(drawer.getByText(item.summary_fa)).toBeVisible();
  expect(screen.getByRole("dialog").querySelector("[aria-expanded]")).toBeNull();
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


it("preserves zero impact and keeps unassigned metadata out of the summary", async () => {
  vi.mocked(api).mockImplementation(async (path) => String(path).endsWith("/findings/finding")
    ? { ...item, financial_impact_irr: "0", assigned_to_name: null, evidence: [] }
    : String(path).endsWith("/control/overview")
      ? { total_count: 1, review_count: 1, follow_up_count: 0, resolved_count: 0, verified_count: 0 }
      : { items: [item], total_count: 1 });
  render(<ReviewWorkspace company={company} />);
  fireEvent.click(await screen.findByRole("button", { name: "مغایرت پرداخت" }));
  const drawer = within(screen.getByRole("dialog"));
  expect(await drawer.findByLabelText("۰ تومان")).toBeInTheDocument();
  expect(drawer.queryByText("مسئول پیگیری")).not.toBeInTheDocument();
  expect(drawer.queryByRole("region", { name: "شواهد و اسناد منبع" })).not.toBeInTheDocument();
  expect(drawer.queryByText("مقادیر ردیف منبع")).not.toBeInTheDocument();
});

it("filters all server results by missing side, retains counts and resets pagination", async () => {
  vi.mocked(api).mockImplementation(async (path) => String(path).endsWith("/control/overview")
    ? { total_count: 28, review_count: 10, follow_up_count: 12, resolved_count: 3, verified_count: 2 }
    : { items: [item], total_count: String(path).includes("reconciliation_filter=missing_bank") ? 12 : 28, direction_counts: { all: 28, suggested: 0, missing_accounting: 16, missing_bank: 12 } });
  render(<ReviewWorkspace company={company} />);
  await screen.findByRole("button", { name: "مغایرت پرداخت" });
  const filters = within(screen.getByRole("group", { name: "نتیجه بررسی تطبیق" }));
  const missingBank = filters.getByRole("button", { name: "حسابداری؛ بدون پیشنهاد، ۱۲ ردیف" });
  expect(filters.getByRole("button", { name: "بانک؛ بدون پیشنهاد، ۱۶ ردیف" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "صفحه بعد" }));
  await waitFor(() => expect(vi.mocked(api).mock.calls.some(([path]) => String(path).includes("offset=25"))).toBe(true));
  fireEvent.click(missingBank);
  await waitFor(() => expect(vi.mocked(api).mock.lastCall?.[0]).toContain("reconciliation_filter=missing_bank"));
  expect(String(vi.mocked(api).mock.lastCall?.[0])).toContain("offset=0");
  await waitFor(() => expect(filters.getByRole("button", { name: "حسابداری؛ بدون پیشنهاد، ۱۲ ردیف" })).toHaveAttribute("aria-pressed", "true"));
  expect(filters.getByRole("button", { name: "بانک؛ بدون پیشنهاد، ۱۶ ردیف" })).toBeInTheDocument();
  fireEvent.click(filters.getByRole("button", { name: "همه موارد، ۲۸ ردیف" }));
  await waitFor(() => expect(String(vi.mocked(api).mock.lastCall?.[0])).not.toContain("reconciliation_filter"));
});

it("separates suggested source rows and exposes unconfirmed proposal evidence", async () => {
  vi.mocked(api).mockImplementation(async (path) => {
    if (String(path).endsWith("/control/overview")) return { total_count: 4, review_count: 4, follow_up_count: 0, resolved_count: 0, verified_count: 0 };
    if (String(path).endsWith("/findings/finding")) return { ...item, financial_impact_irr: "10000", reconciliation_state: "suggested", evidence: [], proposals: [
      { id: "proposal-1", score: "85", match_type: "one_to_one", payload: { bank: { amount_irr: "10000", date: "2026-09-12" }, accounting: { amount_irr: "10000", reference: "JV-2" } } },
      { id: "proposal-2", score: "82", match_type: "one_to_one", payload: { accounting: { amount_irr: "10000", reference: "JV-3" } } },
    ] };
    return { items: [{ ...item, reconciliation_state: "suggested" }], total_count: 1, direction_counts: { all: 4, suggested: 1, missing_accounting: 2, missing_bank: 1 } };
  });
  render(<ReviewWorkspace company={company} />);
  const filter = await screen.findByRole("button", { name: "دارای پیشنهاد تطبیق، ۱ ردیف" });
  fireEvent.click(filter);
  await waitFor(() => expect(String(vi.mocked(api).mock.lastCall?.[0])).toContain("reconciliation_filter=suggested"));
  fireEvent.click(await screen.findByRole("button", { name: "مغایرت پرداخت" }));
  const drawer = within(screen.getByRole("dialog"));
  expect(await drawer.findByRole("heading", { name: /پیشنهادهای تطبیق/ })).toBeInTheDocument();
  expect(drawer.getByText("JV-2")).toBeVisible();
  expect(drawer.getByText("JV-3")).toBeVisible();
});

it("refreshes all counters and the selected title after a proposal decision", async () => {
  let confirmed = false;
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (options?.method === "POST") { confirmed = true; return { status: "confirmed" }; }
    if (String(path).endsWith("/control/overview")) return { reconciliation_counts: confirmed ? { all: 2, suggested: 0, matched: 2, missing_accounting: 0, missing_bank: 0 } : { all: 2, suggested: 2, matched: 0, missing_accounting: 0, missing_bank: 0 } };
    const row = { ...item, title_fa: confirmed ? "تطبیق تأییدشده" : "پیشنهاد پرداخت", reconciliation_state: confirmed ? "matched" : "suggested" };
    if (String(path).endsWith("/findings/finding")) return { ...row, financial_impact_irr: "10000", can_review_proposals: true, evidence: [], proposals: confirmed ? [] : [{ id: "proposal", score: "85", match_type: "one_to_one", payload: { bank: { amount_irr: "10000" }, accounting: { amount_irr: "10000" } } }] };
    return { items: [row], total_count: 1, direction_counts: { all: 1, suggested: confirmed ? 0 : 1, matched: confirmed ? 1 : 0, missing_accounting: 0, missing_bank: 0 } };
  });
  render(<ReviewWorkspace company={{ ...company, role: "owner" }} />);
  fireEvent.click(await screen.findByRole("button", { name: "پیشنهاد پرداخت" }));
  fireEvent.click(await screen.findByRole("button", { name: "تأیید تطبیق پیشنهاد ۱" }));
  expect(await screen.findByRole("dialog", { name: "تطبیق تأییدشده" })).toBeInTheDocument();
  expect(vi.mocked(api).mock.calls.filter(([path]) => String(path).endsWith("/control/overview")).length).toBeGreaterThan(1);
  fireEvent.click(screen.getByRole("button", { name: "بستن" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "موارد قابل بررسی" })).toHaveFocus());
  const stats = within(screen.getByRole("region", { name: "آمار بررسی و پیگیری" }));
  expect(await within(stats.getByRole("article", { name: "تطبیق تأییدشده" })).findByLabelText("۲ ردیف")).toBeInTheDocument();
});
