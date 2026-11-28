"use client";

import { useRouter } from "next/navigation";
import type { ParsedTableImport } from "@/components/ui/table";
import { api, type ProcessingSession } from "@/lib/api";
import { useWorkspace } from "./workspace";

function sourceFile(data: ParsedTableImport, direction: "sales" | "purchases") {
  if (data.file) return data.file;
  const csv = [data.headers, ...data.rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\r\n");
  return new File(["\uFEFF", csv], `moadian-${direction}-pasted.csv`, { type: "text/csv" });
}

export function useMoadianImport(parentId?: string) {
  const workspace = useWorkspace();
  const router = useRouter();

  async function importSource(data: ParsedTableImport, direction: "sales" | "purchases") {
    if (!data.rows.length || !workspace.periodId) return;
    const query = new URLSearchParams({ period_id: workspace.periodId });
    if (parentId) query.set("parent_id", parentId);
    const body = new FormData();
    body.append("file", sourceFile(data, direction));
    const path = workspace.companyPath(`moadian/import/${direction}?${query}`);
    if (!path) return;
    const session = await api<ProcessingSession>(path, { method: "POST", body });
    router.push(`/reports/processing/${session.id}`);
  }

  return importSource;
}
