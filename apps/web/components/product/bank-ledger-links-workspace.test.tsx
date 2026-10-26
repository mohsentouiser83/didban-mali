import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { BankLedgerLinksWorkspace } from "./bank-ledger-links-workspace";
import { api } from "@/lib/product-api";
import type { Company } from "@/lib/product-types";

vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
const company = { id: "c1", role: "owner" } as Company;
let failSave = false;
beforeEach(() => {
  failSave = false;
  Element.prototype.scrollIntoView = vi.fn();
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (options?.method === "PUT") {
      if (failSave) throw new Error("ابتدا تطبیق‌های قطعی این حساب را برگشت دهید.");
      return { available: true } as never;
    }
    if (path.includes("/imports/bank-accounts")) return [{ id: "bank1", label: "بانک نمونه", account_last4: "1234" }] as never;
    return [{ account_id: "a1", code: "101", name: "حساب سفارشی", bank_account_id: null }] as never;
  });
});
async function chooseBank() {
  fireEvent.click(await screen.findByRole("button", { name: "تعیین حساب بانکی برای حساب سفارشی" }));
  fireEvent.click(screen.getByRole("combobox", { name: "حساب بانکی" }));
  fireEvent.click(await screen.findByRole("option", { name: /بانک نمونه/ }));
}
it("preserves a failed selection and explains why it cannot be saved", async () => {
  failSave = true;
  render(<BankLedgerLinksWorkspace company={company} />);
  await chooseBank();
  fireEvent.click(screen.getByRole("button", { name: "ذخیره و بررسی دوباره" }));
  expect(await screen.findByText("ابتدا تطبیق‌های قطعی این حساب را برگشت دهید.")).toBeVisible();
  expect(screen.getByRole("combobox", { name: "حساب بانکی" })).toHaveTextContent("بانک نمونه");
});
it("saves the selected correspondence and announces recalculation", async () => {
  render(<BankLedgerLinksWorkspace company={company} />);
  await chooseBank();
  fireEvent.click(screen.getByRole("button", { name: "ذخیره و بررسی دوباره" }));
  expect(await screen.findByText("ارتباط حساب ذخیره و تطبیق دوباره انجام شد.")).toBeVisible();
  await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledWith(
    "/companies/c1/bank-account-links/a1",
    { method: "PUT", body: JSON.stringify({ bank_account_id: "bank1" }) },
  ));
  expect(screen.queryByRole("combobox", { name: "حساب بانکی" })).not.toBeInTheDocument();
});
it("keeps viewer access read-only", async () => {
  render(<BankLedgerLinksWorkspace company={{ ...company, role: "viewer" }} />);
  await screen.findByText("حساب سفارشی");
  expect(screen.queryByRole("button", { name: /تعیین حساب بانکی برای/ })).not.toBeInTheDocument();
});
