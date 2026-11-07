"use client";
import { api, ApiError } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";
export function useResource<T>(
  path: string | null,
  {
    allowMissing = false,
    poll = false,
  }: {
    allowMissing?: boolean;
    poll?: boolean | ((data: T | undefined) => boolean);
  } = {},
) {
  const [snapshot, setSnapshot] = useState<{
    path: string | null;
    data?: T;
    error?: ApiError;
    loaded: boolean;
  }>({ path: null, loaded: false });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      let latest: T | undefined;
      try {
        const data = await api<T>(path, { signal: controller.signal });
        latest = data;
        if (!controller.signal.aborted)
          setSnapshot({ path, data, loaded: true });
      } catch (error) {
        if (controller.signal.aborted) return;
        const failure =
          error instanceof ApiError
            ? error
            : new ApiError(0, "اطلاعات دریافت نشد.", "unknown");
        setSnapshot({
          path,
          error: allowMissing && failure.status === 404 ? undefined : failure,
          loaded: true,
        });
      }
      if (
        (typeof poll === "function" ? poll(latest) : poll) &&
        !controller.signal.aborted
      )
        timer = setTimeout(load, 2500);
    };
    // Strict Mode replays effects before this microtask. Skip requests whose
    // consumer was already removed, while retaining aborts for real navigation.
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load();
    });
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [path, revision, allowMissing, poll]);
  const replace = useCallback((data: T) => {
    if (path) setSnapshot({ path, data, loaded: true });
  }, [path]);
  return {
    replace,
    data: snapshot.path === path ? snapshot.data : undefined,
    error: snapshot.path === path ? snapshot.error : undefined,
    loading: !!path && (snapshot.path !== path || !snapshot.loaded),
    refresh,
  };
}
