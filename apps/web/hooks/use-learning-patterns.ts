"use client";
import { useState } from "react";
import { useWorkspace } from "./workspace";
import { useResource } from "./use-resource";
import { usePagedResource } from "./use-paged-resource";
import { useCommand } from "./use-command";
import {
  mappingLabel,
  type LearningCandidate,
  type LearningPattern,
} from "@/lib/automation";
export function useLearningPatterns() {
  const workspace = useWorkspace();
  const scope = workspace.company?.id || "";
  const base = workspace.companyPath("automation");
  const capabilities = useResource<{ can_manage: boolean; can_learn: boolean }>(
    base ? base + "/capabilities" : null,
  );
  const patterns = usePagedResource<LearningPattern>(
    base ? base + "/learning" : null,
  );
  const candidates = useResource<{ items: LearningCandidate[] }>(
    base ? base + "/learning/candidates" : null,
  );
  const [state, setState] = useState<{
    scope: string;
    item: LearningPattern | null;
    candidateId: string;
    name: string;
    enabled: boolean;
  }>({ scope: "", item: null, candidateId: "", name: "", enabled: true });
  const local =
    state.scope === scope
      ? state
      : { scope, item: null, candidateId: "", name: "", enabled: true };
  const command = useCommand();
  const [editorScope, setEditorScope] = useState<string | null>(null);
  const editorOpen = editorScope === scope;
  const closeEditor = () => { if (!command.busy) setEditorScope(null); };
  const set = (patch: Partial<typeof local>) =>
    setState({ ...local, ...patch, scope });
  const load = (item: LearningPattern | null) => {
    setEditorScope(scope);
    command.clearError();
    setState({
      scope,
      item,
      candidateId: "",
      name: item?.name || "",
      enabled: item?.enabled ?? true,
    });
  };
  const candidate = candidates.data?.items.find(
    (item) => item.id === local.candidateId,
  );
  const mapping = local.item?.payload.mapping || candidate?.mapping || {};
  const save = () =>
    command.run<LearningPattern>(
      base
        ? base + "/learning" + (local.item ? `/${local.item.id}` : "")
        : null,
      {
        method: local.item ? "PATCH" : "POST",
        version: local.item?.version,
        body: local.item
          ? { name: local.name.trim(), enabled: local.enabled }
          : { name: local.name.trim(), interpretation_id: local.candidateId },
      },
      (item) => {
        load(item);
        setEditorScope(null);
        patterns.refresh();
        candidates.refresh();
      },
      "الگو ذخیره شد.",
    );
  return {
    editorOpen,
    closeEditor,
    workspace,
    capabilities,
    patterns,
    candidates,
    local,
    command,
    set,
    load,
    candidate,
    mappingRows: Object.entries(mapping).map(([key, value]) => ({
      key,
      value,
      label: mappingLabel[key] || key,
    })),
    selectPattern: (id: string) =>
      load(patterns.data?.items.find((item) => item.id === id) || null),
    save,
  };
}
