"use client";

import { useState } from "react";
import { useCommand } from "@/hooks/use-command";
import { useResource } from "@/hooks/use-resource";
import { useWorkspace } from "@/hooks/workspace";
import { listItems } from "@/lib/api";
import { addExactAmounts } from "@/lib/financial-presentation";
import type { NativeInvoice } from "@/lib/native-invoices";
import { compareInvoiceAmounts, tehranToday } from "@/lib/native-invoices";
import type { Counterparty } from "@/lib/commercial";
import type {
  TreasuryAccountOptionsResponse,
  TreasuryAllocationItem,
  TreasuryDirection,
  TreasuryDocumentItem,
  TreasuryDocumentListResponse,
  TreasuryToolKind,
} from "@/lib/treasury-documents";
import { amount } from "@/lib/utils";

interface BankMovementOption {
  id: string;
  reference?: string;
  account?: string;
  amount: string;
  kind?: string;
  remaining?: string;
  remaining_capacity?: string;
}

interface ChequeOption {
  id: string;
  number: string;
  direction: string;
  amount: string;
  state: string;
  due_date?: string;
}

interface ReversingTreasuryAllocation {
  allocation: TreasuryAllocationItem;
  documentId: string;
  documentNumber: string;
  documentVersion: number;
}

export interface ToolInputRow {
  key: number;
  tool_kind: TreasuryToolKind;
  treasury_account_id: string;
  bank_movement_id: string;
  cheque_id: string;
  due_date: string;
  amount: string;
  reference: string;
}

export const toolLabel: Record<string, string> = {
  cash: "نقد / صندوق",
  bank_transfer: "حواله بانکی",
  cheque: "چک",
  card: "کارت‌خوان / کارت",
  other: "سایر",
};

export const stateLabel: Record<string, string> = {
  draft: "پیش‌نویس",
  posted: "ثبت‌شده",
  reversed: "برگشت‌خورده",
};

export function useTreasuryDocuments() {
  const workspace = useWorkspace();
  const docs = useResource<TreasuryDocumentListResponse>(workspace.companyPath("treasury/documents"));
  const accounts = useResource<TreasuryAccountOptionsResponse>(workspace.companyPath("treasury/accounts/options?active_only=true"));
  const counterparties = useResource<{ items: Counterparty[] }>(workspace.companyPath("commercial/counterparties?limit=100"));
  const invoices = useResource<{ items: NativeInvoice[] }>(workspace.companyPath("accounting/native-invoices?limit=100"));
  const bankMovements = useResource<{ items: BankMovementOption[] }>(workspace.companyPath("bank-movements?limit=50"));
  const cheques = useResource<{ items: ChequeOption[] }>(workspace.companyPath("cheques?limit=50"));
  const cmd = useCommand();

  const [createOpen, setCreateOpen] = useState(false);
  const [createClientError, setCreateClientError] = useState("");
  const [allocDoc, setAllocDoc] = useState<TreasuryDocumentItem | null>(null);
  const [reversingAlloc, setReversingAlloc] = useState<ReversingTreasuryAllocation | null>(null);
  const [partyQuickCreateOpen, setPartyQuickCreateOpen] = useState(false);
  const [viewingParty, setViewingParty] = useState<Counterparty | null>(null);

  // Create form state
  const [direction, setDirection] = useState<TreasuryDirection>("receipt");
  const [docDate, setDocDate] = useState(tehranToday);
  const [partyId, setPartyId] = useState("");
  const [description, setDescription] = useState("");
  const [tools, setTools] = useState<ToolInputRow[]>([
    {
      key: 1,
      tool_kind: "bank_transfer",
      treasury_account_id: "",
      bank_movement_id: "",
      cheque_id: "",
      due_date: "",
      amount: "",
      reference: "",
    },
  ]);

  // Allocate tool form state
  const [selectedToolId, setSelectedToolId] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [allocAmount, setAllocAmount] = useState("");
  const [reverseReason, setReverseReason] = useState("");

  const cpOptions = listItems(counterparties.data).map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }));
  const cpNames = Object.fromEntries(listItems(counterparties.data).map((c) => [c.id, c.name]));
  const taOptions = listItems(accounts.data).map((t) => ({ value: t.id, label: t.name }));
  const invNames = Object.fromEntries(listItems(invoices.data).map((i) => [i.id, i.reference]));

  const eligibleBankMovements = listItems(bankMovements.data).filter((b) => {
    if (["opening", "anchor"].includes(b.kind ?? "")) return false;
    const val = compareInvoiceAmounts(b.amount, "0");
    if (direction === "receipt" ? val <= 0 : val >= 0) return false;
    return compareInvoiceAmounts(b.remaining_capacity ?? b.remaining ?? b.amount.replace(/^-/, ""), "0") > 0;
  });
  const bankMovementMap = Object.fromEntries(listItems(bankMovements.data).map((b) => [b.id, b]));
  const bankMovementOptions = [
    { value: "", label: "بدون اتصال به گردش بانک (فقط پیش‌نویس)" },
    ...eligibleBankMovements.map((b) => {
      const cap = b.remaining_capacity ?? b.remaining ?? b.amount.replace(/^-/, "");
      return {
        value: b.id,
        label: `${b.reference || b.account || b.id} — مانده قابل استفاده: ${amount(cap)} ریال`,
      };
    }),
  ];

  const eligibleCheques = listItems(cheques.data).filter((ch) =>
    ch.direction === (direction === "receipt" ? "received" : "issued"),
  );
  const chequeOptions = [
    { value: "", label: "ثبت بدون اتصال به رکورد چک صیادی" },
    ...eligibleCheques.map((ch) => ({
      value: ch.id,
      label: `چک ${ch.number} — ${amount(ch.amount)} ریال`,
    })),
  ];

  const allocInvOptions = allocDoc
    ? listItems(invoices.data)
        .filter((inv) => {
          const expectedDir = allocDoc.direction === "receipt" ? "sale" : "purchase";
          if (inv.direction !== expectedDir) return false;
          const matchesParty =
            inv.party_record_id === allocDoc.counterparty_id ||
            inv.party_id === allocDoc.counterparty_id ||
            (!!allocDoc.counterparty_code && inv.party_id === allocDoc.counterparty_code) ||
            (!!allocDoc.counterparty_name && inv.party_name === allocDoc.counterparty_name);
          if (!matchesParty) return false;
          return compareInvoiceAmounts(inv.remaining, "0") > 0;
        })
        .map((i) => ({
          value: i.id,
          label: `${i.reference} — مانده باز: ${amount(i.remaining)} ریال`,
        }))
    : [];

  function submitCreate() {
    const periodId = workspace.periodId;
    if (!periodId || !partyId) return;
    setCreateClientError("");
    const bankUsage = new Map<string, string>();
    for (const t of tools) {
      if (!t.bank_movement_id) continue;
      const sum = addExactAmounts(bankUsage.get(t.bank_movement_id) ?? "0", t.amount.trim());
      if (sum === null) {
        setCreateClientError("مبلغ ردیف متصل به گردش بانک معتبر نیست.");
        return;
      }
      bankUsage.set(t.bank_movement_id, sum);
    }
    for (const [bankId, sumUsed] of bankUsage.entries()) {
      const bm = bankMovementMap[bankId];
      if (!bm) continue;
      const cap = bm.remaining_capacity ?? bm.remaining ?? bm.amount.replace(/^-/, "");
      if (compareInvoiceAmounts(sumUsed, cap) > 0) {
        setCreateClientError(
          `مجموع مبلغ ردیف‌های متصل به گردش بانکی ${bm.reference || bankId} (${amount(String(sumUsed))} ریال) از ظرفیت آزاد آن (${amount(String(cap))} ریال) بیشتر است.`,
        );
        return;
      }
    }
    void cmd.run<TreasuryDocumentItem>(
      workspace.companyPath("treasury/documents"),
      {
        body: {
          direction,
          date: docDate,
          period_id: periodId,
          party_id: partyId,
          unit: "IRR",
          description: description.trim(),
          tools: tools.map((t) => ({
            tool_kind: t.tool_kind,
            treasury_account_id: t.treasury_account_id || null,
            bank_movement_id: t.bank_movement_id || null,
            cheque_id: t.cheque_id || null,
            due_date: t.due_date || null,
            amount: t.amount.trim(),
            reference: t.reference.trim() || null,
          })),
        },
      },
      () => {
        setCreateOpen(false);
        docs.refresh();
      },
      "پیش‌نویس سند خزانه ثبت شد.",
    );
  }

  function submitAllocate() {
    if (!allocDoc || !selectedToolId || !selectedInvoiceId) return;
    void cmd.run<TreasuryDocumentItem>(
      workspace.companyPath(`treasury/documents/${allocDoc.id}/allocations`),
      {
        version: allocDoc.version,
        body: {
          tool_line_id: selectedToolId,
          invoice_id: selectedInvoiceId,
          amount: allocAmount.trim(),
        },
      },
      (updatedDoc) => {
        if (updatedDoc && docs.data) {
          docs.replace?.({
            items: docs.data.items.map((item) =>
              item.id === updatedDoc.id ? updatedDoc : item,
            ),
          });
        }
        setAllocDoc(null);
        docs.refresh();
      },
      "تخصیص ابزار خزانه به فاکتور ثبت شد.",
    );
  }

  function submitReverse() {
    if (!reversingAlloc || !reverseReason.trim()) return;
    void cmd.run<TreasuryDocumentItem>(
      workspace.companyPath(`treasury/allocations/${reversingAlloc.allocation.id}/reverse`),
      {
        version: reversingAlloc.documentVersion,
        body: { reason: reverseReason.trim() },
      },
      (updatedDoc) => {
        if (updatedDoc && docs.data) {
          docs.replace?.({
            items: docs.data.items.map((item) =>
              item.id === updatedDoc.id ? updatedDoc : item,
            ),
          });
        }
        setReversingAlloc(null);
        setReverseReason("");
        docs.refresh();
      },
      "تخصیص خزانه برگشت داده شد.",
    );
  }

  const isReverseVersionConflict = cmd.error?.code === "version_conflict";

  const docRows = (docs.data?.items ?? []).map((doc) => {
    const remainder = doc.allocations
      .filter((allocation) => !allocation.reversed_at)
      .reduce<string | null>((remaining, allocation) => addExactAmounts(remaining, `-${allocation.amount}`), doc.total_amount);
    const allocatableVal = doc.allocatable_amount ?? (
      remainder !== null && compareInvoiceAmounts(remainder, "0") < 0 ? "0" : remainder
    );
    return {
      doc,
      allocatableVal,
      firstAvailableTool: doc.tools.find((tool) => compareInvoiceAmounts(tool.remaining_amount ?? tool.amount, "0") > 0),
      canAllocate: workspace.canWrite && doc.state !== "reversed" && compareInvoiceAmounts(allocatableVal, "0") > 0,
      hasProof: doc.has_payment_proof ?? false,
    };
  });

  return {
    workspace,
    docs,
    counterparties,
    cmd,
    createOpen,
    setCreateOpen,
    createClientError,
    setCreateClientError,
    allocDoc,
    setAllocDoc,
    reversingAlloc,
    setReversingAlloc,
    partyQuickCreateOpen,
    setPartyQuickCreateOpen,
    viewingParty,
    setViewingParty,
    direction,
    setDirection,
    docDate,
    setDocDate,
    partyId,
    setPartyId,
    description,
    setDescription,
    tools,
    setTools,
    selectedToolId,
    setSelectedToolId,
    selectedInvoiceId,
    setSelectedInvoiceId,
    allocAmount,
    setAllocAmount,
    reverseReason,
    setReverseReason,
    cpOptions,
    cpNames,
    taOptions,
    invNames,
    bankMovementOptions,
    chequeOptions,
    allocInvOptions,
    submitCreate,
    submitAllocate,
    submitReverse,
    isReverseVersionConflict,
    docRows,
  };
}
