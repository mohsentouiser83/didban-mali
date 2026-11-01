import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import { useFloatingAssistant } from "./use-floating-assistant";
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/hooks/workspace", () => ({
  useWorkspace: () => ({
    company: { id: "company-a" },
    unit: "IRR",
    companyPath: (resource: string) => `/companies/company-a/${resource}`,
  }),
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(api).mockReset();
  replace.mockReset();
});
it("retries the same question against the same immutable manifest and request key without duplicating user messages", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce({ id: "manifest-1" })
    .mockRejectedValueOnce(
      new ApiError(0, "ارتباط برقرار نشد.", "network_error"),
    )
    .mockResolvedValueOnce({
      answer: "پاسخ ثبت‌شده",
      facts: [{ metric_key: "cash", value: "0", label: "نقد" }],
      manifest_id: "manifest-1",
    });
  const { result } = renderHook(useFloatingAssistant);
  act(() => result.current.setDraft("مانده نقد چقدر است؟"));
  act(() => {
    result.current.send();
    result.current.send();
  });
  await waitFor(() =>
    expect(result.current.messages[1]?.error).toBe("ارتباط برقرار نشد."),
  );
  expect(result.current.messages).toHaveLength(2);
  const replyId = result.current.messages[1].id;
  act(() => result.current.retry(replyId));
  await waitFor(() =>
    expect(result.current.messages[1]?.reply?.facts?.[0].value).toBe("0"),
  );
  const posts = vi
    .mocked(api)
    .mock.calls.filter(([, options]) => options?.method === "POST");
  expect(posts).toHaveLength(2);
  expect(posts[0][1]?.body).toEqual({
    manifest_id: "manifest-1",
    question: "مانده نقد چقدر است؟",
    history: [],
  });
  expect(posts[1][1]?.body).toEqual(posts[0][1]?.body);
  expect(posts[1][1]?.key).toBe(posts[0][1]?.key);
  expect(result.current.messages).toHaveLength(2);
});
it("clears financial conversation and closes the floating panel when the session expires", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce({ id: "manifest-1" })
    .mockRejectedValueOnce(
      new ApiError(401, "دوباره وارد شوید.", "session_expired"),
    );
  const { result } = renderHook(useFloatingAssistant);
  act(() => {
    result.current.setOpen(true);
    result.current.setDraft("مطالبات؟");
  });
  act(() => result.current.send());
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  expect(result.current.messages).toEqual([]);
  expect(result.current.open).toBe(false);
});
it("lets the server answer a greeting when an authorized company has no report yet", async () => {
  vi.mocked(api)
    .mockRejectedValueOnce(new ApiError(404, "گزارش پیدا نشد.", "not_found"))
    .mockResolvedValueOnce({
      answer: "سلام، چه کمکی می‌توانم بکنم؟",
      facts: [],
      manifest_id: null,
      mode: "facts",
    });
  const { result } = renderHook(useFloatingAssistant);
  act(() => result.current.setDraft("سلام"));
  act(() => result.current.send());
  await waitFor(() =>
    expect(result.current.messages[1]?.text).toBe(
      "سلام، چه کمکی می‌توانم بکنم؟",
    ),
  );
  expect(vi.mocked(api).mock.calls[1][1]?.body).toEqual({
    manifest_id: null,
    question: "سلام",
    history: [],
  });
  expect(result.current.messages[1]?.error).toBeUndefined();
  expect(result.current.messages[1]?.reply?.facts).toEqual([]);
});
it("includes prior conversation when continuing free chat without a report", async () => {
  vi.mocked(api)
    .mockRejectedValueOnce(new ApiError(404, "گزارش پیدا نشد.", "not_found"))
    .mockResolvedValueOnce({ answer: "سلام! چطوری؟", mode: "chat", facts: [] })
    .mockRejectedValueOnce(new ApiError(404, "گزارش پیدا نشد.", "not_found"))
    .mockResolvedValueOnce({ answer: "خوشحالم!", mode: "chat", facts: [] });
  const { result } = renderHook(useFloatingAssistant);
  act(() => result.current.setDraft("سلام خوبی چه خبر؟"));
  act(() => result.current.send());
  await waitFor(() => expect(result.current.busy).toBe(false));
  act(() => result.current.setDraft("منم خوبم"));
  act(() => result.current.send());
  await waitFor(() => expect(result.current.messages[3]?.text).toBe("خوشحالم!"));
  expect(vi.mocked(api).mock.calls[3][1]?.body).toEqual({
    manifest_id: null,
    question: "منم خوبم",
    history: [
      { role: "user", text: "سلام خوبی چه خبر؟" },
      { role: "assistant", text: "سلام! چطوری؟" },
    ],
  });
});
