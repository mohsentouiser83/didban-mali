"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { useWorkspace } from "./workspace";
import { useResource } from "./use-resource";
import { usePagedResource } from "./use-paged-resource";
import { useCommand } from "./use-command";
import type { ResourceList } from "@/lib/api";

export type DocumentSubjectKind = "draft" | "journal";
interface Thread {
  id: string; version: number; state: "open" | "in_progress" | "resolved";
  assignee_membership_id: string | null; assignee_name: string | null; assignee_active: boolean;
  due_date: string | null; next_action: string;
}
interface Discussion {
  subject: { kind: DocumentSubjectKind; id: string; description: string; version: number; state: string; digest: string };
  thread: Thread | null; expected_version: number; can_write: boolean;
}
interface Activity {
  id: string; actor_name: string; kind: string; message: string; created_at: string;
  context: { kind: string; version: number; state: string }; data: Record<string, unknown>;
}
const labels: Record<string, string> = { comment: "نظر", document_request: "درخواست مدرک", updated: "تغییر پیگیری" };
const initialFollowup = () => ({ state: "open" as Thread["state"], assignee_membership_id: "none", due_date: "", next_action: "", reason: "" });

export function useDocumentDiscussion(kind: DocumentSubjectKind, id: string, open: boolean) {
  const workspace = useWorkspace();
  const scope = `${workspace.user?.id}:${workspace.company?.id}:${kind}:${id}`;
  const live = useRef({ scope, canWrite: workspace.canWrite });
  useLayoutEffect(() => { live.current = { scope, canWrite: workspace.canWrite }; }, [scope, workspace.canWrite]);
  const base = workspace.companyPath("accounting/discussions");
  const resource = useResource<Discussion>(open && base ? `${base}?subject_kind=${kind}&subject_id=${encodeURIComponent(id)}` : null);
  const history = usePagedResource<Activity>(open && resource.data?.thread && base ? `${base}/${resource.data.thread.id}/activities` : null);
  const assignees = useResource<ResourceList<{ membership_id: string; name: string }>>(open && workspace.canWrite ? workspace.companyPath("control/assignees") : null);
  const command = useCommand();
  const [note, setNote] = useState({ scope, kind: "comment", message: "" });
  const comment = note.scope === scope ? note : { scope, kind: "comment", message: "" };
  const [edits, setEdits] = useState<{ scope: string; version: number; value: ReturnType<typeof initialFollowup> }>();
  const value = resource.data;
  const form = edits?.scope === scope && edits.version === value?.expected_version ? edits.value : {
    ...initialFollowup(),
    state: value?.thread?.state || "open",
    assignee_membership_id: value?.thread?.assignee_membership_id || "none",
    due_date: value?.thread?.due_date || "",
    next_action: value?.thread?.next_action || "",
  };
  const canWrite = !!value?.can_write && workspace.canWrite && !resource.loading && !resource.error;
  const blocked = command.error?.code === "document_context_changed" || command.error?.code === "version_conflict";
  function context() {
    return value ? { subject_kind: kind, subject_id: id, expected_subject_digest: value.subject.digest, expected_version: value.expected_version } : null;
  }
  function after() {
    if (live.current.scope !== scope) return;
    resource.refresh(); history.refresh();
  }
  function add() {
    const checked = context();
    if (!checked || !canWrite || blocked || !comment.message.trim() || !live.current.canWrite || live.current.scope !== scope) return;
    void command.run(base ? `${base}/activities` : null,
      { version: checked.expected_version, body: { ...checked, kind: comment.kind, message: comment.message.trim() } },
      () => { if (live.current.scope === scope) setNote({ scope, kind: "comment", message: "" }); after(); }, "فعالیت سند ثبت شد.");
  }
  function saveFollowup() {
    const checked = context();
    if (!checked || !canWrite || blocked || !form.reason.trim() || !live.current.canWrite || live.current.scope !== scope) return;
    void command.run(base ? (value?.thread ? `${base}/${value.thread.id}` : base) : null,
      { method: "PATCH", version: checked.expected_version, body: { ...checked, ...form,
        assignee_membership_id: form.assignee_membership_id === "none" ? null : form.assignee_membership_id,
        due_date: form.due_date || null, reason: form.reason.trim() } },
      () => { if (live.current.scope === scope) setEdits(undefined); after(); }, "پیگیری سند ذخیره شد.");
  }
  return {
    workspace, resource, history, command, comment, form, canWrite, blocked, assignees, add, saveFollowup,
    assigneeOptions: [{ value: "none", label: "بدون مسئول" }, ...(assignees.data?.items || []).map(item => ({ value: item.membership_id, label: item.name }))],
    commentChange: (patch: Partial<typeof comment>) => setNote(previous => ({ ...(previous.scope === scope ? previous : comment), ...patch })),
    formChange: (patch: Partial<typeof form>) => setEdits({ scope, version: value?.expected_version || 1, value: { ...form, ...patch } }),
    refresh: () => { resource.refresh(); history.refresh(); command.clearError(); },
    activities: (history.data?.items || []).map(item => ({ ...item, label: labels[item.kind] || "فعالیت",
      timeLabel: new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at)) })),
  };
}
export type DocumentDiscussionController = ReturnType<typeof useDocumentDiscussion>;
