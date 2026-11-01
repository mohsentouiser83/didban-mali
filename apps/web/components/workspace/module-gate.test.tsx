import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ModuleGate } from "./module-gate";
const state = vi.hoisted(() => ({ pathname: "/employees", modules: {} as Record<string, unknown> }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@/hooks/workspace", () => ({ useWorkspace: () => ({ company: { id: "company" }, modules: state.modules }) }));
vi.mock("./page-parts", () => ({ CurrentPageHeader: () => <h1>عنوان صفحه</h1>, Panel: ({ children }: { children: React.ReactNode }) => <section>{children}</section> }));
afterEach(cleanup);
it("blocks operational content while disabled and offers module settings", () => {
  state.modules = { data: { items: [{ key: "employees", label: "حقوق", enabled: false, available: false, status: "disabled", missing_sources: [] }] } };
  render(<ModuleGate><p>private operational content</p></ModuleGate>);
  expect(screen.getByRole("heading", { level: 1 })).toBeVisible();
  expect(screen.queryByText("private operational content")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "تنظیم ماژول‌ها" })).toHaveAttribute("href", "/settings/modules");
});
it("offers documents for enabled modules without evidence", () => {
  state.modules = { data: { items: [{ key: "employees", label: "حقوق", enabled: true, available: false, status: "waiting_sources", missing_sources: [["payroll"]] }] } };
  render(<ModuleGate><p>content</p></ModuleGate>);
  expect(screen.getByText("اسناد لازم: حقوق و دستمزد")).toBeVisible();
  expect(screen.getByRole("link", { name: "بارگذاری اسناد" })).toHaveAttribute("href", "/uploads");
});
it("preserves historical report access independently of operational switches", () => {
  state.pathname = "/reports";
  state.modules = { loading: true };
  render(<ModuleGate><p>historical report</p></ModuleGate>);
  expect(screen.getByText("historical report")).toBeVisible();
});
