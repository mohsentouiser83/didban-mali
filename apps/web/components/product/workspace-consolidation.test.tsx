import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/product-api";
import { DataReadinessSummary } from "./data-readiness-summary";
import { DashboardControlSummary } from "./dashboard-control-summary";
import AnalysisPage from "@/app/(workspace)/companies/[companyId]/analysis/page";
import AlertsPage from "@/app/(workspace)/companies/[companyId]/alerts/page";
import ControlPage from "@/app/(workspace)/companies/[companyId]/control/page";
import PoliciesPage from "@/app/(workspace)/companies/[companyId]/control/policies/page";
import AutomationsPage from "@/app/(workspace)/companies/[companyId]/automations/page";
import IntegrationsPage from "@/app/(workspace)/companies/[companyId]/integrations/page";
import ReadinessPage from "@/app/(workspace)/companies/[companyId]/readiness/page";
import SimulationPage from "@/app/(workspace)/companies/[companyId]/simulation/page";

vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(url); } }));
beforeEach(() => vi.mocked(api).mockReset());

it.each([
  [AnalysisPage, "reports/analysis"], [AlertsPage, "findings"], [ControlPage, "overview"],
  [PoliciesPage, "settings/financial-controls/policies"], [AutomationsPage, "settings/financial-controls/automations"],
  [IntegrationsPage, "data/connections"], [ReadinessPage, "data"], [SimulationPage, "scenarios"],
])("keeps saved links in the same company and preserves query values", async (Page, target) => {
  let location = "";
  try { await Page({ params: Promise.resolve({ companyId: "example" }), searchParams: Promise.resolve({ period: "2026-10", filter: ["open", "critical"] }) }); }
  catch (error) { location = (error as Error).message; }
  const url = new URL(location, "http://localhost");
  expect(url.pathname).toBe(`/companies/example/${target}`);
  expect(url.searchParams.get("period")).toBe("2026-10");
  expect(url.searchParams.getAll("filter")).toEqual(["open", "critical"]);
  if (Page === AlertsPage) expect(url.searchParams.get("tab")).toBe("alerts");
  if (Page === ReadinessPage) expect(url.searchParams.get("setup")).toBe("open");
});

it("keeps setup collapsed and only fetches company readiness", async () => {
  vi.mocked(api).mockResolvedValue({ completed_steps: 1, total_steps: 2, journey: [
    { id: "analysis", state: "missing", href: "/companies/example/reports/analysis", detail_fa: "یک دوره را محاسبه کنید" },
  ] });
  const { container } = render(<DataReadinessSummary companyId="example" />);
  fireEvent.click(await screen.findByText(/آمادگی فرآیندهای مالی/));
  expect(container.querySelector("details")).toHaveAttribute("open");
  expect(screen.getByRole("link", { name: /محاسبه صورت‌های مالی/ })).toHaveAttribute("href", "/companies/example/reports/analysis");
  expect(api).toHaveBeenCalledExactlyOnceWith("/companies/example/readiness");
});

it("opens the setup checklist for old readiness links", async () => {
  vi.mocked(api).mockResolvedValue({ completed_steps: 0, total_steps: 2, journey: [] });
  const { container } = render(<DataReadinessSummary companyId="example" expanded />);
  await screen.findByText(/آمادگی فرآیندهای مالی/);
  expect(container.querySelector("details")).toHaveAttribute("open");
});

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

it.each([
  [AlertsPage, "findings", "findings?tab=findings"],
  [AlertsPage, "simulation", "scenarios"],
  [SimulationPage, "alerts", "findings?tab=alerts"],
])("retains the selected view from legacy tabbed workspaces", async (Page, tab, target) => {
  await expect(Page({ params: Promise.resolve({ companyId: "example" }), searchParams: Promise.resolve({ tab }) })).rejects.toThrow(`/companies/example/${target}`);
});
