"use client";
import { useState } from "react";
import type { NativeJournal } from "./use-native-journals";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";

export function useNativeJournal() {
  const workspace = useWorkspace();
  const [selected, select] = useState<string>();
  const resource = useResource<NativeJournal>(
    selected ? workspace.companyPath(`accounting/journals/${selected}`) : null,
  );
  return { selected, select, resource };
}
