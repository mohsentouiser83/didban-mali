import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import { useCollectionReminder } from "./use-collection-reminder";
const workspace = vi.hoisted(() => ({ user: { id: "u" }, company: { id: "c" }, canWrite: true,
  companyPath: (path: string) => `/companies/${workspace.company.id}/${path}` }));
vi.mock("./workspace", () => ({ useWorkspace: () => workspace }));
vi.mock("@/components/ui/sonner", () => ({ notify: { success: vi.fn() } }));
vi.mock("@/lib/api", async (original) => ({ ...(await original<typeof import("@/lib/api")>()), api: vi.fn() }));
const draft = { snapshot: { invoice_id: "invoice", manifest_id: "manifest", as_of_date: "2026-11-01" }, digest: "pinned", text: "متن پیشنهادی", external_send_available: false as const };
const writeText = vi.fn();
beforeEach(() => {
  vi.mocked(api).mockReset(); writeText.mockReset().mockResolvedValue(undefined);
  workspace.company.id = "c"; workspace.canWrite = true;
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
});
it("requires explicit copy and revalidates the exact source while preserving edited text", async () => {
  vi.mocked(api).mockResolvedValue(draft);
  const { result } = renderHook(useCollectionReminder);
  act(() => result.current.open("invoice", "manifest"));
  await waitFor(() => expect(result.current.current?.draft).toBeDefined());
  expect(writeText).not.toHaveBeenCalled();
  act(() => result.current.change("متن ویرایش‌شده"));
  await act(async () => { await result.current.copy(); });
  expect(writeText).toHaveBeenCalledWith("متن ویرایش‌شده");
  expect(api).toHaveBeenCalledTimes(2);
  expect(vi.mocked(api).mock.calls.every(([, options]) => options?.method === "GET")).toBe(true);
  expect(result.current.feedback.copied).toBe(true);
});
it("refuses copying a stale source and retains the draft for editing", async () => {
  vi.mocked(api).mockResolvedValueOnce(draft).mockRejectedValueOnce(new ApiError(409,"گزارش تغییر کرده","collection_source_changed"));
  const { result } = renderHook(useCollectionReminder);
  act(() => result.current.open("invoice", "manifest"));
  await waitFor(() => expect(result.current.current?.draft).toBeDefined());
  act(() => result.current.change("ویرایش انسانی"));
  await act(async () => { await result.current.copy(); });
  expect(writeText).not.toHaveBeenCalled();
  expect(result.current.current?.text).toBe("ویرایش انسانی");
  expect(result.current.command.error?.code).toBe("collection_source_changed");
});
it("drops an old open response after closing or changing company", async () => {
  let resolve: (value: typeof draft) => void = () => {};
  vi.mocked(api).mockImplementation(() => new Promise((done) => { resolve = done; }));
  const { result, rerender } = renderHook(useCollectionReminder);
  act(() => result.current.open("invoice", "manifest"));
  act(() => result.current.close());
  workspace.company.id = "other"; rerender();
  await act(async () => { resolve(draft); });
  expect(result.current.current).toBeNull(); expect(writeText).not.toHaveBeenCalled();
});
