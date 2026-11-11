"use client";

import { useState } from "react";
import type {
  MoadianCandidate,
  MoadianFiscalForm,
  MoadianFiscalPayload,
  MoadianPreview,
  MoadianTransmission,
  MoadianTransmissions,
} from "@/lib/moadian-transmissions";
import { tehranIssuedAt } from "@/lib/moadian-transmissions";
import { amount, displayDate } from "@/lib/utils";
import { useCommand } from "./use-command";
import { usePagedResource } from "./use-paged-resource";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";

const initialForm: MoadianFiscalForm = {
  tax_id: "",
  issued_time: "",
  buyer_type: "",
  buyer_tax_number: "",
  item_tax_id: "",
  unit_code: "",
  vat_treatment: "",
  vat_evidence: "",
};
export function useMoadianTransmissions() {
  const { companyPath } = useWorkspace();
  const base = companyPath("moadian/transmissions");
  const resource = usePagedResource<MoadianTransmission, MoadianTransmissions>(base);
  const [open, setOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState("");
  const [form, setForm] = useState(initialForm);
  const [review, setReview] = useState<{
    preview: MoadianPreview;
    payload: MoadianFiscalPayload;
    key: string;
  }>();
  const [rowAction, setRowAction] = useState<{ id: string; kind: "inquiry" | "retry" }>();
  const [retryTarget, setRetryTarget] = useState<MoadianTransmission>();
  const previewCommand = useCommand();
  const submitCommand = useCommand();
  const rowCommand = useCommand();
  const canSend = resource.data?.configured && resource.data.can_submit;
  const invoices = useResource<{ items: MoadianCandidate[] }>(
    open && canSend && base ? base + "/candidates" : null,
  );
  const candidates = invoices.data?.items ?? [];
  const invoice = candidates.find((item) => item.id === invoiceId);
  const working = previewCommand.busy || submitCommand.busy;
  const issuedAt = invoice ? tehranIssuedAt(invoice.date, form.issued_time) : undefined;
  const ready = !!(canSend && invoice && issuedAt && form.buyer_type && form.vat_treatment);

  function clearReview() {
    setReview(undefined);
    previewCommand.clearError();
    submitCommand.clearError();
  }

  function change(field: keyof MoadianFiscalForm, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
    clearReview();
  }

  function show() {
    if (!canSend) return;
    setForm(initialForm);
    setInvoiceId("");
    clearReview();
    setOpen(true);
  }

  async function prepare() {
    if (!base || !invoice || !issuedAt || !ready || working) return;
    const payload: MoadianFiscalPayload = {
      invoice_id: invoice.id,
      invoice_version: invoice.version,
      tax_id: form.tax_id,
      issued_at: issuedAt,
      buyer_type: form.buyer_type,
      buyer_tax_number: form.buyer_tax_number,
      item_tax_id: form.item_tax_id,
      unit_code: form.unit_code,
      vat_treatment: form.vat_treatment,
      vat_evidence: form.vat_evidence.trim(),
    };
    await previewCommand.run<MoadianPreview>(base + "/preview", { body: payload }, (preview) => {
      setReview({ preview, payload, key: crypto.randomUUID() });
    });
  }

  async function submit() {
    if (!base || !review || !canSend || working) return;
    await submitCommand.run<MoadianTransmission>(
      base,
      { body: { ...review.payload, digest: review.preview.digest }, key: review.key },
      () => {
        setOpen(false);
        setReview(undefined);
        resource.firstPage();
      },
    );
    // Reconcile history even if the response was lost after the request reached the server.
    resource.refresh();
  }

  async function act(row: MoadianTransmission, kind: "inquiry" | "retry") {
    if (!base || rowCommand.busy || !(kind === "inquiry" ? row.can_inquire : row.can_retry)) return;
    setRowAction({ id: row.id, kind });
    await rowCommand.run<MoadianTransmission>(
      base + "/" + encodeURIComponent(row.id) + "/" + kind,
      { body: {} },
      () => setRetryTarget(undefined),
    );
    setRowAction(undefined);
    resource.refresh();
  }

  return {
    resource,
    rows: resource.data?.items ?? [],
    pagination: {
      page: resource.page,
      hasPrevious: resource.hasPrevious,
      hasNext: resource.hasNext,
      previousPage: resource.previousPage,
      nextPage: resource.nextPage,
    },
    refreshHistory: () => {
      resource.firstPage();
      resource.refresh();
    },
    open,
    show,
    close: () => {
      if (!working) setOpen(false);
    },
    working,
    canSend,
    ready,
    invalidClock: !!form.issued_time && !issuedAt,
    invoice,
    invoiceId,
    invoiceOptions: candidates.map((item) => ({
      value: item.id,
      label: [item.reference, item.party_id, displayDate(item.date), amount(item.amount) + " ریال"].join(" · "),
    })),
    selectInvoice: (id: string) => {
      setInvoiceId(id);
      clearReview();
    },
    invoices,
    form,
    change,
    review: review?.preview,
    clearReview,
    prepare,
    submit,
    previewCommand,
    submitCommand,
    rowCommand,
    rowAction,
    inquire: (row: MoadianTransmission) => void act(row, "inquiry"),
    retryTarget,
    confirmRetry: (row?: MoadianTransmission) => {
      if (!rowCommand.busy && (!row || row.can_retry)) {
        rowCommand.clearError();
        setRetryTarget(row);
      }
    },
    retry: () => {
      if (retryTarget) void act(retryTarget, "retry");
    },
  };
}

export type MoadianTransmissionController = ReturnType<typeof useMoadianTransmissions>;
