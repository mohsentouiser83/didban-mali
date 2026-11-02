import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import { usePosting, type PostingPreview } from "./use-posting";
vi.mock("./workspace", () => ({
  useWorkspace: () => ({
    companyPath: (path: string) => `/companies/c/${path}`,
  }),
}));
vi.mock("@/components/ui/sonner", () => ({ notify: { success: vi.fn() } }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));
const preview = (id: string): PostingPreview => ({
  draft_id: id,
  expected_version: 3,
  digest: "a".repeat(64),
  total_debit: "9007199254740993",
  total_credit: "9007199254740993",
  snapshot: {
    description: id,
    date: "2026-11-02",
    lines: [
      {
        account_id: "1",
        code: "001",
        name: "مطالبات",
        party_id: "p",
        debit: "9007199254740993",
        credit: "0",
      },
      {
        account_id: "2",
        code: "002",
        name: "درآمد",
        party_id: "p",
        debit: "0",
        credit: "9007199254740993",
      },
    ],
  },
});
beforeEach(() => {vi.mocked(api).mockReset();});
it("reviews all selected exact versions before one explicit batch confirmation and preserves exact totals", async () => {
  const complete = vi.fn();
  vi.mocked(api).mockImplementation(async (path) =>
    path.endsWith("/postings")
      ? { items: [] }
      : preview(path.split("/").at(-2)!),
  );
  const { result } = renderHook(() => usePosting(complete));
  await act(() => result.current.review(["one", "two"]));
  expect(result.current.total).toBe("18014398509481986");
  expect(complete).not.toHaveBeenCalled();
  expect(
    vi.mocked(api).mock.calls.every(([path]) => !path.endsWith("/postings")),
  ).toBe(true);
  act(() => result.current.post());
  await waitFor(() => expect(complete).toHaveBeenCalledOnce());
  expect(vi.mocked(api).mock.calls.at(-1)).toEqual([
    "/companies/c/accounting/postings",
    expect.objectContaining({
      body: {
        items: ["one", "two"].map((draft_id) => ({
          draft_id,
          expected_version: 3,
          digest: "a".repeat(64),
        })),
      },
    }),
  ]);
  await waitFor(() => expect(result.current.reviews).toEqual([]));
});
it("failed preview of one member cannot leave a partially confirmable batch", async () => {
  vi.mocked(api).mockImplementation(async (path) => {
    if (path.includes("/two/"))
      throw new ApiError(409, "نسخه تغییر کرده", "version_conflict");
    return preview("one");
  });
  const { result } = renderHook(() => usePosting(vi.fn()));
  await act(() => result.current.review(["one", "two"]));
  expect(result.current.reviews).toEqual([]);
  expect(result.current.error?.status).toBe(409);
  act(() => result.current.post());
  expect(
    vi.mocked(api).mock.calls.some(([path]) => path.endsWith("/postings")),
  ).toBe(false);
});
it("stale confirmation preserves reviewed content and exposes server rejection without claiming success", async () => {
  const complete = vi.fn();
  vi.mocked(api).mockImplementation(async (path) => {
    if (path.endsWith("/postings"))
      throw new ApiError(409, "نسخه تغییر کرده", "posting_preview_changed");
    return preview("one");
  });
  const { result } = renderHook(() => usePosting(complete));
  await act(() => result.current.review(["one"]));
  act(() => result.current.post());
  await waitFor(() =>
    expect(result.current.command.error?.code).toBe("posting_preview_changed"),
  );
  expect(result.current.reviews).toHaveLength(1);
  expect(complete).not.toHaveBeenCalled();
});
