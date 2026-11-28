import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SectionRenderer } from "./section-renderer";
import type { RenderedSection } from "@/lib/report-studio";

afterEach(cleanup);

const mockSection: RenderedSection = {
  id: "sec-1",
  title: "شاخص‌های مالی",
  description: "خلاصه وضعیت مالی",
  layout: "grid-2",
  basis: "all",
  widgets: [
    {
      id: "w-1",
      title: "فروش کل",
      type: "kpi_card",
      entity: "invoices",
      metric: "sales_total",
      group_by: "none",
      limit: 10,
      filters: { direction: "sales", overdue_only: false },
      unit: "IRR",
      col_span: 6,
      data: {
        value: 125000000,
        formatted_value: "۱۲۵٬۰۰۰٬۰۰۰",
        unit: "ریال",
        status: "positive",
      },
    },
    {
      id: "w-2",
      title: "هزینه‌های عملیاتی",
      type: "kpi_card",
      entity: "ledger",
      metric: "operating_expenses",
      group_by: "none",
      limit: 10,
      filters: { direction: "all", overdue_only: false },
      unit: "IRR",
      col_span: 6,
      data: {
        value: 45000000,
        formatted_value: "۴۵٬۰۰۰٬۰۰۰",
        unit: "ریال",
        status: "danger",
      },
    },
  ],
};

it("renders section and widgets correctly without console errors", () => {
  const errorSpy = vi.spyOn(console, "error");

  render(<SectionRenderer section={mockSection} />);

  expect(screen.getByText("شاخص‌های مالی")).toBeInTheDocument();
  expect(screen.getByText("فروش کل")).toBeInTheDocument();
  expect(screen.getByText("هزینه‌های عملیاتی")).toBeInTheDocument();

  // Ensure no React setState-in-render warning is logged
  const badSetStateCalls = errorSpy.mock.calls.filter((call) =>
    call.some((arg) => typeof arg === "string" && arg.includes("Cannot update a component")),
  );
  expect(badSetStateCalls).toHaveLength(0);

  errorSpy.mockRestore();
});

it("calls onResizeWidget when the quick width pill is clicked", () => {
  const onResizeWidget = vi.fn();

  render(<SectionRenderer section={mockSection} onResizeWidget={onResizeWidget} />);

  const pillButtons = screen.getAllByRole("button", { name: "تغییر عرض کارت" });
  expect(pillButtons.length).toBeGreaterThan(0);

  fireEvent.click(pillButtons[0]);
  // Current span is 6, next in [3, 4, 6, 8, 12] is 8
  expect(onResizeWidget).toHaveBeenCalledWith("w-1", 8);
});

it("handles drag-to-resize and triggers onResizeWidget on mouseup without React warnings", () => {
  const onResizeWidget = vi.fn();
  const errorSpy = vi.spyOn(console, "error");

  render(<SectionRenderer section={mockSection} onResizeWidget={onResizeWidget} />);

  const handles = screen.getAllByRole("separator", { name: "تغییر عرض کارت با ماوس" });
  expect(handles.length).toBeGreaterThan(0);

  // Mouse down on the handle
  fireEvent.mouseDown(handles[0], { clientX: 500 });

  // Mouse move simulating significant drag to the left to change colSpan
  fireEvent.mouseMove(window, { clientX: -500 });

  // Mouse up completes the resize
  fireEvent.mouseUp(window);

  expect(onResizeWidget).toHaveBeenCalledWith("w-1", 12);

  // Ensure no React setState-in-render warning was logged
  const badSetStateCalls = errorSpy.mock.calls.filter((call) =>
    call.some((arg) => typeof arg === "string" && arg.includes("Cannot update a component")),
  );
  expect(badSetStateCalls).toHaveLength(0);

  errorSpy.mockRestore();
});
