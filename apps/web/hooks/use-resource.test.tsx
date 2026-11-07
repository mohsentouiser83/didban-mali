import { StrictMode, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import { useResource } from "./use-resource";

vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));
beforeEach(() => vi.mocked(api).mockReset());

it("starts one request during Strict Mode replay and aborts on real unmount", async () => {
  vi.mocked(api).mockResolvedValue({ id: "current" });
  const { result, unmount } = renderHook(() => useResource<{ id: string }>("/report"), {
    wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>,
  });
  await waitFor(() => expect(result.current.data?.id).toBe("current"));
  expect(api).toHaveBeenCalledTimes(1);
  const signal = vi.mocked(api).mock.calls[0][1]?.signal;
  expect(signal?.aborted).toBe(false);
  unmount();
  expect(signal?.aborted).toBe(true);
});

it("keeps empty content successful and preserves real API errors", async () => {
  vi.mocked(api).mockResolvedValueOnce(undefined);
  const { result, rerender } = renderHook(({ path }) => useResource(path, { allowMissing: true }), {
    initialProps: { path: "/optional-report" },
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data).toBeUndefined();
  expect(result.current.error).toBeUndefined();
  vi.mocked(api).mockRejectedValueOnce(new ApiError(403, "اجازه ندارید.", "permission_denied"));
  rerender({ path: "/forbidden-report" });
  await waitFor(() => expect(result.current.error?.status).toBe(403));
});

it("discards a late response after changing company", async () => {
  let finishOld!: (value: unknown) => void;
  vi.mocked(api).mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }));
  vi.mocked(api).mockResolvedValueOnce({ id: "company-b" });
  const { result, rerender } = renderHook(({ path }) => useResource<{ id: string }>(path), {
    initialProps: { path: "/companies/a/report" },
  });
  await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
  const oldSignal = vi.mocked(api).mock.calls[0][1]?.signal;
  rerender({ path: "/companies/b/report" });
  expect(oldSignal?.aborted).toBe(true);
  await waitFor(() => expect(result.current.data?.id).toBe("company-b"));
  await act(async () => finishOld({ id: "company-a" }));
  expect(result.current.data?.id).toBe("company-b");
});
