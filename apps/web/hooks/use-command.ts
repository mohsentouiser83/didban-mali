"use client";
import { notify } from "@/components/ui/sonner";
import { api, ApiError } from "@/lib/api";
import { useRef, useState } from "react";
export function useCommand() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError>();
  const lock = useRef(false);
  async function run<T>(
    path: string | null,
    options: {
      method?: string;
      body?: unknown;
      version?: number;
      key?: string;
    },
    onSuccess?: (result: T) => void,
    success?: string,
  ) {
    if (!path || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const result = await api<T>(path, { method: "POST", ...options });
      onSuccess?.(result);
      if (success) notify.success(success);
      return result;
    } catch (error) {
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      setError(
        error instanceof ApiError
          ? error
          : new ApiError(0, "عملیات انجام نشد.", "unknown"),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { run, busy, error, clearError: () => setError(undefined) };
}
