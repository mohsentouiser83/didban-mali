"use client";

import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import type { useCommercialDocuments } from "@/hooks/use-commercial-documents";
import { CommercialDocumentDetails } from "./commercial-document-details";
import { CommercialDocumentPayment } from "./commercial-document-payment";

export function CommercialDocumentEditor({ view }: { view: ReturnType<typeof useCommercialDocuments> }) {
  const { accounts, workspace, cmd, createOpen, setCreateOpen, clientErrors, handleCreateDoc } = view;
  return (
    <Drawer
      open={createOpen}
      onOpenChange={(open) => {
        if (!open && !cmd.busy) {
          cmd.clearError();
          setCreateOpen(false);
        }
      }}
      title="ثبت فاکتور خرید چندردیفی"
      className="sm:max-w-3xl"
    >
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          handleCreateDoc();
        }}
        fieldErrors={{ ...cmd.error?.fields, ...clientErrors }}
      >
        <CommercialDocumentDetails view={view} />
        <CommercialDocumentPayment view={view} />
        <FormMessage error>{cmd.error?.message}</FormMessage>
        <Button type="submit" busy={cmd.busy} disabled={accounts.loading || !workspace.periodId}>
          ساخت پیش‌نویس فاکتور تجاری
        </Button>
      </Form>
    </Drawer>
  );
}
