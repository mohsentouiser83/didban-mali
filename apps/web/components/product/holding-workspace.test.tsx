import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { HoldingWorkspace } from "./holding-workspace";

vi.mock("@/lib/product-api", () => ({
  api: vi.fn(),
}));

const mockHoldingSummary = {
  companies_count: 2,
  total_cash_balance_irr: 1250000000,
  total_receivables_irr: 840000000,
  total_payables_irr: 410000000,
  total_net_liquidity_irr: 1680000000,
  total_critical_findings_count: 1,
  companies: [
    {
      id: "comp-1",
      legal_name: "شرکت صنایع تولیدی پیشگام",
      national_id: "10103456789",
      currency: "IRR",
      cash_balance_irr: 750000000,
      receivables_irr: 500000000,
      payables_irr: 200000000,
      net_liquidity_irr: 1050000000,
      critical_findings_count: 1,
      reconciliation_match_rate: 96.5,
      last_data_at: "2026-09-25T10:00:00Z",
      is_live: true,
    },
    {
      id: "comp-2",
      legal_name: "شرکت بازرگانی فناوری نوین",
      national_id: "10109876543",
      currency: "IRR",
      cash_balance_irr: 500000000,
      receivables_irr: 340000000,
      payables_irr: 210000000,
      net_liquidity_irr: 630000000,
      critical_findings_count: 0,
      reconciliation_match_rate: 93.0,
      last_data_at: "2026-09-24T18:00:00Z",
      is_live: true,
    },
  ],
  weekly_forecast: [
    {
      week_number: 1,
      projected_cash_irr: 1300000000,
      inflow_irr: 90000000,
      outflow_irr: 40000000,
    },
    {
      week_number: 2,
      projected_cash_irr: 1340000000,
      inflow_irr: 85000000,
      outflow_irr: 45000000,
    },
  ],
  intercompany_transactions: [],
  generated_at: "2026-09-26T12:00:00Z",
};

describe("HoldingWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders consolidated holding header, KPI cards and company matrix", async () => {
    const { api } = await import("@/lib/product-api");
    vi.mocked(api).mockResolvedValueOnce(mockHoldingSummary);

    render(<HoldingWorkspace />);

    // Header title
    expect(screen.getByText("شرکت‌ها، در یک نگاه")).toBeDefined();

    // Wait for data load
    await waitFor(() => {
      expect(screen.getByText("شرکت صنایع تولیدی پیشگام")).toBeDefined();
      expect(screen.getByText("شرکت بازرگانی فناوری نوین")).toBeDefined();
    });

    // Check consolidated KPI titles
    expect(screen.getByText("مجموع نقدینگی تجمیعی هلدینگ")).toBeDefined();
    expect(screen.getByText("مجموع مطالبات تجاری هلدینگ")).toBeDefined();
    expect(screen.getByText("مجموع تعهدات و بدهی‌های جاری")).toBeDefined();
    expect(screen.getByText("خالص نقدینگی در گردش هلدینگ")).toBeDefined();

    // Check critical findings alert
    expect(
      screen.getByText(/توجه مدیریت ارشد مالی: تعداد ۱ مغایرت بحرانی/),
    ).toBeDefined();

    // Check Local Agent Banner
    expect(
      screen.getByText(
        "کلاینت همگام‌ساز محلی دیدبان مالی (Didban Local Sync Agent)",
      ),
    ).toBeDefined();
  });
});
