"use client";
import { useState } from "react";
import { useWorkspace } from "./workspace";
import { useCommand } from "./use-command";
import { useResource } from "./use-resource";
export interface PeriodTask {
  id: string;
  version: number;
  title: string;
  required: boolean;
  responsible_member_id: string | null;
  due_date: string | null;
  active: boolean;
  completed: boolean;
  completion_reason: string | null;
  completed_by: string | null;
  completed_at: string | null;
}
const initial = {
  title: "",
  required: true,
  responsible_member_id: "",
  due_date: "",
  completed: false,
  active: true,
  reason: "",
};
export function usePeriodTasks(periodId: string, refresh: () => void) {
  const w = useWorkspace();
  const members = useResource<{
    items: { membership_id: string; name: string }[];
  }>(w.companyPath("control/assignees"));
  const command = useCommand();
  const [editing, setEditing] = useState<PeriodTask | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const edit = (item: PeriodTask | null) => {
    setEditing(item);
    setForm(
      item
        ? {
            title: item.title,
            required: item.required,
            responsible_member_id: item.responsible_member_id || "",
            due_date: item.due_date || "",
            completed: item.completed,
            active: item.active,
            reason: "",
          }
        : initial,
    );
    command.clearError();
    setOpen(true);
  };
  const save = () =>
    w.canWrite && form.reason.trim()
      ? command.run(
          w.companyPath(`financial-periods/${periodId}/checklist-items`) +
            (editing ? `/${editing.id}` : ""),
          {
            method: editing ? "PATCH" : "POST",
            version: editing?.version,
            body: {
              ...form,
              title: form.title.trim(),
              responsible_member_id: form.responsible_member_id || null,
              due_date: form.due_date || null,
            },
          },
          () => {
            setOpen(false);
            refresh();
          },
          "مورد چک‌لیست ذخیره شد.",
        )
      : undefined;
  return {
    members,
    command,
    open,
    setOpen,
    form,
    set: (patch: Partial<typeof initial>) => setForm({ ...form, ...patch }),
    edit,
    save,
    canWrite: w.canWrite,
    editing,
  };
}
