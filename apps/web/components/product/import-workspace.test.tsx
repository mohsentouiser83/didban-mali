import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ImportWorkspace } from "./import-workspace";
import { api } from "@/lib/product-api";
import type { Company, ImportBatch } from "@/lib/product-types";
vi.mock("@/lib/product-api", () => ({ api: vi.fn(), API_URL: "/api/v1" }));
const batch = { id: "b1", source_kind: "settlement_sales", source_label: "تسویه", stage: "normalized", progress: 100, size_bytes: 100, sha256: "test", duplicate_detected: false, failure_message: null, created_at: "2026-10-16T00:00:00Z", status: "completed_limited", scan_status: "clean", original_name: "settlements.csv", coverage: { settlement_results: { review: 1 } } } as ImportBatch;
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async (path) => {
    if (path.includes("/rows?")) return { columns: ["مبلغ"], total_count: 1, items: [{ id: "r1", row_number: 2, raw: { مبلغ: "100" }, issues: [], processing_result: { status: "review", reason: "مرجع بانکی یکتا نیست.", invoice_source_row_id: "invoice1" } }] } as never;
    return batch as never;
  });
});
it("shows the reason for manual review and links to the specific invoice", async () => {
  render(<ImportWorkspace company={{ id: "c1", role: "viewer" } as Company} batchId="b1" />);
  fireEvent.click(await screen.findByRole("button", { name: "مشاهده ردیف ۲" }));
  expect(await screen.findByText("مرجع بانکی یکتا نیست.")).toBeVisible();
  expect(screen.getByRole("link", { name: "بررسی اتصال به بانک" })).toHaveAttribute("href", "/companies/c1/settlements?invoice=invoice1");
  expect(screen.queryByRole("button", { name: "بررسی دوباره موارد حل‌نشده" })).not.toBeInTheDocument();
});
it("filters unresolved settlement rows without using validation-error filters", async () => {
  render(<ImportWorkspace company={{ id: "c1", role: "owner" } as Company} batchId="b1" />);
  await screen.findByRole("button", { name: "مشاهده ردیف ۲" });
  fireEvent.click(screen.getByRole("combobox", { name: "وضعیت ردیف" }));
  fireEvent.click(await screen.findByRole("option", { name: "نیازمند بررسی" }));
  await waitFor(() => expect(vi.mocked(api).mock.calls.some(([path]) => path.includes("row_status=review"))).toBe(true));
});
