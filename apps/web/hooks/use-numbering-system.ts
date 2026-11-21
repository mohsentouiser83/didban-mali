"use client";

import { useMemo, useState } from "react";
import type {
  NumberingRule,
  NumberingRuleCreateInput,
  NumberingRuleInput,
} from "@/lib/api";
import { useCommand } from "./use-command";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";

export function useNumberingSystem() {
  const workspace = useWorkspace();
  const command = useCommand();
  const resource = useResource<NumberingRule[]>(workspace.companyPath("numbering"));
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<NumberingRule | null | undefined>();
  const [deleting, setDeleting] = useState<NumberingRule | null>(null);
  const [value, setValue] = useState({
    entity_type: "",
    entity_title: "",
    prefix: "",
    start_number: 1,
    current_number: 1,
    padding: 3,
    suffix: "",
    description: "",
    active: true,
  });

  const rules = useMemo(() => resource.data || [], [resource.data]);

  const filteredRules = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rules;
    return rules.filter(
      (rule) =>
        rule.entity_title.toLowerCase().includes(term) ||
        rule.entity_type.toLowerCase().includes(term) ||
        (rule.prefix && rule.prefix.toLowerCase().includes(term)) ||
        (rule.sample && rule.sample.toLowerCase().includes(term)) ||
        (rule.description && rule.description.toLowerCase().includes(term)),
    );
  }, [rules, search]);

  const livePreview = useMemo(() => {
    const pad = Math.min(10, Math.max(1, Number(value.padding) || 3));
    const num = Math.max(1, Number(value.current_number) || Number(value.start_number) || 1);
    const padded = String(num).padStart(pad, "0");
    return `${value.prefix || ""}${padded}${value.suffix || ""}`;
  }, [value.prefix, value.current_number, value.start_number, value.padding, value.suffix]);

  const open = (rule: NumberingRule | null) => {
    setEditing(rule);
    if (rule) {
      setValue({
        entity_type: rule.entity_type,
        entity_title: rule.entity_title,
        prefix: rule.prefix || "",
        start_number: rule.start_number || 1,
        current_number: rule.current_number || 1,
        padding: rule.padding || 3,
        suffix: rule.suffix || "",
        description: rule.description || "",
        active: rule.active !== false,
      });
    } else {
      setValue({
        entity_type: "",
        entity_title: "",
        prefix: "",
        start_number: 1,
        current_number: 1,
        padding: 3,
        suffix: "",
        description: "",
        active: true,
      });
    }
    command.clearError();
  };

  const close = () => {
    setEditing(undefined);
    command.clearError();
  };

  const change = (patch: Partial<typeof value>) => {
    setValue((prev) => ({ ...prev, ...patch }));
  };

  const save = () => {
    if (editing === undefined) return;

    if (editing === null) {
      const path = workspace.companyPath("numbering");
      if (!path) return;

      const payload: NumberingRuleCreateInput = {
        entity_type: value.entity_type.trim(),
        entity_title: value.entity_title.trim(),
        prefix: value.prefix,
        start_number: Number(value.start_number) || 1,
        current_number: Number(value.current_number) || Number(value.start_number) || 1,
        padding: Number(value.padding) || 3,
        suffix: value.suffix,
        description: value.description ? value.description.trim() : null,
        active: value.active,
      };

      void command.run(
        path,
        {
          method: "POST",
          body: payload,
        },
        () => {
          setEditing(undefined);
          resource.refresh();
        },
        `قاعده شماره‌گذاری برای «${payload.entity_title}» با موفقیت افزوده شد.`,
      );
    } else {
      const path = workspace.companyPath(`numbering/${editing.id}`);
      if (!path) return;

      const payload: NumberingRuleInput = {
        entity_title: value.entity_title.trim(),
        prefix: value.prefix,
        start_number: Number(value.start_number) || 1,
        current_number: Number(value.current_number) || 1,
        padding: Number(value.padding) || 3,
        suffix: value.suffix,
        description: value.description ? value.description.trim() : null,
        active: value.active,
      };

      void command.run(
        path,
        {
          method: "PATCH",
          body: payload,
          version: editing.version,
        },
        () => {
          setEditing(undefined);
          resource.refresh();
        },
        `قاعده شماره‌گذاری ${editing.entity_title} با موفقیت به‌روزرسانی شد.`,
      );
    }
  };

  const remove = () => {
    if (!deleting) return;
    const path = workspace.companyPath(`numbering/${deleting.id}`);
    if (!path) return;

    void command.run(
      path,
      {
        method: "DELETE",
      },
      () => {
        setDeleting(null);
        if (editing && editing.id === deleting.id) setEditing(undefined);
        resource.refresh();
      },
      `قاعده شماره‌گذاری «${deleting.entity_title}» با موفقیت حذف شد.`,
    );
  };

  return {
    workspace,
    command,
    resource,
    rules: filteredRules,
    totalCount: rules.length,
    search,
    setSearch,
    editing,
    isCreating: editing === null,
    deleting,
    setDeleting,
    value,
    livePreview,
    open,
    close,
    change,
    save,
    remove,
  };
}
