export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

function csrfFromCookie() {
  if (typeof document === "undefined") return "";
  return decodeURIComponent(
    document.cookie
      .split("; ")
      .find((row) => row.startsWith("didban_csrf="))
      ?.split("=")[1] ?? ""
  );
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function attemptTokenRefresh(): Promise<boolean> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }
  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfFromCookie(),
        },
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method?.toUpperCase() ?? "GET";
  const hasFormData = options.body instanceof FormData;

  const makeRequest = async () => {
    return fetch(`${API_URL}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        ...(!hasFormData ? { "Content-Type": "application/json" } : {}),
        ...(method !== "GET" && method !== "HEAD" ? { "X-CSRF-Token": csrfFromCookie() } : {}),
        ...options.headers,
      },
    });
  };

  let response = await makeRequest();

  if (response.status === 401 && !path.startsWith("/auth/login") && !path.startsWith("/auth/refresh")) {
    const refreshed = await attemptTokenRefresh();
    if (refreshed) {
      response = await makeRequest();
    }
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: "ارتباط با سامانه برقرار نشد." }));
    throw new Error(body.detail ?? "خطای پیش‌بینی‌نشده");
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
