import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { ProductTour } from "./product-tour";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe("ProductTour Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("does not render when open is false", () => {
    const { container } = render(
      <ProductTour companyId="company-1" open={false} onOpenChange={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders welcome step when open is true", () => {
    render(
      <ProductTour companyId="company-1" open={true} onOpenChange={vi.fn()} />
    );

    expect(screen.getByText("تور آشنایی با دیدبان مالی")).toBeDefined();
    expect(screen.getByText("خوش‌آمدید به دیدبان مالی")).toBeDefined();
    expect(screen.getByText("تلفیق ۳ منبع کلیدی داده")).toBeDefined();
    expect(screen.getByText("گام بعدی")).toBeDefined();
  });

  it("navigates forward through steps when clicking next", () => {
    render(
      <ProductTour companyId="company-1" open={true} onOpenChange={vi.fn()} />
    );

    const nextBtn = screen.getByText("گام بعدی");
    fireEvent.click(nextBtn);

    // Step 2: Data Center
    expect(screen.getByText("مرکز داده‌ها و بارگذاری هوشمند")).toBeDefined();
    expect(screen.getByText("گام قبلی")).toBeDefined();

    // Step 3: Reconciliation
    fireEvent.click(screen.getByText("گام بعدی"));
    expect(screen.getByText("تطبیق خودکار بانک و دفاتر کل")).toBeDefined();

    // Step 4: Findings
    fireEvent.click(screen.getByText("گام بعدی"));
    expect(screen.getByText("موتور یافته‌ها و زنجیره شواهد")).toBeDefined();

    // Step 5: Cashflow
    fireEvent.click(screen.getByText("گام بعدی"));
    expect(screen.getByText("پیش‌بینی نقدینگی و تحلیل سناریو")).toBeDefined();

    // Step 6: Actions & Reports
    fireEvent.click(screen.getByText("گام بعدی"));
    expect(screen.getByText("کارتابل اقدامات من و گزارش‌های رسمی")).toBeDefined();
    expect(screen.getByText("شروع به کار در دیدبان مالی")).toBeDefined();
  });

  it("navigates backward when clicking previous button", () => {
    render(
      <ProductTour companyId="company-1" open={true} onOpenChange={vi.fn()} />
    );

    // Go to step 2
    fireEvent.click(screen.getByText("گام بعدی"));
    expect(screen.getByText("مرکز داده‌ها و بارگذاری هوشمند")).toBeDefined();

    // Go back to step 1
    fireEvent.click(screen.getByText("گام قبلی"));
    expect(screen.getByText("خوش‌آمدید به دیدبان مالی")).toBeDefined();
  });

  it("closes and writes to localStorage when close button is clicked", () => {
    const handleOpenChange = vi.fn();
    render(
      <ProductTour
        companyId="company-1"
        open={true}
        onOpenChange={handleOpenChange}
        storageKey="custom_tour_key"
      />
    );

    const closeBtn = screen.getByLabelText("بستن تور");
    fireEvent.click(closeBtn);

    expect(handleOpenChange).toHaveBeenCalledWith(false);
    expect(localStorage.getItem("custom_tour_key")).toBe("true");
  });

  it("closes and writes to localStorage when finishing tour on last step", () => {
    const handleOpenChange = vi.fn();
    render(
      <ProductTour
        companyId="company-1"
        open={true}
        onOpenChange={handleOpenChange}
        storageKey="test_finish_key"
      />
    );

    // Click next 5 times to reach last step
    for (let i = 0; i < 5; i++) {
      fireEvent.click(screen.getByText("گام بعدی"));
    }

    const finishBtn = screen.getByText("شروع به کار در دیدبان مالی");
    fireEvent.click(finishBtn);

    expect(handleOpenChange).toHaveBeenCalledWith(false);
    expect(localStorage.getItem("test_finish_key")).toBe("true");
  });

  it("jumps to route and closes tour when clicking section link", () => {
    const handleOpenChange = vi.fn();
    render(
      <ProductTour companyId="comp-123" open={true} onOpenChange={handleOpenChange} />
    );

    // Go to step 2 (Data Center which has route)
    fireEvent.click(screen.getByText("گام بعدی"));

    const jumpBtn = screen.getByText("مشاهده مرکز داده‌ها");
    fireEvent.click(jumpBtn);

    expect(mockPush).toHaveBeenCalledWith("/companies/comp-123/data");
    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });
});
