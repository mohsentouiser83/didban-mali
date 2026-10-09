import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/product-api";
import { DashboardControlSummary } from "./dashboard-control-summary";

vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
beforeEach(() => vi.mocked(api).mockReset());

it("provides recovery when the control summary cannot load", async () => {
  vi.mocked(api).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({
    critical_count: 1, high_count: 2, total_active_count: 5, resolved_count: 1, verified_count: 1, recent_activities: [],
  });
  render(<DashboardControlSummary companyId="example" />);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
  expect(await screen.findByText(/۳ مورد فوری/)).toHaveTextContent("۵ یافته باز");
  expect(screen.getByRole("link", { name: "کارهای من" })).toHaveAttribute("href", "/companies/example/actions");
});

it("retains financial monitoring on the dashboard and refreshes its summary", async () => {
  const overview = { critical_count: 1, high_count: 2, total_active_count: 5, resolved_count: 1, verified_count: 1, recent_activities: [] };
  vi.mocked(api).mockResolvedValueOnce(overview).mockResolvedValueOnce({ findings_detected: 3 }).mockResolvedValueOnce(overview);
  render(<DashboardControlSummary companyId="example" />);
  await screen.findByText(/۳ مورد فوری/);
  fireEvent.click(screen.getByRole("button", { name: "اجرای پایش" }));
  expect(await screen.findByRole("status")).toHaveTextContent("۳ مورد ارزیابی شد");
  expect(api).toHaveBeenCalledWith("/companies/example/findings/detect", { method: "POST", body: JSON.stringify({ trigger_type: "manual" }) });
});
