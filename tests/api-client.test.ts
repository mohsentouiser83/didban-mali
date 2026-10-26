import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ApiClient,
  ApiError,
  TransportError,
  command,
} from "../packages/api-client/index";
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const failure = (code: string) => ({
  code,
  message_fa: "خطای آزمون",
  request_id: crypto.randomUUID(),
  retryable: false,
  field_errors: [],
  details: [],
});
test("concurrent mutations share CSRF, preserve supplied retry key/version and keep cookies private", async () => {
  const calls: { path: string; init?: RequestInit }[] = [];
  const client = new ApiClient((async (path, init) => {
    calls.push({ path: String(path), init });
    return String(path).endsWith("csrf")
      ? json({ token: "test-signed-token" })
      : json({ ok: true });
  }) as typeof fetch);
  const key = command();
  await Promise.all([
    client.mutate("/api/v1/a", "PATCH", { name: "الف" }, key, 7),
    client.mutate("/api/v1/b", "POST", undefined, command()),
  ]);
  assert.equal(calls.filter((c) => c.path.endsWith("csrf")).length, 1);
  const mutation = calls.find((c) => c.path.endsWith("/a"))!;
  const headers = new Headers(mutation.init?.headers);
  assert.equal(headers.get("Idempotency-Key"), key.key);
  assert.equal(headers.get("If-Match"), '"v7"');
  assert.equal(headers.get("X-CSRF-Token"), "test-signed-token");
  assert.equal(mutation.init?.credentials, "same-origin");
  assert.equal(calls.find((c) => c.path.endsWith("/b"))!.init?.body, undefined);
});
test("uncertain failures never trigger automatic mutation retry", async () => {
  let attempts = 0;
  const client = new ApiClient((async (path) => {
    if (String(path).endsWith("csrf")) return json({ token: "test" });
    attempts++;
    throw new Error("network");
  }) as typeof fetch);
  await assert.rejects(
    client.mutate("/api/v1/a", "POST", {}, command()),
    TransportError,
  );
  assert.equal(attempts, 1);
});
test("auth expiry clears session state but invalid login does not redirect", async () => {
  let expired = 0;
  const client = new ApiClient(
    (async (path) =>
      String(path).endsWith("csrf")
        ? json({ token: "test" })
        : json(failure("authentication_required"), 401)) as typeof fetch,
    () => {
      expired++;
    },
  );
  await assert.rejects(client.get("/api/v1/auth/me"), ApiError);
  assert.equal(expired, 1);
  await assert.rejects(
    client.mutate(
      "/api/v1/auth/login",
      "POST",
      { email: "test@fixture.invalid", password: "wrong" },
      command(),
      undefined,
      false,
    ),
    ApiError,
  );
  assert.equal(expired, 1);
});
test("CSRF failure refreshes token only for next deliberate attempt", async () => {
  let csrf = 0,
    calls = 0;
  const client = new ApiClient((async (path) => {
    if (String(path).endsWith("csrf")) {
      csrf++;
      return json({ token: "test" });
    }
    calls++;
    return json(failure("csrf_failed"), 403);
  }) as typeof fetch);
  await assert.rejects(
    client.mutate("/api/v1/a", "POST", {}, command()),
    ApiError,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    client.mutate("/api/v1/a", "POST", {}, command()),
    ApiError,
  );
  assert.equal(csrf, 2);
});

test("multipart upload preserves browser boundary, CSRF and deliberate retry identity", async () => {
  const calls: RequestInit[] = [];
  const client = new ApiClient((async (path, init) => {
    if (String(path).endsWith("csrf")) return json({ token: "test" });
    calls.push(init!);
    return json({ id: "fixture" });
  }) as typeof fetch);
  const key = command();
  await client.upload(
    "/api/v1/companies/test/processing-sessions/test/files",
    new File(["a,b\n1,2"], "sample.csv"),
    key,
    3,
  );
  const headers = new Headers(calls[0].headers);
  assert.equal(headers.get("Content-Type"), null);
  assert.equal(headers.get("If-Match"), '"v3"');
  assert.equal(headers.get("Idempotency-Key"), key.key);
  assert.equal(headers.get("X-CSRF-Token"), "test");
  assert.ok(calls[0].body instanceof FormData);
  assert.equal(calls[0].credentials, "same-origin");
});
