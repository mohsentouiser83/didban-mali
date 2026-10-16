import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/product-api";
import { ReceiptHistoryEditor } from "./receipt-history-editor";
vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
const history = {
  invoice_id: "invoice", invoice_no: "INV", customer_name: "مشتری", issue_date: "2026-03-01", gross_amount_irr: "10000", paid_amount_irr: "1001", complete: true, version: 3,
  receipts: [{ id: "receipt", received_on: "2026-04-01", amount_irr: "1001", reference: "ref" }],
};
beforeEach(() => { vi.mocked(api).mockReset(); vi.mocked(api).mockImplementation(async (_path, options) => options?.method === "PUT" ? [] : [history]); });
it("preserves rial precision when displaying Persian toman and requires full-history confirmation", async () => {
  const changed = vi.fn();
  render(<ReceiptHistoryEditor companyId="company" canWrite onChanged={changed} />);
  fireEvent.click(screen.getByRole("button", { name: "مشاهده و ثبت وصول‌ها" }));
  fireEvent.click(await screen.findByRole("button", { name: "INV مشتری" }));
  expect(screen.getByLabelText("مبلغ به تومان")).toHaveValue("۱۰۰٫۱");
  expect(screen.getByRole("button", { name: "ذخیره تاریخچه کامل" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: "تأیید تاریخچه کامل" }));
  fireEvent.click(screen.getByRole("button", { name: "ذخیره تاریخچه کامل" }));
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  const call = vi.mocked(api).mock.calls.find(([_path, options]) => options?.method === "PUT")!;
  expect(call[0]).toBe("/companies/company/receivables/invoices/invoice/receipt-history");
  expect(JSON.parse(String(call[1]?.body))).toEqual({ expected_version: 3, confirm_complete: true, receipts: [{ received_on: "2026-04-01", amount_irr: "1001", reference: "ref" }] });
});
it("lets a viewer inspect settled invoices without edit controls", async () => {
  render(<ReceiptHistoryEditor companyId="company" canWrite={false} onChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "مشاهده و ثبت وصول‌ها" }));
  fireEvent.click(await screen.findByRole("button", { name: "INV مشتری" }));
  expect(screen.getByLabelText("مبلغ به تومان")).toBeDisabled();
  expect(screen.queryByRole("button", { name: "ذخیره تاریخچه کامل" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "افزودن وصول" })).not.toBeInTheDocument();
});
it("prevents overpayment before submitting", async () => {
  render(<ReceiptHistoryEditor companyId="company" canWrite onChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "مشاهده و ثبت وصول‌ها" }));
  fireEvent.click(await screen.findByRole("button", { name: "INV مشتری" }));
  fireEvent.change(screen.getByLabelText("مبلغ به تومان"), { target: { value: "1001" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "تأیید تاریخچه کامل" }));
  expect(screen.getByRole("button", { name: "ذخیره تاریخچه کامل" })).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("تاریخ یا مبلغ وصول نامعتبر است.");
});
it("shows a missing imported paid total as unknown", async () => {
  vi.mocked(api).mockResolvedValue([{ ...history, paid_amount_irr: null, complete: false, receipts: [] }]);
  render(<ReceiptHistoryEditor companyId="company" canWrite onChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "مشاهده و ثبت وصول‌ها" }));
  expect(await screen.findByText("نامشخص")).toBeInTheDocument();
  expect(screen.getByText("ناقص")).toBeInTheDocument();
});
