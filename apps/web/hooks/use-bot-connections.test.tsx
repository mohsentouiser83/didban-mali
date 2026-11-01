import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import { useBotConnections } from "./use-bot-connections";
import type { BotConnection, BotConnections } from "@/lib/bot-connections";
const workspace = vi.hoisted(() => ({ company: { id: "company-a", name: "الف" }, user: { id: "user-a" } }));
vi.mock("./workspace", () => ({ useWorkspace: () => workspace }));
vi.mock("@/lib/api", async (original) => ({ ...(await original<typeof import("@/lib/api")>()), api: vi.fn() }));
const empty: BotConnections = { providers: { telegram: { configured: true, username: "didban_test_bot" }, bale: { configured: false } }, items: [] };
function connection(state: BotConnection["state"] = "pending"): BotConnection {
  return { id: "link-1", provider: "telegram", state, version: state === "pending" ? 1 : 2,
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 300000).toISOString(), sender_id: "77", chat_id: "77" };
}
beforeEach(() => {
  vi.mocked(api).mockReset();
  workspace.company = { id: "company-a", name: "الف" }; workspace.user = { id: "user-a" };
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
});
afterEach(() => vi.useRealTimers());
it("keeps the pairing code in memory, copies the start command, and confirms the server identity/version", async () => {
  let data = empty;
  vi.mocked(api).mockImplementation(async (_path, options) => {
    if (options?.method === "POST" && options.body) {
      const item = connection(); data = { ...empty, items: [item] }; return { ...item, pairing_code: "secret-code" };
    }
    if (options?.method === "POST") { data = { ...empty, items: [connection("active")] }; return connection("active"); }
    return data;
  });
  const { result } = renderHook(useBotConnections);
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(() => result.current.create("telegram"));
  expect(result.current.cards[0].pairingCommand).toBe("/start secret-code");
  expect(result.current.cards[0].botUrl).toBe("https://t.me/didban_test_bot?start=secret-code");
  await act(() => result.current.copy("telegram"));
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith("/start secret-code");
  expect(result.current.cards[0].copied).toBe(true);
  data = { ...empty, items: [connection("awaiting_confirmation")] };
  act(() => result.current.refresh());
  await waitFor(() => expect(result.current.cards[0].pending?.state).toBe("awaiting_confirmation"));
  expect(result.current.cards[0].pairingCommand).toBeUndefined();
  await act(() => result.current.confirm(result.current.cards[0].pending!));
  expect(vi.mocked(api).mock.calls.some(([path, options]) => path.endsWith("/link-1/confirm") && options?.version === 2)).toBe(true);
  await waitFor(() => expect(result.current.cards[0].active?.state).toBe("active"));
});
it("rejects stale create completions after company/session changes and clears the original code", async () => {
  let resolve!: (value: unknown) => void;
  vi.mocked(api).mockImplementation(async (_path, options) => options?.method === "POST"
    ? new Promise((done) => { resolve = done; }) : empty);
  const { result, rerender } = renderHook(useBotConnections);
  await waitFor(() => expect(result.current.loading).toBe(false));
  let request!: Promise<unknown>;
  act(() => { request = result.current.create("telegram"); });
  workspace.company = { id: "company-b", name: "ب" };
  rerender();
  expect(result.current.busy).toBe(false);
  expect(result.current.cards[0].pairingCommand).toBeUndefined();
  await act(async () => { resolve({ ...connection(), pairing_code: "old-company-secret" }); await request; });
  expect(result.current.cards[0].pairingCommand).toBeUndefined();
  expect(result.current.operationError).toBeUndefined();
  workspace.user = { id: "user-b" }; rerender();
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.scopeKey).toBe("user-b:company-b");
});
it("reports clipboard and revoke failures without discarding the active connection", async () => {
  const item = connection("active");
  vi.mocked(api).mockImplementation(async (_path, options) => {
    if (options?.method === "DELETE") throw new ApiError(409, "اطلاعات اتصال را تازه کنید.", "version_conflict");
    return { ...empty, items: [item] };
  });
  const { result } = renderHook(useBotConnections);
  await waitFor(() => expect(result.current.loading).toBe(false));
  let success: boolean | undefined;
  await act(async () => { success = await result.current.revoke(item); });
  expect(success).toBe(false);
  expect(result.current.operationError?.code).toBe("version_conflict");
  expect(result.current.cards[0].active?.id).toBe(item.id);
});
it("polls pending links without restarting requests each render and expires the copy command", async () => {
  vi.useFakeTimers();
  const item = { ...connection(), expires_at: new Date(Date.now() + 4000).toISOString() };
  let data = empty;
  vi.mocked(api).mockImplementation(async (_path, options) => {
    if (options?.method === "POST") { data = { ...empty, items: [item] }; return { ...item, pairing_code: "expiring" }; }
    return data;
  });
  const { result } = renderHook(useBotConnections);
  await act(async () => { await Promise.resolve(); });
  await act(() => result.current.create("telegram"));
  expect(result.current.cards[0].pairingCommand).toBe("/start expiring");
  const calls = vi.mocked(api).mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(vi.mocked(api).mock.calls.length).toBe(calls);
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(result.current.cards[0].expired).toBe(true);
  expect(result.current.cards[0].pairingCommand).toBeUndefined();
  expect(vi.mocked(api).mock.calls.length).toBeGreaterThan(calls);
});
it("clears pairing codes on user change and exposes clipboard permission failures locally", async () => {
  let data = empty;
  vi.mocked(api).mockImplementation(async (_path, options) => {
    if (options?.method === "POST") {
      const item = connection(); data = { ...empty, items: [item] }; return { ...item, pairing_code: "single-use" };
    }
    return data;
  });
  vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error("denied"));
  const { result, rerender } = renderHook(useBotConnections);
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(() => result.current.create("telegram"));
  await act(() => result.current.copy("telegram"));
  expect(result.current.operationError?.code).toBe("clipboard_denied");
  expect(result.current.cards[0].copied).toBe(false);
  workspace.user = { id: "user-b" }; rerender();
  expect(result.current.cards[0].pairingCommand).toBeUndefined();
  expect(result.current.operationError).toBeUndefined();
  await waitFor(() => expect(result.current.loading).toBe(false));
  workspace.user = { id: "user-a" }; rerender();
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.cards[0].pairingCommand).toBeUndefined();
});
it("does not construct an external link from an invalid configured username", async () => {
  let data = { ...empty, providers: { ...empty.providers, telegram: { configured: true, username: "evil.example/path" } } };
  vi.mocked(api).mockImplementation(async (_path, options) => {
    if (options?.method === "POST") { const item = connection(); data = { ...data, items: [item] }; return { ...item, pairing_code: "local-code" }; }
    return data;
  });
  const { result } = renderHook(useBotConnections);
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(() => result.current.create("telegram"));
  expect(result.current.cards[0].pairingCommand).toBe("/start local-code");
  expect(result.current.cards[0].botUrl).toBeUndefined();
  expect(result.current.cards[0].remainingMinutes).toBe(5);
});
