import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/design-system/cashflow-chart", () => ({
  CashflowChart: () => <div aria-label="نمودار نمونه" />,
}));

import DesignSystemPage from "./page";

describe("DesignSystemPage", () => {
  it("renders the Persian RTL design-system showcase", () => {
    render(<DesignSystemPage />);

    expect(screen.getByRole("heading", { name: /تصمیم مالی، با وضوح عملیاتی/ })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "ناوبری اصلی" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "نمونه جدول تطبیق تراکنش‌ها" })).toBeInTheDocument();
  });
});
