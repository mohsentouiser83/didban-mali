import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { PayablesWorkspace } from "./payables-workspace";
import { api } from "@/lib/product-api";
import type { Company } from "@/lib/product-types";
vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
vi.mock("./payables-vendors", () => ({ PayablesVendors: () => null }));
const company = { id: "company" } as Company;
const summary = {
  total_payables_irr: "15000000", as_of_date: "2026-10-09", total_overdue_irr: "5000000", vendor_count: 3,
  buckets: [{ bucket_key: "not_due", amount_irr: "10000000" }, { bucket_key: "due_date_missing", amount_irr: "3000000" }],
};
beforeEach(() => { vi.mocked(api).mockReset(); vi.mocked(api).mockResolvedValue(summary); });
it("keeps the three amount cards reconciled after debit entries", async () => {
  render(<PayablesWorkspace company={company} />);
  await screen.findByTitle("۱٬۵۰۰٬۰۰۰ تومان");
  const notDue = within(screen.getByRole("article", { name: "بدهی‌های سررسیدنرسیده" }));
  expect(notDue.getByTitle("۱٬۰۰۰٬۰۰۰ تومان")).toBeInTheDocument();
  expect(screen.getByTitle("۳ تأمین‌کننده")).toBeInTheDocument();
  expect(vi.mocked(api).mock.calls[0][0]).toMatch(/payables\/summary\?as_of_date=\d{4}-\d{2}-\d{2}$/);
});
it("retries failed summary requests", async () => {
  vi.mocked(api).mockRejectedValue(Error("offline"));
  render(<PayablesWorkspace company={company} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("اطلاعات بدهی‌ها دریافت نشد");
  vi.mocked(api).mockResolvedValue(summary);
  fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
  expect(await screen.findByTitle("۱٬۵۰۰٬۰۰۰ تومان")).toBeInTheDocument();
});
it("removes the previous company's statistics when switching companies", async () => {
  const view = render(<PayablesWorkspace company={company} />);
  await screen.findByTitle("۱٬۵۰۰٬۰۰۰ تومان");
  vi.mocked(api).mockResolvedValue({ ...summary, total_payables_irr: "25000000" });
  view.rerender(<PayablesWorkspace company={{ ...company, id: "other" }} />);
  await waitFor(() => expect(screen.queryByTitle("۱٬۵۰۰٬۰۰۰ تومان")).not.toBeInTheDocument());
  expect(await screen.findByTitle("۲٬۵۰۰٬۰۰۰ تومان")).toBeInTheDocument();
});
