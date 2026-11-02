import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { usePeriodLock } from "./use-period-lock";
const checklist = vi.hoisted(() => ({
  closed: false,
  version: 4,
  can_close: true,
  can_reopen: true,
  draft_count: 0,
  active_session_count: 0,
  errors: [],
  warnings: [{ id: "w", title: "منبع ناقص", code: "missing" }],
  ready_to_close: true,
  manifest_id: null,
  checklist_digest: undefined as string | undefined,
}));
vi.mock("./workspace", () => ({
  useWorkspace: () => ({
    companyPath: (path: string) => `/companies/test/${path}`,
  }),
}));
vi.mock("./use-resource", () => ({
  useResource: () => ({ data: checklist, refresh: vi.fn() }),
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
  checklist.closed = false;
  checklist.checklist_digest = undefined;
  checklist.can_close = true;
  checklist.can_reopen = true;
  checklist.ready_to_close = true;
});
it("requires reason and explicit warning acknowledgement before close", async () => {
  const { result } = renderHook(() => usePeriodLock("p"));
  expect(result.current.disabled).toBe(true);
  act(() => result.current.setReason("بازبینی دوره"));
  expect(result.current.disabled).toBe(true);
  act(() => result.current.setAck(true));
  expect(result.current.disabled).toBe(false);
  act(() => result.current.transition());
  await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledOnce());
  expect(vi.mocked(api).mock.calls[0]).toEqual([
    "/companies/test/financial-periods/p/close",
    expect.objectContaining({
      version: 4,
      body: { reason: "بازبینی دوره", acknowledge_warnings: true },
    }),
  ]);
});
it("disables operation after effective permission revocation and blocks source errors", () => {
  const { result, rerender } = renderHook(() => usePeriodLock("p"));
  act(() => {
    result.current.setReason("دلیل");
    result.current.setAck(true);
  });
  checklist.ready_to_close = false;
  rerender();
  expect(result.current.disabled).toBe(true);
  checklist.closed = true;
  checklist.can_reopen = false;
  rerender();
  expect(result.current.disabled).toBe(true);
  act(() => result.current.transition());
  expect(vi.mocked(api)).not.toHaveBeenCalled();
});

it("binds warning acceptance to the exact financial checklist source", () => {
  checklist.checklist_digest = "source-a";
  const { result, rerender } = renderHook(() => usePeriodLock("p"));
  act(() => {
    result.current.setReason("بررسی مبنا");
    result.current.setAck(true);
  });
  expect(result.current.disabled).toBe(false);
  checklist.checklist_digest = "source-b";
  rerender();
  expect(result.current.ack).toBe(false);
  expect(result.current.disabled).toBe(true);
  act(() => result.current.setAck(true));
  expect(result.current.disabled).toBe(false);
});
