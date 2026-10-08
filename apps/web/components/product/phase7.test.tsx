import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { IntegrationsWorkspace } from "./integrations-workspace";
import { AutomationsWorkspace } from "./automations-workspace";
import { ScenariosWorkspace } from "./scenarios-workspace";
import type { Company } from "@/lib/product-types";

// Mock the API client
const mockApi = vi.fn();
vi.mock("@/lib/product-api", () => ({
  api: (...args: any[]) => mockApi(...args),
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe("Phase 7 Frontend Workspaces", () => {
  const mockCompany: Company = {
    id: "00000000-0000-0000-0000-000000000001",
    legal_name: "شرکت فناوران دانش دیدبان",
    currency: "IRR",
    created_at: "2026-01-01T00:00:00Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("IntegrationsWorkspace", () => {
    const mockConnections = [
      {
        id: "conn-1",
        company_id: mockCompany.id,
        provider: "sepidar",
        name: "ارتباط مستقیم با سپیدار سیستم",
        status: "connected",
        config: { server_host: "192.168.1.10" },
        last_sync_at: "2026-09-26T08:00:00Z",
        next_sync_at: null,
        last_error_message: null,
        last_sync_record_count: 145,
        sync_interval_minutes: 1440,
        created_at: "2026-09-26T00:00:00Z",
        updated_at: "2026-09-26T00:00:00Z",
      },
    ];

    it("renders connections and fallback manual import link", async () => {
      mockApi.mockImplementation((url: string) => {
        if (url.includes("/integrations")) {
          return Promise.resolve(mockConnections);
        }
        return Promise.resolve([]);
      });

      render(<IntegrationsWorkspace company={mockCompany} />);

      await waitFor(() => {
        expect(screen.getByText("اتصال‌ها و جریان داده")).toBeDefined();
        expect(screen.getByText("ارتباط مستقیم با سپیدار سیستم")).toBeDefined();
        expect(screen.getByText(/بارگذاری دستی اکسل/)).toBeDefined();
      });
    });

    it("triggers connection test and shows result", async () => {
      mockApi.mockImplementation((url: string) => {
        if (url.includes("/test")) {
          return Promise.resolve({
            success: true,
            status: "ok",
            message_fa: "ارتباط با سپیدار پایدار است.",
            latency_ms: 120,
            details: {},
          });
        }
        if (url.includes("/integrations")) {
          return Promise.resolve(mockConnections);
        }
        return Promise.resolve([]);
      });

      render(<IntegrationsWorkspace company={mockCompany} />);

      await waitFor(() => {
        expect(screen.getByText("ارتباط مستقیم با سپیدار سیستم")).toBeDefined();
      });

      const testBtn = screen.getByText("تست اتصال");
      fireEvent.click(testBtn);

      await waitFor(() => {
        expect(mockApi).toHaveBeenCalledWith(
          expect.stringContaining("/conn-1/test"),
          expect.objectContaining({ method: "POST" }),
        );
      });
    });
  });

  describe("AutomationsWorkspace", () => {
    const mockRules = [
      {
        id: "rule-1",
        company_id: mockCompany.id,
        name: "چرخه پایش صبحگاهی خزانه‌داری (Daily Morning Cycle)",
        action_type: "daily_morning_cycle",
        is_enabled: true,
        schedule_cron: "0 6 * * *",
        config: {},
        last_run_at: "2026-09-26T06:00:00Z",
        next_run_at: "2026-09-27T06:00:00Z",
        last_status: "success",
        created_at: "2026-09-26T00:00:00Z",
        updated_at: "2026-09-26T00:00:00Z",
      },
    ];

    it("renders automated rules and trigger button", async () => {
      mockApi.mockImplementation((url: string) => {
        if (url.includes("/automations")) {
          return Promise.resolve(mockRules);
        }
        return Promise.resolve([]);
      });

      render(<AutomationsWorkspace company={mockCompany} />);

      await waitFor(() => {
        expect(screen.getByText("چرخه‌های خودکار مالی")).toBeDefined();
        expect(
          screen.getByText(
            "چرخه پایش صبحگاهی خزانه‌داری (Daily Morning Cycle)",
          ),
        ).toBeDefined();
        expect(screen.getByText("اجرای فوری چرخه")).toBeDefined();
      });
    });

    it("executes rule when run button clicked", async () => {
      mockApi.mockImplementation((url: string) => {
        if (url.includes("/run")) {
          return Promise.resolve({
            id: "run-1",
            company_id: mockCompany.id,
            rule_id: "rule-1",
            status: "succeeded",
            steps_executed: [],
          });
        }
        if (url.includes("/automations")) {
          return Promise.resolve(mockRules);
        }
        return Promise.resolve([]);
      });

      render(<AutomationsWorkspace company={mockCompany} />);

      await waitFor(() => {
        expect(screen.getByText("اجرای فوری چرخه")).toBeDefined();
      });

      const executeBtn = screen.getByText("اجرای فوری چرخه");
      fireEvent.click(executeBtn);

      await waitFor(() => {
        expect(mockApi).toHaveBeenCalledWith(
          expect.stringContaining("/rule-1/run"),
          expect.objectContaining({ method: "POST" }),
        );
      });
    });
  });

  describe("ScenariosWorkspace", () => {
    const mockPresets = [
      {
        id: "cash_preservation",
        name_fa: "حالت بقا و انباشت نقدینگی (Cash Defense)",
        description_fa: "تسریع ۱۵ روزه وصول مطالبات",
        icon: "shield",
        parameters: {
          dso_change_days: -15,
          early_settlement_discount_pct: 2,
          discount_adoption_rate_pct: 35,
          new_hires_count: 0,
          avg_salary_monthly_irr: "0",
          fixed_cost_monthly_change_irr: "0",
          dpo_change_days: 15,
          shock_customer_id: null,
          shock_delay_days: 0,
          shock_default_pct: 0,
        },
      },
    ];

    const mockSimulationResult = {
      runway_days_delta: {
        baseline_value: "45",
        simulated_value: "65",
        delta_value: "20",
        unit: "روز",
        is_improvement: true,
      },
      monthly_burn_rate_delta: {
        baseline_value: "500000000",
        simulated_value: "500000000",
        delta_value: "0",
        unit: "IRR",
        is_improvement: true,
      },
      cash_conversion_cycle_delta: {
        baseline_value: "60",
        simulated_value: "30",
        delta_value: "-30",
        unit: "روز",
        is_improvement: true,
      },
      liquidity_released_irr: "1500000000",
      discount_cost_annual_irr: "30000000",
      net_annual_profit_impact_irr: "-30000000",
      first_deficit_week_baseline: null,
      first_deficit_week_simulated: null,
      executive_verdict_fa: "این تصمیم تاب‌آوری را به ۶۵ روز افزایش می‌دهد.",
      risk_warnings_fa: [],
      weeks: [
        {
          week_number: 1,
          start_date: "2026-09-26",
          end_date: "2026-10-02",
          baseline_closing_cash_irr: "1000000000",
          simulated_closing_cash_irr: "1200000000",
          simulated_inflows_irr: "300000000",
          simulated_outflows_irr: "100000000",
          is_baseline_deficit: false,
          is_simulated_deficit: false,
        },
      ],
    };

    it("renders presets and simulation calculation results", async () => {
      mockApi.mockImplementation((url: string) => {
        if (url.includes("/simulation/presets")) {
          return Promise.resolve({ items: mockPresets });
        }
        if (url.includes("/simulation/scenarios")) {
          return Promise.resolve({ items: [] });
        }
        if (url.includes("/simulation/run")) {
          return Promise.resolve(mockSimulationResult);
        }
        return Promise.resolve({});
      });

      render(<ScenariosWorkspace company={mockCompany} />);

      await waitFor(() => {
        expect(screen.getByText("سناریوها، پیش از تصمیم")).toBeDefined();
        expect(screen.getByText("حفظ نقدینگی")).toBeDefined();
        expect(
          screen.getByText("این تصمیم تاب‌آوری را به ۶۵ روز افزایش می‌دهد."),
        ).toBeDefined();
        expect(
          screen.getByText(
            "مسیر ۱۳ هفته‌ای تراز پایانی نقدینگی (مبنا در برابر سناریو)",
          ),
        ).toBeDefined();
      });
    });

    it("applies preset on click", async () => {
      mockApi.mockImplementation((url: string) => {
        if (url.includes("/simulation/presets")) {
          return Promise.resolve({ items: mockPresets });
        }
        if (url.includes("/simulation/scenarios")) {
          return Promise.resolve({ items: [] });
        }
        if (url.includes("/simulation/run")) {
          return Promise.resolve(mockSimulationResult);
        }
        return Promise.resolve({});
      });

      render(<ScenariosWorkspace company={mockCompany} />);

      await waitFor(() => {
        expect(screen.getByText("حفظ نقدینگی")).toBeDefined();
      });

      const presetCard = screen.getByRole("button", { name: /حفظ نقدینگی/ });
      fireEvent.click(presetCard);

      await waitFor(() => {
        expect(mockApi).toHaveBeenCalledWith(
          expect.stringContaining("/simulation/run"),
          expect.objectContaining({
            method: "POST",
            body: expect.stringContaining("-15"),
          }),
        );
      });
      const runs = mockApi.mock.calls.filter(([url]) =>
        String(url).includes("/simulation/run"),
      );
      expect(runs).toHaveLength(2);
      expect(JSON.parse(runs.at(-1)?.[1]?.body as string).dso_change_days).toBe(
        -15,
      );
      fireEvent.keyDown(presetCard, { key: "Enter" });
      await waitFor(() =>
        expect(
          mockApi.mock.calls.filter(([url]) =>
            String(url).includes("/simulation/run"),
          ),
        ).toHaveLength(3),
      );
      expect(presetCard).toHaveAttribute("aria-pressed", "true");
    });
  });
});
