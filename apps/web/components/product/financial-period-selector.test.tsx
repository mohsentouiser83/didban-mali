import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { FinancialPeriodSelector } from "./financial-period-selector";
import { currentRange, useFinancialRange } from "@/lib/financial-periods";
import { api } from "@/lib/product-api";
vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
const initial = { start_date: "2026-03-21", end_date: "2026-04-20" };
beforeEach(() => { vi.mocked(api).mockReset(); vi.mocked(api).mockResolvedValue([]); localStorage.clear(); window.history.replaceState(null, "", "/"); });
it("applies Persian dates and delegates period management to its own page", async () => {
  const changed = vi.fn();
  render(<FinancialPeriodSelector companyId="company" range={initial} onChange={changed} canWrite />);
  fireEvent.click(screen.getByRole("button", { name: "تغییر دوره" }));
  fireEvent.change(screen.getByLabelText("از تاریخ"), { target: { value: "۱۴۰۵/۰۱/۰۲" } });
  expect(screen.getByRole("link", { name: "مدیریت دوره‌ها" })).toHaveAttribute("href", "/companies/company/financial-periods");
  fireEvent.click(screen.getByRole("button", { name: "نمایش گزارش" }));
  expect(changed).toHaveBeenCalledWith({ ...initial, start_date: "2026-03-22" });
  expect(screen.queryByLabelText("نام دوره")).not.toBeInTheDocument();
});
it("rejects reversed ranges and hides write controls for viewers", () => {
  render(<FinancialPeriodSelector companyId="company" range={initial} onChange={vi.fn()} canWrite={false} />);
  fireEvent.click(screen.getByRole("button", { name: "تغییر دوره" }));
  fireEvent.change(screen.getByLabelText("از تاریخ"), { target: { value: "۱۴۰۵/۰۲/۰۲" } });
  expect(screen.getByRole("button", { name: "نمایش گزارش" })).toBeDisabled();
  expect(screen.queryByLabelText("نام دوره")).not.toBeInTheDocument();
});
function Selection({ companyId }: { companyId: string }) {
  const { range, setRange } = useFinancialRange(companyId);
  return <><output>{range.start_date}:{range.end_date}</output><button onClick={() => setRange(initial)}>انتخاب</button></>;
}
it("persists selection across pages, scopes it per company, and restores URL dates", async () => {
  window.history.replaceState(null, "", "/companies/company/cashflow?from=2026-05-01&to=2026-05-31");
  const view = render(<Selection companyId="company" />);
  expect(screen.getByRole("status")).toHaveTextContent("2026-05-01:2026-05-31");
  fireEvent.click(screen.getByText("انتخاب"));
  expect(window.location.search).toContain("from=2026-03-21");
  view.unmount();
  window.history.replaceState(null, "", "/companies/company/receivables");
  const next = render(<Selection companyId="company" />);
  expect(screen.getByRole("status")).toHaveTextContent("2026-03-21:2026-04-20");
  next.unmount();
  window.history.replaceState(null, "", "/companies/other/receivables");
  render(<Selection companyId="other" />);
  expect(screen.getByRole("status")).not.toHaveTextContent("2026-03-21:2026-04-20");
});

it("offers the upcoming Persian month for cashflow and applies it only on confirmation", async () => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  const changed = vi.fn();
  render(<FinancialPeriodSelector companyId="company" range={initial} onChange={changed} canWrite includeUpcomingMonth />);
  fireEvent.click(screen.getByRole("button", { name: "تغییر دوره" }));
  fireEvent.click(screen.getByRole("combobox"));
  fireEvent.click(await screen.findByRole("option", { name: "یک ماه آینده" }));
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "نمایش گزارش" }));
  expect(changed).toHaveBeenCalledWith(currentRange("upcomingMonth"));

});
