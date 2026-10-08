import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SimulationWorkspace } from "./simulation-workspace";
import { api } from "@/lib/product-api";

const navigation = vi.hoisted(() => ({ query: "", push: vi.fn() }));
vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.query),
  useRouter: () => ({ push: navigation.push }),
  usePathname: () => "/companies/example/scenarios",
}));
vi.mock("./save-scenario-dialog", () => ({ SaveScenarioDialog: () => null }));
vi.mock("./decision-memo-dialog", () => ({ DecisionMemoDialog: () => null }));
const company = { id: "example", legal_name: "شرکت نمونه", currency: "IRR", created_at: "2026-10-08" };
beforeEach(() => { navigation.query = ""; navigation.push.mockClear(); vi.mocked(api).mockReset(); });

it("shows a recoverable calculation error and prevents exporting an unavailable result", async () => {
  vi.mocked(api).mockImplementation(async (path) => {
    if (path.endsWith("/run")) throw new Error("داده‌ها دریافت نشد");
    return { items: [] };
  });
  render(<SimulationWorkspace company={company} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("داده‌ها دریافت نشد");
  expect(screen.getByRole("button", { name: /صدور یادداشت تصمیم/ })).toBeDisabled();
  expect(screen.getByRole("button", { name: "ذخیره این سناریو" })).toBeDisabled();
  const calls = vi.mocked(api).mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
  await screen.findByRole("alert");
  expect(vi.mocked(api).mock.calls.length).toBe(calls + 1);
});

it("keeps saved scenarios separate from comparison and retains query context", async () => {
  navigation.query = "tab=saved&period=2026-10";
  vi.mocked(api).mockImplementation(async (path) => path.endsWith("/run") ? Promise.reject(new Error("offline")) : { items: [] });
  const { rerender } = render(<SimulationWorkspace company={company} />);
  await screen.findByText("سناریوهای ذخیره‌شده");
  expect(screen.queryByText("ماتریس مقایسه جامع سناریوها")).not.toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "مقایسه سناریوها" }), { button: 0 });
  expect(navigation.push).toHaveBeenCalledWith("/companies/example/scenarios?tab=matrix&period=2026-10", { scroll: false });
  vi.mocked(api).mockImplementation(async (path) => path.endsWith("/matrix") ? { columns: [] } : { items: [] });
  navigation.query = "tab=matrix&period=2026-10";
  rerender(<SimulationWorkspace company={company} />);
  expect(screen.getByText("ماتریس مقایسه جامع سناریوها")).toBeVisible();
});
