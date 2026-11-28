"use client";
import { api, ApiError, type ResourceList } from "@/lib/api";
import { useState } from "react";
import { useResource } from "./use-resource";
export function usePagedResource<T, Page extends ResourceList<T> = ResourceList<T>>(path: string | null) {
  const [state, setState] = useState<{
    path: string | null;
    index: number;
    cursors: (string | null)[];
  }>({ path: null, index: 0, cursors: [null] });
  const current =
    state.path === path ? state : { path, index: 0, cursors: [null] };
  const cursor = current.cursors[current.index];
  const resource = useResource<Page>(
    path
      ? `${path}${path.includes("?") ? "&" : "?"}limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`
      : null,
  );
  return {
    ...resource,
    page: current.index,
    hasPrevious: current.index > 0,
    hasNext: !!resource.data?.next_cursor,
    firstPage: () => setState({ path, index: 0, cursors: [null] }),
    previousPage: () =>
      setState({ ...current, index: Math.max(0, current.index - 1) }),
    nextPage: () => {
      if (resource.data?.next_cursor)
        setState({
          ...current,
          index: current.index + 1,
          cursors: [
            ...current.cursors.slice(0, current.index + 1),
            resource.data.next_cursor,
          ],
        });
    },
  };
}

export async function fetchCursorList<T extends { id: string }>(path: string, options: { signal: AbortSignal }): Promise<ResourceList<T>> {
  const items = new Map<string, T>();
  const seen = new Set<string>();
  const base = `${path}${path.includes("?") ? "&" : "?"}limit=100`;
  let cursor: string | null | undefined;
  do {
    const page: ResourceList<T> = await api(cursor ? `${base}&cursor=${encodeURIComponent(cursor)}` : base, options);
    for (const item of page.items) items.set(item.id, item);
    cursor = page.next_cursor;
    if (cursor) {
      if (seen.has(cursor)) throw new ApiError(0, "فهرست کامل دریافت نشد.", "invalid_pagination");
      seen.add(cursor);
    }
  } while (cursor && !options.signal.aborted);
  return { items: [...items.values()] };
}
