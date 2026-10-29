"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Schema } from "@didban/api-client";
import { api } from "@/lib/api";
import { useCommand } from "@/lib/use-command";
export function useManagement(
  company: string,
  report: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["management-report", company, report],
    enabled: !!report && enabled,
    queryFn: ({ signal }) =>
      api.get<Schema<"ManagementReport">>(
        `/api/v1/companies/${company}/reports/${report}/management`,
        signal,
      ),
  });
}
export function useManagementCommands(
  company: string,
  onGenerated: (report: Schema<"Report">) => void,
  onTemplate: (template: Schema<"StatementTemplate">) => void,
) {
  const client = useQueryClient();
  const generate = useCommand<
    { manifest: string; options: Schema<"ManagementReportRequest"> },
    Schema<"Report">
  >(
    (input, key) =>
      api.mutate(
        `/api/v1/companies/${company}/results/${input.manifest}/management-reports`,
        "POST",
        input.options,
        key,
      ),
    async (report) => {
      onGenerated(report);
      await client.invalidateQueries({ queryKey: ["reports", company] });
    },
  );
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const parse = useCommand<
    { name: string; content_base64: string },
    Schema<"StatementTemplate">
  >(
    (payload, key) =>
      api.mutate(
        `/api/v1/companies/${company}/statement-templates/parse`,
        "POST",
        payload,
        key,
      ),
    onTemplate,
  );
  async function importTemplate(file: File) {
    setFileError(null);
    parse.reset();
    if (file.size > 30000 || !file.name.toLowerCase().endsWith(".xlsx")) {
      setFileError("یک فایل Excel با حجم کمتر از ۳۰ کیلوبایت انتخاب کنید.");
      return;
    }
    setReading(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      parse.mutate({
        name: file.name,
        content_base64: btoa(
          Array.from(bytes, (b) => String.fromCharCode(b)).join(""),
        ),
      });
    } catch {
      setFileError("خواندن فایل قالب انجام نشد؛ دوباره انتخاب کنید.");
    } finally {
      setReading(false);
    }
  }
  return {
    generate,
    parse,
    importTemplate,
    fileError,
    importing: reading || parse.isPending,
    resetTemplateError: () => {
      setFileError(null);
      parse.reset();
    },
  };
}
