import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async (path) =>
    path.endsWith("capabilities")
      ? { can_manage_accounts: true, can_prepare: true }
      : { items: [], total: 0 },
  );
});

afterEach(() => vi.unstubAllGlobals());

it("creates a counterparty without requesting or sending a manual code", async () => {
  pathname = "/commercial/counterparties";
  render(<CounterpartiesView />);
  const empty = await screen.findByText("طرف‌حسابی ثبت نشده است");
  expect(empty.closest("tr")?.parentElement?.tagName).toBe("TBODY");
  fireEvent.click(await screen.findByRole("button", { name: "طرف‌حساب جدید" }));
  expect(screen.getByRole("dialog", { name: "طرف‌حساب جدید" })).toBeVisible();
  expect(screen.queryByRole("textbox", { name: "کد طرف‌حساب" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: /^نام$/ }), {
    target: { value: "مشتری جدید" },
  });
  expect(screen.getByRole("button", { name: /^ذخیره$/ })).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("combobox", { name: /نوع شخصیت/ }), { key: "Enter" });
  expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
    "حقیقی", "حقوقی", "سایر",
  ]);
  fireEvent.click(screen.getByRole("option", { name: "حقوقی" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "مشتری" }));
  fireEvent.click(screen.getByRole("button", { name: /^ذخیره$/ }));
  await waitFor(() => expect(api).toHaveBeenCalledWith(
    "/companies/c1/commercial/counterparties",
    expect.objectContaining({
      method: "POST",
      body: expect.objectContaining({ name: "مشتری جدید", type: "customer", entity_kind: "legal_entity", roles: ["customer"] }),
    }),
  ));
  const creation = vi.mocked(api).mock.calls.find(([, options]) => options?.method === "POST");
  expect(creation?.[1]?.body).not.toHaveProperty("code");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
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
