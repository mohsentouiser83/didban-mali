import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { CounterpartiesView } from "./counterparties-view";
import { ProformasView } from "./proformas-view";

let pathname = "/commercial/counterparties";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/hooks/workspace", () => ({
  useWorkspace: () => ({
    company: { id: "c1" },
    companyPath: (resource: string) => `/companies/c1/${resource}`,
  }),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api")>(),
  api: vi.fn(),
}));

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.mocked(api).mockImplementation(async (path) =>
    path.endsWith("capabilities")
      ? { can_manage_accounts: true, can_prepare: true }
      : { items: [], total: 0 },
  );
});

afterEach(() => vi.unstubAllGlobals());

it("renders an empty counterparty list and opens the create form", async () => {
  pathname = "/commercial/counterparties";
  render(<CounterpartiesView />);
  const empty = await screen.findByText("طرف‌حسابی ثبت نشده است");
  expect(empty.closest("tr")?.parentElement?.tagName).toBe("TBODY");
  fireEvent.click(await screen.findByRole("button", { name: "طرف‌حساب جدید" }));
  expect(screen.getByRole("dialog", { name: "طرف‌حساب جدید" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "کد طرف‌حساب" })).toBeVisible();
});

it("renders an empty proforma list and supports adding an independent line", async () => {
  pathname = "/commercial/proformas";
  render(<ProformasView />);
  const empty = await screen.findByText("پیش‌فاکتوری ثبت نشده است");
  expect(empty.closest("tr")?.parentElement?.tagName).toBe("TBODY");
  fireEvent.click(await screen.findByRole("button", { name: "پیش‌فاکتور جدید" }));
  fireEvent.click(screen.getByRole("button", { name: "افزودن ردیف" }));
  expect(screen.getByRole("group", { name: "ردیف ۲" })).toBeVisible();
  expect(screen.getByRole("button", { name: "صدور پیش‌فاکتور" })).toBeDisabled();
});
