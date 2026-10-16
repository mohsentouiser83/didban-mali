import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ImportsPanel } from "./imports-panel";
import type { Company, ImportBatch } from "@/lib/product-types";

const mockCompanyOwner: Company = {
  id: "comp-1",
  legal_name: "شرکت تست",
  national_id: "14001234567",
  currency: "IRR",
  fiscal_year_start_month: 1,
  timezone: "Asia/Tehran",
  role: "owner",
  created_at: "2026-01-01T00:00:00Z",
};

const mockCompanyViewer: Company = {
  ...mockCompanyOwner,
  role: "viewer",
};

const summary = { total_count: 52, pending_count: 10, completed_count: 40, failed_count: 2 };

const mockBatches: ImportBatch[] = [
  {
    id: "batch-1",
    source_kind: "accounting",
    source_label: "دفتر شهریور",
    status: "completed",
    stage: "normalized",
    progress: 100,
    original_name: "sanad_1405.xlsx",
    size_bytes: 1024 * 1024,
    sha256: "abc1234",
    scan_status: "clean",
    duplicate_detected: false,
    failure_message: null,
    created_at: "2026-09-19T10:00:00Z",
  },
];

vi.mock("@/lib/product-api", () => ({
  API_URL: "/api/v1",
  api: vi.fn(),
}));

import { api } from "@/lib/product-api";

describe("ImportsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders delete button for company owner and allows deleting document after confirmation", async () => {
    vi.mocked(api).mockImplementation((path, options) => {
      if (path.endsWith("/summary")) return Promise.resolve(summary as never);
      if (options?.method === "DELETE") {
        return Promise.resolve(undefined as never);
      }
      if (path === "/companies/comp-1/imports") {
        return Promise.resolve(mockBatches as never);
      }
      return Promise.resolve([] as never);
    });

    render(<ImportsPanel company={mockCompanyOwner} />);

    // Wait for file list to load
    await waitFor(() => {
      expect(screen.getByText("sanad_1405.xlsx")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "sanad_1405.xlsx" }));

    // Find delete button
    const deleteBtn = screen.getByRole("button", { name: /حذف sanad_1405\.xlsx/i });
    expect(deleteBtn).toBeInTheDocument();

    // Click delete button
    fireEvent.click(deleteBtn);

    // Confirmation dialog should appear
    expect(screen.getByText("حذف سند مالی")).toBeInTheDocument();
    expect(screen.getByText(/آیا از حذف فایل/i)).toBeInTheDocument();

    // Click confirmation button
    const confirmBtn = screen.getByRole("button", { name: "حذف" });
    fireEvent.click(confirmBtn);

    // API should be called with DELETE method
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith(
        "/companies/comp-1/imports/batch-1",
        expect.objectContaining({ method: "DELETE" })
      );
    });

    // Success notice should appear
    await waitFor(() => {
      expect(screen.getByText(/با موفقیت حذف شد/i)).toBeInTheDocument();
    });
  });

  it("does not render delete button for viewers", async () => {
    vi.mocked(api).mockImplementation(async (path) => (path.endsWith("/summary") ? summary : mockBatches) as never);

    render(<ImportsPanel company={mockCompanyViewer} />);

    await waitFor(() => {
      expect(screen.getByText("sanad_1405.xlsx")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "sanad_1405.xlsx" }));
    expect(screen.queryByRole("button", { name: "بارگذاری فایل" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /حذف sanad_1405\.xlsx/i })).not.toBeInTheDocument();
  });
  it("uploads a selected file with its source and keeps the request key when retrying", async () => {
    const created = { ...mockBatches[0], id: "batch-new", original_name: "bank.csv", source_kind: "bank" as const, status: "uploaded" as const, scan_status: "pending" as const };
    let uploads = 0;
    vi.mocked(api).mockImplementation(async (path, options) => {
      if (path.endsWith("/summary")) return summary as never;
      if (path.endsWith("/uploads")) {
        uploads += 1;
        if (uploads === 1) throw new Error("اتصال برقرار نشد.");
        return created as never;
      }
      if (path.endsWith("/bank-accounts")) return [] as never;
      return mockBatches as never;
    });
    render(<ImportsPanel company={mockCompanyOwner} />);
    await screen.findByRole("button", { name: "sanad_1405.xlsx" });
    fireEvent.click(screen.getByRole("button", { name: "بارگذاری فایل" }));
    // The common select uses a hidden native select to participate in forms.
    fireEvent.change(screen.getByRole("combobox", { name: "نوع سند" }).closest("div")!.querySelector("select")!, { target: { value: "bank" } });
    fireEvent.change(await screen.findByLabelText("نام حساب جدید"), { target: { value: "بانک مهر" } });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [new File(["date,amount\n1405/01/01,100"], "bank.csv", { type: "text/csv" })] } });
    fireEvent.click(screen.getByRole("button", { name: "ادامه" }));
    await screen.findByText("اتصال برقرار نشد.");
    fireEvent.click(screen.getByRole("button", { name: "ادامه" }));
    await screen.findByText("در حال بررسی فایل…");
    const requests = vi.mocked(api).mock.calls.filter(([path]) => path.endsWith("/uploads"));
    expect(requests).toHaveLength(2);
    expect(requests[0][1]?.headers).toEqual(requests[1][1]?.headers);
    const form = requests[1][1]?.body as FormData;
    expect(form.get("source_kind")).toBe("bank");
    expect(form.get("source_label")).toBe("بانک مهر");
    expect((form.get("file") as File).name).toBe("bank.csv");
    expect(screen.getByRole("dialog", { name: "بارگذاری فایل" })).toBeInTheDocument();
  });

  it("rejects unsupported files without sending an upload request", async () => {
    vi.mocked(api).mockImplementation(async (path) => (path.endsWith("/summary") ? summary : []) as never);
    render(<ImportsPanel company={mockCompanyOwner} />);
    fireEvent.click(screen.getByRole("button", { name: "بارگذاری فایل" }));
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [new File(["invalid"], "document.exe")] } });
    expect(screen.getByText("فایل باید CSV، XLS، XLSX یا PDF بانک باشد.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ادامه" })).toBeDisabled();
    expect(vi.mocked(api).mock.calls.some(([path]) => path.endsWith("/uploads"))).toBe(false);
  });

  it("keeps total document statistics when searching the recent files", async () => {
    vi.mocked(api).mockImplementation(async (path) => (path.endsWith("/summary") ? summary : mockBatches) as never);
    render(<ImportsPanel company={mockCompanyOwner} />);
    await screen.findByLabelText("۵۲ فایل");
    fireEvent.change(screen.getByRole("textbox", { name: "جستجوی سند" }), { target: { value: "ناموجود" } });
    expect(screen.getByLabelText("۵۲ فایل")).toBeInTheDocument();
    expect(screen.getByLabelText("۱۰ فایل")).toBeInTheDocument();
    expect(screen.getByLabelText("۴۰ فایل")).toBeInTheDocument();
    expect(screen.getByLabelText("۲ فایل")).toBeInTheDocument();
    expect(screen.getByText("سندی با این جستجو و فیلتر پیدا نشد.")).toBeInTheDocument();
  });

});
