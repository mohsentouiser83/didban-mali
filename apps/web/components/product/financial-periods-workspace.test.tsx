import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/product-api";
import type { Company } from "@/lib/product-types";
import { FinancialPeriodsWorkspace } from "./financial-periods-workspace";

vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
const company: Company = { id: "company", legal_name: "شرکت", currency: "IRR", timezone: "Asia/Tehran", role: "owner", created_at: "2026-01-01" };
const period = { id: "period", name: "فروردین", start_date: "2026-03-21", end_date: "2026-04-20" };
beforeEach(() => vi.mocked(api).mockReset());
it("updates a saved period and refreshes its list", async () => {
  let saved = period;
  vi.mocked(api).mockImplementation(async (_path, options) => {
    if (options?.method === "PUT") { saved = { ...period, ...JSON.parse(options.body as string) }; return saved; }
    return [saved];
  });
  render(<FinancialPeriodsWorkspace company={company} />);
  fireEvent.click(await screen.findByRole("button", { name: "ویرایش فروردین" }));
  const drawer = screen.getByRole("dialog", { name: "ویرایش دوره" });
  fireEvent.change(within(drawer).getByLabelText("نام دوره"), { target: { value: "فروردین اصلاح‌شده" } });
  fireEvent.click(within(drawer).getByRole("button", { name: "ذخیره دوره" }));
  await screen.findByRole("button", { name: "ویرایش فروردین اصلاح‌شده" });
  expect(vi.mocked(api).mock.calls.find(([, options]) => options?.method === "PUT")).toEqual([
    "/companies/company/financial-periods/period",
    { method: "PUT", body: JSON.stringify({ name: "فروردین اصلاح‌شده", start_date: period.start_date, end_date: period.end_date }) },
  ]);
});
it("keeps failed edits open for correction", async () => {
  vi.mocked(api).mockImplementation(async (_path, options) => {
    if (options?.method === "PUT") throw new Error("نام دوره تکراری است.");
    return [period];
  });
  render(<FinancialPeriodsWorkspace company={company} />);
  fireEvent.click(await screen.findByRole("button", { name: "ویرایش فروردین" }));
  const drawer = screen.getByRole("dialog", { name: "ویرایش دوره" });
  fireEvent.click(within(drawer).getByRole("button", { name: "ذخیره دوره" }));
  expect(await within(drawer).findByRole("alert")).toHaveTextContent("نام دوره تکراری است.");
  await waitFor(() => expect(within(drawer).getByRole("button", { name: "ذخیره دوره" })).toBeEnabled());
});
it("allows viewers to read periods without write actions", async () => {
  vi.mocked(api).mockResolvedValue([period]);
  render(<FinancialPeriodsWorkspace company={{ ...company, role: "viewer" }} />);
  await screen.findByRole("rowheader", { name: "فروردین" });
  expect(screen.queryByRole("button", { name: "دوره جدید" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "ویرایش فروردین" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "حذف فروردین" })).not.toBeInTheDocument();
});
