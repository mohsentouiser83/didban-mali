"use client";
import { useState } from "react";
import { useWorkspace } from "./workspace";
import { useCommand } from "./use-command";
import { usePagedResource } from "./use-paged-resource";
import { listItems, type Period } from "@/lib/api";

export type PeriodDateRangeStatus = "upcoming" | "current" | "expired";

export function periodDateRangeStatus(period: { start?: string; end?: string }): PeriodDateRangeStatus {
  const today = new Date().toISOString().slice(0, 10);
  if (period.start && period.start > today) return "upcoming";
  if (period.end && period.end < today) return "expired";
  return "current";
}

export function isPeriodClosed(period: { closed?: boolean }): boolean {
  return Boolean(period.closed);
}

export function usePeriodManagement() {
  const workspace = useWorkspace();
  const resource = usePagedResource<Period>(
    workspace.companyPath("financial-periods"),
  );
  const command = useCommand();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Period | null>(null);
  const [deleting, setDeleting] = useState<Period | null>(null);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [previousPeriodId, setPreviousPeriodId] = useState("");

  function openCreate() {
    setEditing(null);
    setName("");
    setStart("");
    setEnd("");
    setPreviousPeriodId("");
    setDrawerOpen(true);
    command.clearError();
  }

  function openEdit(period: Period) {
    setEditing(period);
    setName(period.name);
    setStart(period.start);
    setEnd(period.end);
    setPreviousPeriodId(period.previous_period_id || "");
    setDrawerOpen(true);
    command.clearError();
  }

  function closeDrawer() {
    if (command.busy) return;
    setDrawerOpen(false);
    setEditing(null);
    command.clearError();
  }

  function save() {
    if (!name.trim() || !start || !end) return;
    if (editing?.closed) return;
    const isLockedDates = Boolean(editing?.in_use);
    const body = {
      name: name.trim(),
      start: isLockedDates && editing ? editing.start : start,
      end: isLockedDates && editing ? editing.end : end,
      previous_period_id:
        isLockedDates && editing
          ? (editing.previous_period_id ?? null)
          : previousPeriodId || null,
    };
    void command.run(
      workspace.companyPath(
        editing ? `financial-periods/${editing.id}` : "financial-periods",
      ),
      {
        method: editing ? "PATCH" : "POST",
        version: editing?.version,
        body,
      },
      () => {
        setDrawerOpen(false);
        setEditing(null);
        command.clearError();
        resource.refresh();
        workspace.refreshPeriods();
      },
      editing ? "دوره مالی به‌روزرسانی شد." : "دوره مالی جدید ایجاد شد.",
    );
  }

  function remove() {
    if (!deleting || deleting.in_use || deleting.closed) return;
    void command.run(
      workspace.companyPath(`financial-periods/${deleting.id}`),
      { method: "DELETE", version: deleting.version },
      () => {
        setDeleting(null);
        resource.refresh();
        workspace.refreshPeriods();
      },
      "دوره حذف شد.",
    );
  }

  const allPeriods = listItems(resource.data);
  const comparisonCandidates = allPeriods.filter((item) => {
    if (editing && item.id === editing.id) return false;
    if (start && item.end >= start) return false;
    return true;
  });

  return {
    workspace,
    resource,
    command,
    creating: drawerOpen,
    editing,
    deleting,
    name,
    start,
    end,
    previousPeriodId,
    comparisonCandidates,
    setCreating: setDrawerOpen,
    setDeleting,
    setName,
    setStart,
    setEnd,
    setPreviousPeriodId,
    openCreate,
    openEdit,
    closeCreate: closeDrawer,
    save,
    remove,
  };
}
