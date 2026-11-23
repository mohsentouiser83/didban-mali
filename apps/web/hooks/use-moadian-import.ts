"use client";

import type { ParsedTableImport } from "@/components/ui/table";
import { useUpload } from "./use-upload";

function sourceFile(data: ParsedTableImport, direction: "sales" | "purchases") {
  if (data.file) return data.file;
  const csv = [data.headers, ...data.rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\r\n");
  return new File(["\uFEFF", csv], `moadian-${direction}-pasted.csv`, { type: "text/csv" });
}

export function useMoadianImport(parentId?: string) {
  const upload = useUpload();
  return {
    ...upload,
    importSource(data: ParsedTableImport, direction: "sales" | "purchases") {
      if (!data.rows.length) return;
      void upload.upload([sourceFile(data, direction)], undefined, parentId);
    },
  };
}
