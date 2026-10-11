import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/product-api";
import type {
  Company,
  IntegrationConnection,
  Member,
} from "@/lib/product-types";
import { MembersPanel } from "./members-panel";
import { IntegrationsWorkspace } from "./integrations-workspace";
vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
const company = { id: "company", legal_name: "شرکت", role: "owner" } as Company;
const member = {
  user_id: "other",
  full_name: "سارا",
  email: "sara@example.com",
  role: "viewer",
} as Member;
const connection = {
  id: "connection",
  provider: "sepidar",
  name: "حسابداری",
  status: "connected",
  last_sync_at: null,
  last_sync_record_count: 0,
  sync_interval_minutes: 1440,
} as IntegrationConnection;
beforeEach(() => {
  vi.mocked(api).mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});
it("adds a registered member through a drawer and sends the selected role", async () => {
  vi.mocked(api).mockResolvedValue([member]);
  render(<MembersPanel company={company} currentUserId="self" />);
  await screen.findByRole("button", { name: "سارا" });
  fireEvent.click(screen.getByRole("button", { name: "افزودن عضو" }));
  const drawer = within(screen.getByRole("dialog"));
  fireEvent.change(drawer.getByLabelText("ایمیل"), {
    target: { value: "new@example.com" },
  });
  fireEvent.click(drawer.getByLabelText("سطح دسترسی"));
  fireEvent.click(await screen.findByRole("option", { name: "مدیر مالی" }));
  fireEvent.click(drawer.getByRole("button", { name: "افزودن عضو" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/companies/company/members", {
      method: "POST",
      body: JSON.stringify({
        email: "new@example.com",
        role: "finance_manager",
      }),
    }),
  );
});
it("requires confirmation before removing another member", async () => {
  vi.mocked(api).mockResolvedValue([member]);
  render(<MembersPanel company={company} currentUserId="self" />);
  fireEvent.click(await screen.findByRole("button", { name: "سارا" }));
  fireEvent.click(screen.getByRole("button", { name: "حذف عضو" }));
  expect(
    vi
      .mocked(api)
      .mock.calls.some(([, options]) => options?.method === "DELETE"),
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "حذف" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/companies/company/members/other", {
      method: "DELETE",
    }),
  );
});
it("allows viewers to inspect members but hides management actions", async () => {
  vi.mocked(api).mockResolvedValue([member]);
  render(
    <MembersPanel
      company={{ ...company, role: "viewer" }}
      currentUserId="self"
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "سارا" }));
  expect(screen.getByLabelText("سطح دسترسی")).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "افزودن عضو" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "حذف عضو" }),
  ).not.toBeInTheDocument();
});
it("preserves an add connection form and exposes a failed request", async () => {
  vi.mocked(api).mockImplementation(async (_, options) => {
    if (options?.method === "POST") throw new Error("اتصال ثبت نشد");
    return [];
  });
  render(<IntegrationsWorkspace company={company} />);
  await screen.findByText("هنوز اتصالی ثبت نشده است.");
  fireEvent.click(screen.getByRole("button", { name: "افزودن اتصال" }));
  const drawer = within(screen.getByRole("dialog"));
  fireEvent.change(drawer.getByLabelText("نام اتصال"), {
    target: { value: "دفتر مرکزی" },
  });
  fireEvent.change(drawer.getByLabelText("آدرس سرویس سپیدار"), {
    target: { value: "https://accounting.example.com/api" },
  });
  fireEvent.change(drawer.getByLabelText("کلید دسترسی"), {
    target: { value: "test-token" },
  });
  fireEvent.click(drawer.getByRole("button", { name: "ثبت اتصال" }));
  expect(await drawer.findByRole("alert")).toHaveTextContent("اتصال ثبت نشد");
  expect(drawer.getByLabelText("نام اتصال")).toHaveValue("دفتر مرکزی");
  const call = vi
    .mocked(api)
    .mock.calls.find(([, options]) => options?.method === "POST")!;
  expect(JSON.parse(call[1]!.body as string)).toMatchObject({
    config: { server_url: "https://accounting.example.com/api" },
    credentials: { api_token: "test-token" },
  });
});
it("opening a connection never generates a key and reports a failed test inline", async () => {
  vi.mocked(api).mockImplementation(async (path) =>
    String(path).endsWith("/jobs")
      ? []
      : String(path).endsWith("/test")
        ? { success: false, message_fa: "کلید نامعتبر است" }
        : [connection],
  );
  render(<IntegrationsWorkspace company={company} />);
  fireEvent.click(await screen.findByRole("button", { name: "حسابداری" }));
  await screen.findByText("هنوز اطلاعاتی دریافت نشده است.");
  expect(
    vi
      .mocked(api)
      .mock.calls.some(([path]) => String(path).includes("agent-key")),
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "آزمایش اتصال" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "کلید نامعتبر است",
  );
});
it("viewers cannot create, sync, test, delete or obtain agent keys", async () => {
  vi.mocked(api).mockImplementation(async (path) =>
    String(path).endsWith("/jobs") ? [] : [connection],
  );
  render(<IntegrationsWorkspace company={{ ...company, role: "viewer" }} />);
  fireEvent.click(await screen.findByRole("button", { name: "حسابداری" }));
  for (const name of [
    "افزودن اتصال",
    "آزمایش اتصال",
    "دریافت اطلاعات",
    "حذف اتصال",
    "دریافت کلید همگام‌ساز",
  ])
    expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
});
