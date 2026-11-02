import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import { useOpeningEvidence } from "./use-opening-evidence";
vi.mock("./workspace", () => ({
  useWorkspace: () => ({
    companyPath: (path: string) => `/companies/c/${path}`,
  }),
}));
vi.mock("./use-resource", () => ({
  useResource: () => ({
    data: { can_post: true, posting_available: true },
    refresh: vi.fn(),
  }),
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
});
it("zero opening requires a reason and explicit attestation and never creates a posting", async () => {
  const complete = vi.fn();
  const { result } = renderHook(() => useOpeningEvidence(complete));
  act(() => {
    result.current.openZero("p");
  });
  act(() => result.current.save());
  expect(api).not.toHaveBeenCalled();
  act(() => result.current.setReason("شرکت از صفر شروع شده"));
  act(() => result.current.save());
  expect(api).not.toHaveBeenCalled();
  act(() => result.current.setAck(true));
  act(() => result.current.save());
  await waitFor(() => expect(complete).toHaveBeenCalledOnce());
  expect(vi.mocked(api).mock.calls[0]).toEqual([
    "/companies/c/accounting/zero-opening-evidence",
    expect.objectContaining({
      body: { period_id: "p", reason: "شرکت از صفر شروع شده" },
    }),
  ]);
  expect(result.current.target).toBeNull();
});
it("binds an opening declaration to the exact final journal digest and preserves failed review", async () => {
  vi.mocked(api).mockRejectedValue(
    new ApiError(409, "نسخه تغییر کرده", "opening_digest_changed"),
  );
  const complete = vi.fn();
  const { result } = renderHook(() => useOpeningEvidence(complete));
  act(() => result.current.openJournal("journal", "a".repeat(64)));
  act(() => {
    result.current.setReason("افتتاحیه مستند");
    result.current.setAck(true);
  });
  act(() => result.current.save());
  await waitFor(() => expect(result.current.command.error?.status).toBe(409));
  expect(vi.mocked(api).mock.calls[0]).toEqual([
    "/companies/c/accounting/opening-evidence",
    expect.objectContaining({
      body: {
        journal_id: "journal",
        digest: "a".repeat(64),
        reason: "افتتاحیه مستند",
      },
    }),
  ]);
  expect(result.current.target?.id).toBe("journal");
  expect(complete).not.toHaveBeenCalled();
});
