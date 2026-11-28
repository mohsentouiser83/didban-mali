"use client";

import { FilesIcon } from "@phosphor-icons/react";
import { ConfirmDialog } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/field";
import { useCompanyDocuments } from "@/hooks/use-company-documents";
import { useWorkspace } from "@/hooks/workspace";
import { BotExtractionReview } from "./bot-extraction-review";
import { CompanyDocumentsTable } from "./company-documents-table";
import { NoCompany, PageHeader } from "./page-parts";

export function SourcesView() {
  const { company, user } = useWorkspace();
  return company ? <CompanyDocuments key={`${user?.id}:${company.id}`} /> : <NoCompany />;
}

function CompanyDocuments() {
  const view = useCompanyDocuments();

  return (
    <>
      <PageHeader icon={FilesIcon} title="فایل‌ها و مدارک" />
      <CompanyDocumentsTable view={view} />
      <BotExtractionReview view={view.extraction} />
      <ConfirmDialog
        title="منبع بایگانی شود؟"
        open={!!view.archiving}
        onOpenChange={(open) => {
          if (!open) view.cancelArchive();
        }}
        busy={view.archiveBusy}
        onConfirm={view.confirmArchive}
      >
        <p>{view.archiving?.name}</p>
        <FormMessage error>{view.archiveError}</FormMessage>
      </ConfirmDialog>
    </>
  );
}
