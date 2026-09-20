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

describe("ImportsPanel document deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders delete button for company owner and allows deleting document after confirmation", async () => {
    vi.mocked(api).mockImplementation((path, options) => {
      if (options?.method === "DELETE") {
        return Promise.resolve(undefined as any);
      }
      if (path === "/companies/comp-1/imports") {
        return Promise.resolve(mockBatches as any);
      }
      return Promise.resolve([] as any);
    });

    render(<ImportsPanel company={mockCompanyOwner} />);

    // Wait for file list to load
    await waitFor(() => {
      expect(screen.getByText("sanad_1405.xlsx")).toBeInTheDocument();
    });

    // Find delete button
    const deleteBtn = screen.getByRole("button", { name: /حذف sanad_1405\.xlsx/i });
    expect(deleteBtn).toBeInTheDocument();

    // Click delete button
    fireEvent.click(deleteBtn);

    // Confirmation dialog should appear
    expect(screen.getByText("حذف سند مالی")).toBeInTheDocument();
    expect(screen.getByText(/آیا از حذف فایل/i)).toBeInTheDocument();

    // Click confirmation button
    const confirmBtn = screen.getByRole("button", { name: "حذف قطعی سند" });
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
    vi.mocked(api).mockResolvedValue(mockBatches as any);

    render(<ImportsPanel company={mockCompanyViewer} />);

    await waitFor(() => {
      expect(screen.getByText("sanad_1405.xlsx")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /حذف sanad_1405\.xlsx/i })).not.toBeInTheDocument();
  });
});
