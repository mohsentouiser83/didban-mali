import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { CompanyModule } from "@/lib/company-modules";
import { ModuleGate } from "./module-gate";

let pathname = "/employee-reports";
let role = "owner";
let status: CompanyModule["status"] = "available";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/hooks/workspace", () => ({
  useWorkspace: () => ({
    company: { role },
    modules: { data: { items: [{ key: "employees", status, missing_sources: [["payroll"]] }] } },
  }),
}));

function renderGate() {
  render(<ModuleGate><p>محتوای بخش</p></ModuleGate>);
}

beforeEach(() => {
  pathname = "/employee-reports";
  role = "owner";
  status = "available";
});

it("renders an available workspace", () => {
  renderGate();
  expect(screen.getByText("محتوای بخش")).toBeInTheDocument();
});

it("distinguishes a disabled module and links owners to its settings", () => {
  status = "disabled";
  renderGate();
  expect(screen.getByText("این ماژول برای شرکت خاموش است")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "مدیریت ماژول‌ها" })).toHaveAttribute("href", "/settings/modules");
  expect(screen.queryByText("محتوای بخش")).not.toBeInTheDocument();
});

it("keeps historical reports accessible when a company module is off", () => {
  status = "disabled";
  pathname = "/reports";
  renderGate();
  expect(screen.getByText("محتوای بخش")).toBeInTheDocument();
});

it("lets the employee report request check current sources", () => {
  status = "waiting_sources";
  role = "viewer";
  renderGate();
  expect(screen.getByText("محتوای بخش")).toBeInTheDocument();
});

it("leaves native payroll available for preparation when imported sources are missing", () => {
  status = "waiting_sources";
  pathname = "/payroll";
  renderGate();
  expect(screen.getByText("محتوای بخش")).toBeInTheDocument();
});
