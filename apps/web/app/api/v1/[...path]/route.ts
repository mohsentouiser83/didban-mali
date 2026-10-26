import type { NextRequest } from "next/server";
export const dynamic = "force-dynamic";
const MAX_BODY = 65536;
function error(status: number, code: string, message_fa: string) {
  return Response.json(
    {
      code,
      message_fa,
      request_id: crypto.randomUUID(),
      retryable: status === 503,
      field_errors: [],
      details: [],
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (path.some((p) => !p || p === "." || p === ".." || /[\\/]/.test(p)))
    return error(404, "not_found", "مسیر پیدا نشد.");
  const upstream = new URL(
    process.env.DIDBAN_API_ORIGIN || "http://127.0.0.1:18147",
  );
  upstream.pathname = "/api/v1/" + path.map(encodeURIComponent).join("/");
  upstream.search = request.nextUrl.search;
  const headers = new Headers();
  for (const name of [
    "cookie",
    "content-type",
    "origin",
    "sec-fetch-site",
    "x-csrf-token",
    "idempotency-key",
    "if-match",
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const upload =
    request.method === "POST" &&
    path.length === 5 &&
    path[0] === "companies" &&
    path[2] === "processing-sessions" &&
    path[4] === "files";
  let oversized = false;
  try {
    let body: BodyInit | undefined;
    if (upload && request.body) {
      let received = 0;
      body = request.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            received += chunk.byteLength;
            if (received > 20971520 + 65536) {
              oversized = true;
              throw new Error("Upload limit");
            }
            controller.enqueue(chunk);
          },
        }),
      );
    } else if (request.body) {
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BODY) {
          await reader.cancel();
          return error(
            413,
            "request_too_large",
            "حجم درخواست بیش از حد مجاز است.",
          );
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      body = bytes as BodyInit;
    }
    const response = await fetch(upstream, {
      method: request.method,
      headers,
      body,
      duplex: "half",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(upload ? 300000 : 15000),
    } as RequestInit & { duplex: "half" });
    const outgoing = new Headers({ "Cache-Control": "no-store" });
    for (const name of [
      "content-type",
      "etag",
      "x-request-id",
      "retry-after",
      "content-disposition",
      "x-content-type-options",
    ]) {
      const value = response.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    for (const cookie of response.headers.getSetCookie())
      outgoing.append("set-cookie", cookie);
    return new Response(response.body, {
      status: response.status,
      headers: outgoing,
    });
  } catch {
    if (oversized)
      return error(413, "file_too_large", "حجم فایل بیش از حد مجاز است.");
    return error(
      503,
      "api_unavailable",
      "ارتباط با سامانه برقرار نیست؛ دوباره تلاش کنید.",
    );
  }
}
export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
};
