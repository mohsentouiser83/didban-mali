import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WaterfallChart, type WaterfallStep } from "./waterfall-chart";

const mockSteps: WaterfallStep[] = [
  { label: "مانده اولیه", value: 10000000, type: "initial" },
  { label: "درآمد فروش", value: 4000000, type: "inflow" },
  { label: "هزینه حقوق", value: 3000000, type: "outflow" },
  { label: "جمع میانی", value: 11000000, type: "subtotal" },
  { label: "مانده نهایی", value: 11000000, type: "final" },
];

describe("WaterfallChart", () => {
  it("renders the waterfall chart with title, step labels, and legend", () => {
    render(
      <WaterfallChart
        steps={mockSteps}
        label="پل جریان وجوه نقد"
        unit="IRR"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "پل جریان وجوه نقد" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("مانده اولیه").length).toBeGreaterThan(0);
    expect(screen.getAllByText("درآمد فروش").length).toBeGreaterThan(0);
    expect(screen.getAllByText("هزینه حقوق").length).toBeGreaterThan(0);
    expect(screen.getAllByText("جمع میانی").length).toBeGreaterThan(0);
    expect(screen.getAllByText("مانده نهایی").length).toBeGreaterThan(0);

    expect(screen.getAllByText("ورودی / درآمد").length).toBeGreaterThan(0);
    expect(screen.getAllByText("خروجی / هزینه").length).toBeGreaterThan(0);
  });

  it("renders accessible graphic symbols and screen-reader data table", () => {
    render(
      <WaterfallChart
        steps={mockSteps}
        label="گزارش آبشاری"
        unit="TOMAN"
      />,
    );

    const symbols = screen.getAllByRole("graphics-symbol");
    expect(symbols).toHaveLength(mockSteps.length);

    expect(symbols[0]).toHaveAttribute("aria-label");
    expect(symbols[0].getAttribute("aria-label")).toContain("مانده اولیه");

    // Accessible table for screen readers
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    expect(screen.getByText("مانده نهایی این مرحله")).toBeInTheDocument();
  });

  it("displays formatted Persian currency for deltas and balances", () => {
    render(
      <WaterfallChart
        steps={mockSteps}
        unit="TOMAN"
      />,
    );

    // 10,000,000 IRR in Toman is 1,000,000 تومان
    // 4,000,000 IRR in Toman is 400,000 تومان
    expect(screen.getAllByText(/تومان/).length).toBeGreaterThan(0);
  });

  it("shows tooltip on hover or keyboard focus", () => {
    render(
      <WaterfallChart
        steps={mockSteps}
        label="آبشار نقدینگی"
      />,
    );

    const firstBar = screen.getAllByRole("graphics-symbol")[0];

    // Initially no tooltip
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    // Hover first bar
    fireEvent.mouseEnter(firstBar);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toBeInTheDocument();
    expect(tooltip).toHaveTextContent("مانده اولیه");
    expect(tooltip).toHaveTextContent("موجودی اولیه");
    expect(tooltip).toHaveTextContent("مانده جاری:");

    // Leave
    fireEvent.mouseLeave(firstBar);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    // Focus via keyboard
    fireEvent.focus(firstBar);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("supports keyboard navigation with arrow keys between bars", () => {
    render(
      <WaterfallChart
        steps={mockSteps}
        rtl={true}
      />,
    );

    const symbols = screen.getAllByRole("graphics-symbol");
    fireEvent.focus(symbols[0]);

    // In RTL, ArrowLeft moves to next step (index 1)
    fireEvent.keyDown(symbols[0], { key: "ArrowLeft" });
    expect(screen.getByRole("tooltip")).toHaveTextContent("درآمد فروش");

    // Escape hides tooltip
    fireEvent.keyDown(symbols[0], { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("handles empty steps gracefully", () => {
    render(<WaterfallChart steps={[]} label="نمودار خالی" />);
    expect(
      screen.getByText("داده‌ای برای نمایش در نمودار آبشاری وجود ندارد."),
    ).toBeInTheDocument();
  });
});
