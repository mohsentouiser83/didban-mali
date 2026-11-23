"use client";

import { listItems } from "@/lib/api";
import { displayDate, persian } from "@/lib/utils";
import { usePagedResource } from "./use-paged-resource";
import { useWorkspace } from "./workspace";

interface ArchivedSpreadsheet {
  id: string;
  name: string;
  origin: "chart" | "table";
  size: number;
  created_at: string;
}

export function useDocumentSpreadsheets() {
  const workspace = useWorkspace();
  const base = workspace.companyPath("document-archive/spreadsheets");
  const resource = usePagedResource<ArchivedSpreadsheet>(base);
  return {
    resource,
    rows: listItems(resource.data).map((item) => ({
      ...item,
      originLabel: item.origin === "chart" ? "کدینگ حساب‌ها" : "ورود اطلاعات از جدول",
      receivedDate: displayDate(item.created_at.slice(0, 10)),
      sizeLabel: `${persian(Math.ceil(item.size / 1024))} کیلوبایت`,
      download: `/api/v1${base}/${item.id}/download`,
    })),
  };
}
