import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MoadianReconciliationPanel } from "./moadian-reconciliation-panel";

vi.mock("@/hooks/use-moadian-reconciliation", () => ({
  useMoadianReconciliation: () => ({
    workspace: { unit: "IRR" },
    summary: { invoices_count: 0, compliance_percentage: null },
    loading: false,
  }),
}));

it("shows the missing sales invoices without claiming that all were sent", () => {
  render(<MoadianReconciliationPanel />);
  expect(screen.getByRole("heading", { name: "فاکتور فروش داخلی موجود نیست" })).toBeVisible();
  expect(screen.queryByText("نرخ تمکین مالیاتی")).not.toBeInTheDocument();
  expect(screen.queryByText(/تمامی فاکتورها/)).not.toBeInTheDocument();
});
