import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ReceivablesWorkspace } from "./receivables-workspace";
import { api } from "@/lib/product-api";
import type { Company } from "@/lib/product-types";
vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
vi.mock("./receivables-customers", () => ({ ReceivablesCustomers: () => null }));
const company = { id: "company" } as Company;
const summary = {
  total_receivables_irr: "15000000", total_overdue_irr: "5000000", customer_count: 3,
  buckets: [{ bucket_key: "not_due", amount_irr: "7000000" }, { bucket_key: "due_date_missing", amount_irr: "3000000" }],
};
beforeEach(() => { vi.mocked(api).mockReset(); vi.mocked(api).mockResolvedValue(summary); });
it("does not include unknown due dates in the not-due amount", async () => {
  render(<ReceivablesWorkspace company={company} />);
  await screen.findByTitle("۱٬۵۰۰٬۰۰۰ تومان");
  const notDue = within(screen.getByRole("article", { name: "مطالبات سررسیدنرسیده" }));
  expect(notDue.getByTitle("۷۰۰٬۰۰۰ تومان")).toBeInTheDocument();
  expect(screen.getByTitle("۳ مشتری")).toBeInTheDocument();
  expect(vi.mocked(api).mock.calls[0][0]).toMatch(/receivables\/summary\?as_of_date=\d{4}-\d{2}-\d{2}$/);
});
it("retries failed summary requests", async () => {
  vi.mocked(api).mockRejectedValue(Error("offline"));
  render(<ReceivablesWorkspace company={company} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("اطلاعات مطالبات دریافت نشد");
  vi.mocked(api).mockResolvedValue(summary);
  fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
  expect(await screen.findByTitle("۱٬۵۰۰٬۰۰۰ تومان")).toBeInTheDocument();
});
it("removes the previous company's statistics when switching companies", async () => {
  const view = render(<ReceivablesWorkspace company={company} />);
  await screen.findByTitle("۱٬۵۰۰٬۰۰۰ تومان");
  vi.mocked(api).mockResolvedValue({ ...summary, total_receivables_irr: "25000000" });
  view.rerender(<ReceivablesWorkspace company={{ ...company, id: "other" }} />);
  await waitFor(() => expect(screen.queryByTitle("۱٬۵۰۰٬۰۰۰ تومان")).not.toBeInTheDocument());
  expect(await screen.findByTitle("۲٬۵۰۰٬۰۰۰ تومان")).toBeInTheDocument();
});
