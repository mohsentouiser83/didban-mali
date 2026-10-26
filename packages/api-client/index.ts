import type { components, operations } from "./schema";
export type Schema<N extends keyof components["schemas"]> =
  components["schemas"][N];
export type Body<N extends keyof operations> = operations[N] extends {
  requestBody: { content: { "application/json": infer B } };
}
  ? B
  : never;
export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: Schema<"Error">,
  ) {
    super(detail.message_fa);
    this.name = "ApiError";
  }
}
export class TransportError extends Error {
  constructor() {
    super("ارتباط کامل نشد؛ دوباره تلاش کنید.");
  }
}
export type Command = { key: string };
export const command = (): Command => ({ key: crypto.randomUUID() });
export class ApiClient {
  private csrfFlight?: Promise<string>;
  constructor(
    private fetcher: typeof fetch = (...args) => fetch(...args),
    private expired: () => void = () => {},
  ) {}
  reset() {
    this.csrfFlight = undefined;
  }
  private async read<T>(
    path: string,
    init: RequestInit = {},
    notify = true,
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(path, {
        ...init,
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
      });
    } catch {
      throw new TransportError();
    }
    if (!response.ok) {
      let data: Schema<"Error">;
      try {
        data = await response.json();
      } catch {
        throw new TransportError();
      }
      if (response.status === 401 && notify) {
        this.reset();
        this.expired();
      }
      throw new ApiError(response.status, data);
    }
    return response.json();
  }
  get<T>(path: string, signal?: AbortSignal) {
    return this.read<T>(path, { signal });
  }
  private csrf() {
    if (!this.csrfFlight)
      this.csrfFlight = this.read<Schema<"CsrfToken">>(
        "/api/v1/auth/csrf",
        {},
        false,
      )
        .then((r) => r.token)
        .catch((e) => {
          this.reset();
          throw e;
        });
    return this.csrfFlight;
  }
  async upload<T>(
    path: string,
    file: File,
    cmd: Command,
    version: number,
  ): Promise<T> {
    const token = await this.csrf();
    const body = new FormData();
    body.set("file", file);
    return this.read<T>(path, {
      method: "POST",
      headers: {
        "X-CSRF-Token": token,
        "Idempotency-Key": cmd.key,
        "If-Match": `"v${version}"`,
      },
      body,
    });
  }
  async mutate<T>(
    path: string,
    method: string,
    body: unknown,
    cmd: Command,
    version?: number,
    notify = true,
  ): Promise<T> {
    const token = await this.csrf();
    const headers: Record<string, string> = {
      "X-CSRF-Token": token,
      "Idempotency-Key": cmd.key,
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (version !== undefined) headers["If-Match"] = `"v${version}"`;
    try {
      return await this.read<T>(
        path,
        {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        },
        notify,
      );
    } catch (e) {
      if (e instanceof ApiError && e.detail.code === "csrf_failed")
        this.reset();
      throw e;
    }
  }
}
