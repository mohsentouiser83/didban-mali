export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

function csrfFromCookie() {
  if (typeof document === "undefined") return "";
  return decodeURIComponent(document.cookie.split("; ").find((row) => row.startsWith("didban_csrf="))?.split("=")[1] ?? "");
}

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method?.toUpperCase() ?? "GET";
  const hasFormData = options.body instanceof FormData;
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(!hasFormData ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" && method !== "HEAD" ? { "X-CSRF-Token": csrfFromCookie() } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: "ارتباط با سامانه برقرار نشد." }));
    throw new Error(body.detail ?? "خطای پیش‌بینی‌نشده");
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
