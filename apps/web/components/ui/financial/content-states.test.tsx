import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { LoadingState } from "./loading-state";
import { ChartValueTooltip, formatChartNumber } from "./financial-chart";

describe("shared content states", () => {
  it("keeps inline validation concise without adding a generic error", () => {
    render(<ErrorState variant="inline" id="date-error">تاریخ پایان باید بعد از شروع باشد.</ErrorState>);
    expect(screen.getByRole("alert").textContent).toBe("تاریخ پایان باید بعد از شروع باشد.");
    expect(screen.getByRole("alert").id).toBe("date-error");
  });
  it("offers retry and prevents duplicate activation while retrying", () => {
    const retry = vi.fn();
    const { rerender } = render(<ErrorState variant="compact" error="اطلاعات دریافت نشد." onRetry={retry} />);
    fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
    expect(retry).toHaveBeenCalledOnce();
    rerender(<ErrorState variant="compact" error="اطلاعات دریافت نشد." onRetry={retry} retrying />);
    expect(screen.getByRole("button", { name: "در حال تلاش…" })).toBeDisabled();
  });
  it("keeps loading named and retains skeleton content hidden from screen readers", () => {
    const { container } = render(<LoadingState variant="chart" label="دریافت نمودار" />);
    expect(screen.getByRole("status", { name: "دریافت نمودار" })).toHaveAttribute("aria-busy", "true");
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });
  it("offers filter reset only when there is a reset handler", () => {
    const reset = vi.fn();
    render(<EmptyState variant="compact" title="فاکتوری پیدا نشد." hasActiveFilters onClearFilters={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "پاک کردن فیلترها" }));
    expect(reset).toHaveBeenCalledOnce();
  });
  it("does not present missing chart values as zero", () => {
    expect(formatChartNumber(null)).toBe("—");
    expect(formatChartNumber(undefined)).toBe("—");
    expect(formatChartNumber(" ")).toBe("—");
    expect(formatChartNumber(0)).toBe("۰");
    expect(formatChartNumber(-1)).toContain("۱");
    const { container } = render(<ChartValueTooltip active label="روز نمونه" payload={[{ name: "مانده", value: null }]} unit="میلیون تومان" />);
    expect(container.textContent).toContain("—");
  });
  it("never shows an inactive chart tooltip", () => {
    const { container } = render(<ChartValueTooltip active={false} payload={[{ value: 2 }]} />);
    expect(container.textContent).toBe("");
  });
});
