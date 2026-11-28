"use client";

import { useState } from "react";
import { listItems } from "@/lib/api";
import { displayDate, persian } from "@/lib/utils";
import { useBotExtraction, useBotIntakeImport } from "./use-bot-intakes";
import { useCommand } from "./use-command";
import { usePagedResource } from "./use-paged-resource";
import { useWorkspace } from "./workspace";

type CompanyDocument = {
  id: string;
  name: string;
  created_at: string;
  size: number;
} & (
  | {
      kind: "source";
      state: string;
      version: number;
      archived: boolean;
      row_count: number;
      period_name: string | null;
    }
  | {
      kind: "spreadsheet";
      origin: "chart" | "table";
    }
  | {
      kind: "bot";
      origin: "telegram" | "bale";
      state: string;
      version: number;
      duplicate_original: boolean;
      session_id: string | null;
    }
);

const downloadPaths = {
  source: "source-files",
  spreadsheet: "document-archive/spreadsheets",
  bot: "bot-intakes",
} satisfies Record<CompanyDocument["kind"], string>;

const originLabels = {
  chart: "کدینگ حساب‌ها",
  table: "ورود از جدول",
  telegram: "تلگرام",
  bale: "بله",
};

const botStateLabels: Record<string, string> = {
  awaiting_import: "آمادهٔ ورود به پردازش",
  imported: "وارد پردازش شده",
  pending_extraction: "در انتظار استخراج",
  awaiting_review: "نیازمند بازبینی",
};

export function useCompanyDocuments() {
  const workspace = useWorkspace();
  const resource = usePagedResource<CompanyDocument>(workspace.companyPath("document-archive"));
  const intake = useBotIntakeImport(resource.refresh);
  const extraction = useBotExtraction(resource.refresh);
  const archive = useCommand();
  const [archiving, setArchiving] = useState<Extract<CompanyDocument, { kind: "source" }> | null>(null);

  const rows = listItems(resource.data).map((document) => ({
    document,
    origin: document.kind === "source" ? "فایل پردازش" : originLabels[document.origin],
    date: displayDate(document.created_at),
    size: `${persian(Math.ceil(document.size / 1024))} کیلوبایت`,
    rowCount: document.kind === "source" ? `${persian(document.row_count)} ردیف` : undefined,
    botState: document.kind === "bot" ? botStateLabels[document.state] ?? "نامشخص" : undefined,
    download: `/api/v1${workspace.companyPath(`${downloadPaths[document.kind]}/${document.id}/download`)}`,
    reportLink: document.kind === "bot" && document.session_id ? `/reports/processing/${document.session_id}` : undefined,
  }));

  function requestArchive(document: NonNullable<typeof archiving>) {
    archive.clearError();
    setArchiving(document);
  }

  function confirmArchive() {
    if (!archiving) return;
    void archive.run(
      workspace.companyPath(`source-files/${archiving.id}/archive`),
      { version: archiving.version, body: { expected_version: archiving.version } },
      () => {
        setArchiving(null);
        resource.refresh();
      },
      "منبع بایگانی شد.",
    );
  }

  return {
    rows,
    resource,
    intake,
    extraction,
    archiving,
    requestArchive,
    confirmArchive,
    archiveBusy: archive.busy,
    archiveError: archive.error?.message,
    cancelArchive: () => setArchiving(null),
    canWrite: workspace.canWrite,
  };
}

export type CompanyDocumentsView = ReturnType<typeof useCompanyDocuments>;
