"use client";
import type { ResourceList } from "@/lib/api";
import { useState } from "react";
import { useResource } from "./use-resource";
export function usePagedResource<T>(path: string | null) {
  const [state, setState] = useState<{
    path: string | null;
    index: number;
    cursors: (string | null)[];
  }>({ path: null, index: 0, cursors: [null] });
  const current =
    state.path === path ? state : { path, index: 0, cursors: [null] };
  const cursor = current.cursors[current.index];
  const resource = useResource<ResourceList<T>>(
    path
      ? `${path}${path.includes("?") ? "&" : "?"}limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`
      : null,
  );
  return {
    ...resource,
    page: current.index,
    hasPrevious: current.index > 0,
    hasNext: !!resource.data?.next_cursor,
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
