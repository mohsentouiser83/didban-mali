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

it("allows enabled cheque registration before bank input but keeps module-off blocked", () => {
  state.pathname = "/settlements/cheques";
  state.modules = { data: { items: [{ key: "settlements", label: "دریافت و پرداخت", enabled: true, available: false, status: "waiting_sources", missing_sources: [["bank"]] }] } };
  const { rerender } = render(<ModuleGate><p>cheque input</p></ModuleGate>);
  expect(screen.getByText("cheque input")).toBeVisible();
  state.modules = { data: { items: [{ key: "settlements", label: "دریافت و پرداخت", enabled: false, available: false, status: "disabled", missing_sources: [] }] } };
  rerender(<ModuleGate><p>cheque input</p></ModuleGate>);
  expect(screen.queryByText("cheque input")).not.toBeInTheDocument();
});

it("opens native bank source selection while missing proof, without weakening imported or disabled gates", () => {
  state.pathname="/reconciliation";
  const entry={key:"reconciliation",label:"تطبیق",enabled:true,available:false,status:"waiting_sources",missing_sources:[["native_bank_ledger"]],source_basis:"native_book"};
  state.modules={data:{items:[entry]}};
  const {rerender}=render(<ModuleGate><p>native source selection</p></ModuleGate>);
  expect(screen.getByText("native source selection")).toBeVisible();
  state.modules={data:{items:[{...entry,source_basis:"imported_ledger"}]}};
  rerender(<ModuleGate><p>native source selection</p></ModuleGate>);
  expect(screen.queryByText("native source selection")).not.toBeInTheDocument();
  state.modules={data:{items:[{...entry,enabled:false,status:"disabled"}]}};
  rerender(<ModuleGate><p>native source selection</p></ModuleGate>);
  expect(screen.queryByText("native source selection")).not.toBeInTheDocument();
});
it("allows primary native invoice authoring while missing invoices but preserves the off switch", () => {
 state.pathname="/receivables";
 const entry={key:"receivables",label:"مطالبات",enabled:true,available:false,status:"waiting_sources",missing_sources:[["native_service_invoices"]],source_basis:"native_invoice"};
 state.modules={data:{items:[entry]}};
 const {rerender}=render(<ModuleGate><p>native invoice authoring</p></ModuleGate>);
 expect(screen.getByText("native invoice authoring")).toBeVisible();
 state.modules={data:{items:[{...entry,enabled:false,status:"disabled"}]}};
 rerender(<ModuleGate><p>native invoice authoring</p></ModuleGate>);
 expect(screen.queryByText("native invoice authoring")).not.toBeInTheDocument();
});
