import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { useBotNotificationPreferences } from "./use-bot-notifications";
vi.mock("./workspace", () => ({
  useWorkspace: () => ({
    companyPath: (path: string) => `/companies/test/${path}`,
  }),
}));
const settings = vi.hoisted(() => ({
  provider: "telegram",
  version: 3,
  enabled: false,
  events: [] as string[],
  quiet_enabled: false,
  quiet_start: "22:00",
  quiet_end: "08:00",
  summary_time: "09:00",
  connected: true,
  configured: false,
  binding_current: true,
  timezone: "Asia/Tehran",
}));
vi.mock("./use-resource", () => ({
  useResource: () => ({ data: { items: [settings] }, refresh: vi.fn() }),
}));
vi.mock("./use-paged-resource", () => ({
  usePagedResource: () => ({ data: { items: [] }, refresh: vi.fn() }),
}));
vi.mock("@/components/ui/sonner", () => ({ notify: { success: vi.fn() } }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(api).mockReset().mockResolvedValue({});
  settings.version = 3;
});
it("requires opt-in event and submits only personal preference settings", async () => {
  const { result } = renderHook(useBotNotificationPreferences);
  const pref = result.current.cards[0];
  act(() => result.current.change(pref, { enabled: true }));
  expect(result.current.cards[0].invalidEvents).toBe(true);
  act(() => result.current.save(pref));
  expect(vi.mocked(api)).not.toHaveBeenCalled();
  act(() => result.current.toggle(pref, "report_ready", true));
  expect(result.current.cards[0].invalidEvents).toBe(false);
  act(() => result.current.save(result.current.cards[0]));
  await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledOnce());
  expect(vi.mocked(api).mock.calls[0]).toEqual([
    "/companies/test/bot-notifications/telegram",
    expect.objectContaining({
      method: "PATCH",
      version: 3,
      body: {
        enabled: true,
        events: ["report_ready"],
        quiet_enabled: false,
        quiet_start: "22:00",
        quiet_end: "08:00",
        summary_time: "09:00",
      },
    }),
  ]);
});
it("discards stale edits when a newer preference version arrives", () => {
  const { result, rerender } = renderHook(useBotNotificationPreferences);
  act(() =>
    result.current.change(result.current.cards[0], { summary_time: "16:00" }),
  );
  expect(result.current.cards[0].value.summary_time).toBe("16:00");
  settings.version = 4;
  rerender();
  expect(result.current.cards[0].value.summary_time).toBe("09:00");
});
