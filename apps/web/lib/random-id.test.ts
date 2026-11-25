import { afterEach, describe, expect, it, vi } from "vitest";
import { randomId } from "./random-id";
import { api } from "./api";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("randomId", () => {
  it("uses the browser UUID API when available", () => {
    const id = "c02f3d55-345d-4a38-a3f5-268953cc9938";
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(id);
    expect(randomId()).toBe(id);
  });

  it("generates distinct v4 UUIDs without randomUUID on HTTP LAN origins", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
    });
    const ids = Array.from({ length: 32 }, randomId);
    for (const id of ids) {
      expect(id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("sends login requests with an idempotency key on HTTP LAN origins", async () => {
    vi.stubGlobal("crypto", {
      getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: { id: "test-user" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await api("/auth/login", { method: "POST", body: { email: "test@example.invalid", password: "test" } });

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/login", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "Idempotency-Key": expect.stringMatching(/^[\da-f-]{36}$/) }),
    }));
  });
});
