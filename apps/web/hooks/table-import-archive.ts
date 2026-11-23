"use client";

import { createContext } from "react";
import { api } from "@/lib/api";

export const TableImportArchiveContext = createContext<((file: File) => Promise<void>) | null>(null);

export async function archiveTableImport(companyId: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  await api(`/companies/${companyId}/document-archive/spreadsheets`, { method: "POST", body });
}
