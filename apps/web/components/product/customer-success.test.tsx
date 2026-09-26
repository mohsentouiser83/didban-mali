import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { CustomerValueSummary } from "./customer-value-summary";
import { DataStalenessBanner } from "./data-staleness-banner";
import { OnboardingWizardBanner } from "./onboarding-wizard-banner";
import type { Company } from "@/lib/product-types";

vi.mock("@/lib/product-api", () => ({
  api: vi.fn().mockResolvedValue({
    stage: "live_operating",
    is_live: true,
    steps: [],
    blockers: [],
    completion_percentage: 100,
  }),
}));

// Mock next/navigation and next/link
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("Phase 6 Customer Success & Onboarding Components", () => {
  describe("CustomerValueSummary", () => {
    it("renders financial value metrics correctly", () => {
      render(
        <CustomerValueSummary
          reconciledRatioPercentage={98}
          resolvedFindingsCount={15}
          monitoredOverdueArToman="۴.۵ میلیارد تومان"
          totalErrorsPreventedCount={6}
        />
      );

      expect(screen.getByText("ارزش عملیاتی و کنترل مالی این دوره")).toBeDefined();
      expect(screen.getByText("۹۸٪")).toBeDefined();
      expect(screen.getByText("۱۵ مورد")).toBeDefined();
      expect(screen.getByText("۴.۵ میلیارد تومان")).toBeDefined();
      expect(screen.getByText("۶ خطای مالی")).toBeDefined();
    });
  });

  describe("DataStalenessBanner", () => {
    it("returns null if data is fresh (<= 3 days)", () => {
      const { container } = render(
        <DataStalenessBanner companyId="comp-1" lastUpdatedDaysAgo={2} />
      );
      expect(container.firstChild).toBeNull();
    });

    it("displays warning banner if data is stale (> 3 days)", () => {
      render(
        <DataStalenessBanner
          companyId="comp-1"
          lastUpdatedDaysAgo={6}
          lastUpdatedDateFa="۱۴۰۳/۰۶/۲۰"
        />
      );

      expect(screen.getByText(/هشدار تازگی داده:/)).toBeDefined();
      expect(screen.getByText(/۶ روز قبل/)).toBeDefined();
      expect(screen.getByText(/۱۴۰۳\/۰۶\/۲۰/)).toBeDefined();
    });
  });

  describe("OnboardingWizardBanner", () => {
    const liveCompany: Company = {
      id: "comp-live",
      legal_name: "شرکت تست زنده",
      currency: "IRR",
      created_at: "2026-01-01T00:00:00Z",
      onboarding_stage: "live_operating",
      is_live: true,
      go_live_at: "2026-01-02T00:00:00Z",
    };

    it("returns null when company is already live in production", () => {
      const { container } = render(
        <OnboardingWizardBanner companyId={liveCompany.id} />
      );
      expect(container.firstChild).toBeNull();
    });
  });
});
