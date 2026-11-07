"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useWorkspace } from "./workspace";
import { useCommand } from "./use-command";
interface RoleRow {
  account_id: string;
  code: string;
  name: string;
  role: string | null;
  version: number;
}
interface RolePage {
  catalog: { key: string; label: string }[];
  items: RoleRow[];
  next_cursor: string | null;
}
export function useAccountRoles() {
  const workspace = useWorkspace();
  const path = workspace.companyPath("accounting/account-roles");
  const [snapshot, setSnapshot] = useState<{
    path: string | null;
    data?: RolePage;
    error?: ApiError;
  }>({ path: null });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const rows: RoleRow[] = [];
        let cursor: string | null = null;
        const seen = new Set<string>();
        let catalogue: RolePage["catalog"] = [];
        do {
          const page: RolePage = await api<RolePage>(
            path +
              `?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
            { signal: controller.signal },
          );
          catalogue = page.catalog;
          rows.push(...page.items);
          cursor = page.next_cursor;
          if (cursor) {
            if (seen.has(cursor))
              throw new ApiError(
                0,
                "فهرست حساب‌ها کامل دریافت نشد.",
                "invalid_pagination",
              );
            seen.add(cursor);
          }
        } while (cursor && !controller.signal.aborted);
        if (!controller.signal.aborted)
          setSnapshot({
            path,
            data: { catalog: catalogue, items: rows, next_cursor: null },
          });
      } catch (error) {
        if (!controller.signal.aborted)
          setSnapshot({
            path,
            error:
              error instanceof ApiError
                ? error
                : new ApiError(0, "نقش حساب‌ها دریافت نشد.", "unknown"),
          });
      }
    })();
    return () => controller.abort();
  }, [path, revision]);
  const resource = {
    data: snapshot.path === path ? snapshot.data : undefined,
    error: snapshot.path === path ? snapshot.error : undefined,
    loading:
      !!path && (snapshot.path !== path || (!snapshot.data && !snapshot.error)),
    refresh,
  };
  const command = useCommand();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const editable = ["owner", "finance_manager"].includes(
    workspace.company?.role || "",
  );
  const filtered = (resource.data?.items || []).filter((item) =>
    `${item.code} ${item.name}`.includes(query),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 25));
  const currentPage = Math.min(page, pages);
  function save(row: RoleRow, role: string) {
    void command.run(
      workspace.companyPath(`accounting/account-roles/${row.account_id}`),
      {
        method: "PATCH",
        version: row.version,
        body: { role: role === "unassigned" ? null : role },
      },
      resource.refresh,
      "نقش حساب ذخیره شد.",
    );
  }
  return {
    resource,
    command,
    editable,
    query,
    setQuery: (value: string) => {
      setQuery(value);
      setPage(1);
    },
    page: currentPage,
    pages,
    total: filtered.length,
    setPage,
    rows: filtered.slice((currentPage - 1) * 25, currentPage * 25),
    save,
    options: [
      { value: "unassigned", label: "تعیین نشده" },
      ...(resource.data?.catalog || []).map((item) => ({
        value: item.key,
        label: item.label,
      })),
    ],
  };
}

export function useAccountRoleField(accountId: string) {
  const view = useAccountRoles();
  return {
    ...view,
    row: view.resource.data?.items.find(
      (item) => item.account_id === accountId,
    ),
  };
}
