import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ReportsView } from "./reports-view";

const state = vi.hoisted(() => ({
  workspace: { company: { id: "c" }, canWrite: true },
  resource: {}, command: { busy: false }, approving: null,
  loading: false, error: null, reports: [],
  definitions: [{ id: "builtin", name: "دفتر روزنامه", system_key: "journals" },
    { id: "custom", name: "گزارش من" }],
  openDefinition: vi.fn(), closeApproval: vi.fn(), confirmApproval: vi.fn(), refresh: vi.fn(),
}));
vi.mock("@/hooks/use-report-archive", () => ({ useReportArchive: () => state }));
vi.mock("./page-parts", () => ({
  PageHeader: ({ title, action }: { title: string; action: React.ReactNode }) => <header><h1>{title}</h1>{action}</header>,
  Panel: ({ children }: { children: React.ReactNode }) => <section>{children}</section>, NoCompany: () => null,
}));
vi.mock("@/components/ui/pagination", () => ({ CursorPagination: () => null }));

it("lists system and saved definitions in one table with accessible editing and no delete action", () => {
  render(<ReportsView />);
  const table = screen.getByRole("table");
  expect(within(table).getByRole("link", { name: "دفتر روزنامه" }))
    .toHaveAttribute("href", "/reports/studio?definition=builtin");
  expect(within(table).getByRole("link", { name: "گزارش من" })).toBeInTheDocument();
  expect(screen.queryByText("گزارش‌های ثابت سامانه")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /حذف/ })).not.toBeInTheDocument();
  fireEvent.click(within(table).getByRole("row", { name: /دفتر روزنامه/ }));
  expect(state.openDefinition).toHaveBeenCalledWith("builtin");
});
