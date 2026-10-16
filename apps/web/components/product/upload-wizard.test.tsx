import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { UploadWizard } from "./upload-wizard";
import { api } from "@/lib/product-api";
import type { Company, ImportBatch, ImportPreview } from "@/lib/product-types";
vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
const company = { id: "company", role: "owner" } as Company;
const batch = { id: "batch", source_kind: "bank", source_label: "بانک", original_name: "bank.csv", scan_status: "clean", status: "awaiting_mapping", stage: "mapping_required" } as ImportBatch;
const preview: ImportPreview = { sheets: ["CSV"], selected_sheet: "CSV", header_row: 1, columns: ["date", "amount", "memo"], column_fingerprint: "abc", rows: [], required_fields: ["booking_date", "description"], alternative_required_fields: [["amount_signed"], ["deposit_amount", "withdrawal_amount"]], suggestions: [
  { target_field: "booking_date", source_column: "date", confidence: 1, reason: "" },
  { target_field: "description", source_column: "memo", confidence: 1, reason: "" },
  { target_field: "amount_signed", source_column: "amount", confidence: 1, reason: "" },
], mapping: null, matching_profile_id: null };
beforeEach(() => { vi.mocked(api).mockReset(); });
it("confirms columns and currency, validates, then commits only after the user confirms the final step", async () => {
  const done = vi.fn();
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (path.endsWith("/preview")) return preview as never;
    if (path.endsWith("/mapping")) return { mapping: JSON.parse(String(options?.body)).mapping } as never;
    if (path.endsWith("/validate")) return { batch: { ...batch, stage: "validation_ready", row_count: 3, accepted_count: 2, rejected_count: 1 }, issue_counts: { error: 1 }, coverage: {} } as never;
    if (path.includes("/issues")) return { items: [{ id: "issue", row_number: 4, message: "تاریخ نامعتبر", remedy: "تاریخ را اصلاح کنید." }], total: 1 } as never;
    if (path.endsWith("/commit")) return { ...batch, status: "queued" } as never;
    throw new Error("Unexpected request");
  });
  render(<UploadWizard company={company} initialBatch={batch} onSaving={vi.fn()} onCancel={vi.fn()} onUpdated={vi.fn()} onDone={done} />);
  const currency = await screen.findByRole("combobox", { name: "واحد مبلغ" });
  fireEvent.change(currency.closest("div")!.querySelector("select")!, { target: { value: "toman" } });
  fireEvent.click(screen.getByRole("button", { name: "ادامه" }));
  await screen.findByText("قابل ثبت");
  expect(vi.mocked(api).mock.calls.some(([path]) => path.endsWith("/commit"))).toBe(false);
  const request = vi.mocked(api).mock.calls.find(([path]) => path.endsWith("/mapping"))!;
  expect(JSON.parse(String(request[1]?.body))).toMatchObject({ currency_unit: "toman", transforms: { amount_signed: expect.arrayContaining(["toman_to_rial"]) } });
  fireEvent.click(screen.getByRole("button", { name: "ثبت سند" }));
  await waitFor(() => expect(done).toHaveBeenCalledWith(expect.objectContaining({ status: "queued" })));
});
it("blocks final submission when validation reports a blocking error", async () => {
  vi.mocked(api).mockImplementation(async (path) => {
    if (path.endsWith("/preview")) return { ...preview, mapping: { mapping: { booking_date: "date", description: "memo", amount_signed: "amount" }, currency_unit: "rial", calendar: "gregorian" } } as never;
    if (path.endsWith("/validate")) return { batch: { ...batch, row_count: 1, accepted_count: 0, rejected_count: 1 }, issue_counts: { blocking: 1 }, coverage: {} } as never;
    return { items: [], total: 1 } as never;
  });
  render(<UploadWizard company={company} initialBatch={batch} onSaving={vi.fn()} onCancel={vi.fn()} onUpdated={vi.fn()} onDone={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "ادامه" }));
  expect(await screen.findByRole("button", { name: "ثبت سند" })).toBeDisabled();
  expect(vi.mocked(api).mock.calls.some(([path]) => path.endsWith("/mapping") || path.endsWith("/commit"))).toBe(false);
});

function selectValue(label: string, value: string) {
  fireEvent.change(screen.getByRole("combobox", { name: label }).closest("div")!.querySelector("select")!, { target: { value } });
}

function renderNewUpload() {
  render(<UploadWizard company={company} onSaving={vi.fn()} onCancel={vi.fn()} onUpdated={vi.fn()} onDone={vi.fn()} />);
  selectValue("نوع سند", "bank");
  fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [new File(["date,amount\n2026-10-01,100"], "bank.csv", { type: "text/csv" })] } });
}

it("requires an account choice and sends the existing account for later statements", async () => {
  vi.mocked(api).mockImplementation(async (path) => {
    if (path.endsWith("/bank-accounts")) return [{ id: "mellat", label: "ملت جاری", account_last4: "1234" }, { id: "saman", label: "سامان" }] as never;
    if (path.endsWith("/uploads")) return { ...batch, scan_status: "pending" } as never;
    throw new Error("Unexpected request");
  });
  renderNewUpload();
  await screen.findByRole("combobox", { name: "حساب بانکی" });
  expect(screen.getByRole("button", { name: "ادامه" })).toBeDisabled();
  selectValue("حساب بانکی", "mellat");
  fireEvent.click(screen.getByRole("button", { name: "ادامه" }));
  await waitFor(() => expect(vi.mocked(api).mock.calls.some(([path]) => path.endsWith("/uploads"))).toBe(true));
  const form = vi.mocked(api).mock.calls.find(([path]) => path.endsWith("/uploads"))![1]!.body as FormData;
  expect(form.get("bank_account_id")).toBe("mellat");
  expect(form.get("source_label")).toBe("ملت جاری");
});

it("creates the first account with a required name and no existing account identifier", async () => {
  vi.mocked(api).mockImplementation(async (path) => {
    if (path.endsWith("/bank-accounts")) return [] as never;
    if (path.endsWith("/uploads")) return { ...batch, scan_status: "pending" } as never;
    throw new Error("Unexpected request");
  });
  renderNewUpload();
  const name = await screen.findByLabelText("نام حساب جدید");
  expect(screen.getByRole("button", { name: "ادامه" })).toBeDisabled();
  fireEvent.change(name, { target: { value: "بانک ملت جاری" } });
  fireEvent.click(screen.getByRole("button", { name: "ادامه" }));
  await waitFor(() => expect(vi.mocked(api).mock.calls.some(([path]) => path.endsWith("/uploads"))).toBe(true));
  const form = vi.mocked(api).mock.calls.find(([path]) => path.endsWith("/uploads"))![1]!.body as FormData;
  expect(form.has("bank_account_id")).toBe(false);
  expect(form.get("source_label")).toBe("بانک ملت جاری");
});

it("blocks upload on an account loading failure and allows retry", async () => {
  vi.mocked(api).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([] as never);
  renderNewUpload();
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "ادامه" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
  await screen.findByLabelText("نام حساب جدید");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
