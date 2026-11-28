"use client";

import { useMemo, useState } from "react";
import { useAccountOptions } from "@/hooks/use-accounting";
import { useCommand } from "@/hooks/use-command";
import { useResource } from "@/hooks/use-resource";
import { useWorkspace } from "@/hooks/workspace";
import { isAccountPostable } from "@/lib/account-catalogue";
import { api, listItems } from "@/lib/api";
import type { Counterparty } from "@/lib/commercial";
import { computeCommercialTotals, parseNonNegativeInt, resolveCommercialAccountConfig, type CommercialAccountSlot, type CommercialDraftLineInput } from "@/lib/commercial-doc-accounts";
import type {
  CommercialDirection,
  CommercialDocument,
  CommercialDocumentDraftResponse,
  CommercialDocumentListResponse,
  CommercialSettlementType,
} from "@/lib/commercial-documents";
import type { InventoryState } from "@/lib/inventory";
import { tehranToday } from "@/lib/native-invoices";
import { asciiDigits, persian } from "@/lib/utils";

interface QuarantineLine {
  id: string;
  return_number: string;
  return_date: string;
  document_id: string;
  document_number?: string | null;
  warehouse_id?: string | null;
  warehouse_name?: string | null;
  description: string;
  unit: string;
  quantity: number;
  quarantine_status: string;
}

interface CreditApplicationItem {
  id: string;
  target_document_id: string;
  target_document_number?: string | null;
  amount_irr: string;
  date: string;
}

interface CounterpartyCreditItem {
  id: string;
  counterparty_id: string;
  counterparty_name?: string | null;
  counterparty_code?: string | null;
  document_id: string;
  document_number?: string | null;
  return_number?: string | null;
  credit_kind: string;
  original_amount_irr: string;
  consumed_amount_irr?: string;
  remaining_amount_irr: string;
  status: string;
  applications?: CreditApplicationItem[];
}

type DraftLineState = CommercialDraftLineInput;

export const docStatusLabel: Record<string, string> = {
  draft: "پیش‌نویس",
  posted: "ثبت‌شده",
  partially_returned: "مرجوعی جزئی",
  fully_returned: "مرجوع کامل",
  reversed: "برگشت‌خورده",
  discarded: "لغوشده",
};

export const creditStatusLabel: Record<string, string> = {
  open: "باز",
  partially_used: "مصرف جزئی",
  consumed: "تسویه‌شده",
  refunded: "مستردشده",
  reversed: "برگشت‌خورده",
};

export const quarantineStatusLabel: Record<string, string> = {
  pending_inspection: "در انتظار بررسی",
  restocked: "بازگشت به موجودی سالم",
  repaired: "تعمیر و نگهداری",
  scrapped: "ضایعات / اسقاط",
};

export const emptyLine = (key = 1, lineKind: "goods" | "service" = "goods"): DraftLineState => ({
  key,
  line_kind: lineKind,
  item_id: "",
  description: "",
  quantity: "1",
  unit_price: "",
  line_discount: "0",
  vat_rate_pct: "0",
});

export function parseBigIntSafe(raw: string): bigint {
  const clean = asciiDigits(raw || "").replace(/[^\d]/g, "");
  if (!clean) return BigInt(0);
  try {
    return BigInt(clean);
  } catch {
    return BigInt(0);
  }
}

async function fetchCommercialDocuments(path: string, options: { signal: AbortSignal }) {
  const items = new Map<string, CommercialDocument>();
  const limit = 100;
  let offset = 0;
  let total: number;
  do {
    const page = await api<CommercialDocumentListResponse>(`${path}&limit=${limit}&offset=${offset}`, options);
    for (const document of page.items) items.set(document.id, document);
    total = page.total;
    offset += page.items.length;
    if (!page.items.length) break;
  } while (offset < total);
  return { total, items: [...items.values()] };
}

export function useCommercialDocuments({
  direction,
  partyId: filteredPartyId,
  allDocuments = false,
  creationOnly = false,
}: {
  direction: CommercialDirection;
  partyId?: string;
  allDocuments?: boolean;
  creationOnly?: boolean;
}) {
  const workspace = useWorkspace();
  const isServiceMode = workspace.company?.business_mode === "service";
  const isSale = direction === "sale";
  const [subTab, setSubTab] = useState<"documents" | "quarantine" | "credits">("documents");

  const docs = useResource<CommercialDocumentListResponse>(
    creationOnly ? null : workspace.companyPath(`commercial/documents?direction=${direction}${allDocuments ? "" : "&limit=50"}${filteredPartyId ? `&counterparty_id=${encodeURIComponent(filteredPartyId)}` : ""}`),
    { fetcher: allDocuments ? fetchCommercialDocuments : undefined },
  );
  const quarantine = useResource<{ items: QuarantineLine[] }>(
    creationOnly ? null : workspace.companyPath("commercial/quarantine"),
  );
  const credits = useResource<{ items: CounterpartyCreditItem[] }>(
    creationOnly ? null : workspace.companyPath("commercial/credits"),
  );
  const counterparties = useResource<{ items: Counterparty[] }>(
    workspace.companyPath("commercial/counterparties?limit=100"),
  );
  const inventory = useResource<InventoryState>(
    isServiceMode ? null : workspace.companyPath("accounting/inventory"),
  );
  const accounts = useAccountOptions(workspace.company?.id ?? "");

  const cmd = useCommand();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailDoc, setDetailDoc] = useState<CommercialDocument | null>(null);
  const [decidingQuarantine, setDecidingQuarantine] = useState<QuarantineLine | null>(null);
  const [creditAction, setCreditAction] = useState<{ mode: "apply" | "refund"; credit: CounterpartyCreditItem } | null>(null);
  const [partyQuickCreateOpen, setPartyQuickCreateOpen] = useState(false);
  const [viewingParty, setViewingParty] = useState<Counterparty | null>(null);

  // Create multi-line commercial document form state
  const [issueDate, setIssueDate] = useState(() => tehranToday());
  const [dueDate, setDueDate] = useState("");
  const [partyId, setPartyId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [invoiceDiscount, setInvoiceDiscount] = useState("0");
  const [settlementType, setSettlementType] = useState<CommercialSettlementType>("on_account");
  const [cashAmount, setCashAmount] = useState("0");
  const [chequeAmount, setChequeAmount] = useState("0");
  const [onAccountAmount, setOnAccountAmount] = useState("0");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDueDate, setChequeDueDate] = useState("");
  const [accountOverrides, setAccountOverrides] = useState<Partial<Record<CommercialAccountSlot, string>>>({});
  const [docDesc, setDocDesc] = useState("");
  const [rawLines, setLines] = useState<DraftLineState[]>(() => [
    emptyLine(1, workspace.company?.business_mode === "service" ? "service" : "goods"),
  ]);
  const lines = useMemo(
    () =>
      isServiceMode
        ? rawLines.map((line) =>
            line.line_kind === "goods" ? { ...line, line_kind: "service" as const, item_id: "" } : line,
          )
        : rawLines,
    [isServiceMode, rawLines],
  );
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [lineErrors, setLineErrors] = useState<Record<number, {
    item_id?: string;
    quantity?: string;
    unit_price?: string;
    line_discount?: string;
  }>>({});

  // Return form state
  const [retDate, setRetDate] = useState(() => tehranToday());
  const [retReason, setRetReason] = useState("");
  const [retQuantities, setRetQuantities] = useState<Record<string, string>>({});
  const [retConditions, setRetConditions] = useState<Record<string, "healthy" | "defective">>({});

  // Quarantine decision state
  const [qDecision, setQDecision] = useState<"restocked" | "repaired" | "scrapped">("restocked");
  const [qDate, setQDate] = useState(() => tehranToday());
  const [qNote, setQNote] = useState("");
  const [qCostAccountId, setQCostAccountId] = useState("");

  // Credit action state
  const [creditTargetDocId, setCreditTargetDocId] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [creditDate, setCreditDate] = useState(() => tehranToday());
  const [creditCashAccount, setCreditCashAccount] = useState("");
  const [creditCpAccount, setCreditCpAccount] = useState("");
  const [creditReason, setCreditReason] = useState("");

  const allCounterparties = listItems(counterparties.data);
  const cpOptions = allCounterparties.filter((c) => c.active).map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }));
  const cpNames = Object.fromEntries(allCounterparties.map((c) => [c.id, c.name]));
  const invItems = inventory.data?.items ?? [];
  const goodsItems = invItems.filter((i) => i.active && (!i.item_kind || i.item_kind === "goods"));
  const activeWarehouses = (inventory.data?.warehouses ?? []).filter((w) => w.active);
  const itemOptions = goodsItems.map((i) => ({ value: i.id, label: `${i.name} (${i.base_unit ?? "عدد"})` }));
  const whOptions = activeWarehouses.map((w) => ({ value: w.id, label: w.name }));

  const postableAccounts = accounts.items.filter((a) => isAccountPostable(a));
  const accOptions = postableAccounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }));

  const findRoleAccount = (...roles: string[]) => {
    for (const r of roles) {
      const hit = postableAccounts.find((item) => item.role === r);
      if (hit) return hit.id;
    }
    return "";
  };

  const effectiveWarehouseId =
    warehouseId || (activeWarehouses.length === 1 ? activeWarehouses[0].id : "");

  const totals = useMemo(
    () => computeCommercialTotals(lines, invoiceDiscount),
    [lines, invoiceDiscount],
  );

  const parsedCashAmount = useMemo(
    () => (settlementType === "mixed" ? parseNonNegativeInt(cashAmount, true) : null),
    [settlementType, cashAmount],
  );
  const parsedChequeAmount = useMemo(
    () => (settlementType === "mixed" ? parseNonNegativeInt(chequeAmount, true) : null),
    [settlementType, chequeAmount],
  );
  const parsedOnAccountAmount = useMemo(
    () => (settlementType === "mixed" ? parseNonNegativeInt(onAccountAmount, true) : null),
    [settlementType, onAccountAmount],
  );

  const inventoryAccountIds = useMemo(
    () => new Set((inventory.data?.items ?? []).map((item) => item.inventory_account_id).filter(Boolean)),
    [inventory.data?.items],
  );

  const accountConfig = useMemo(
    () =>
      resolveCommercialAccountConfig({
        accounts: accounts.items,
        direction,
        hasGoods: totals.hasGoods,
        hasService: totals.hasService,
        settlementType,
        cashAmount: parsedCashAmount,
        chequeAmount: parsedChequeAmount,
        onAccountAmount: parsedOnAccountAmount,
        inventoryAccountIds,
      }),
    [
      accounts.items,
      direction,
      totals.hasGoods,
      totals.hasService,
      settlementType,
      parsedCashAmount,
      parsedChequeAmount,
      parsedOnAccountAmount,
      inventoryAccountIds,
    ],
  );

  function selectedAccountId(slot: CommercialAccountSlot): string {
    const manual = accountOverrides[slot];
    if (manual !== undefined) return manual;
    return accountConfig[slot].defaultAccountId;
  }

  function clearClientError(...keys: string[]) {
    setClientErrors((prev) => {
      if (!keys.some((k) => k in prev)) return prev;
      const next = { ...prev };
      for (const k of keys) delete next[k];
      return next;
    });
  }

  function resetCreateForm() {
    setIssueDate(tehranToday());
    setDueDate("");
    setPartyId("");
    setWarehouseId("");
    setInvoiceDiscount("0");
    setSettlementType("on_account");
    setCashAmount("0");
    setChequeAmount("0");
    setOnAccountAmount("0");
    setChequeNumber("");
    setChequeDueDate("");
    setAccountOverrides({});
    setDocDesc("");
    setLines([emptyLine(Date.now(), isServiceMode ? "service" : "goods")]);
    setClientErrors({});
    setLineErrors({});
  }

  function openCreateDrawer() {
    cmd.clearError();
    setClientErrors({});
    setLineErrors({});
    setCreateOpen(true);
  }

  function refreshAll() {
    docs.refresh();
    quarantine.refresh();
    credits.refresh();
  }

  function focusCreateField(id: string | undefined) {
    if (id) requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  function validateCreateDetails() {
    const nextErrors: Record<string, string> = {};
    const nextLineErrors: typeof lineErrors = {};
    let firstInvalidId: string | undefined;
    const markError = (key: string, msg: string, id: string) => {
      nextErrors[key] = msg;
      firstInvalidId ??= id;
    };

    if (!partyId) markError("party_id", "طرف حساب را انتخاب کنید.", "cd-party");
    if (!issueDate) markError("issue_date", "تاریخ صدور را انتخاب کنید.", "cd-issue-date");
    if (totals.hasGoods && !effectiveWarehouseId) {
      markError("warehouse_id", "برای فاکتور دارای کالای انباری، انتخاب انبار الزامی است.", "cd-wh");
    }
    if (totals.invoiceDiscountError) {
      markError("invoice_discount", totals.invoiceDiscountError, "cd-inv-disc");
    }

    totals.lines.forEach((computedLine, index) => {
      if (Object.keys(computedLine.errors).length > 0) {
        nextLineErrors[computedLine.key] = computedLine.errors;
        if (!firstInvalidId) {
          if (computedLine.errors.item_id) firstInvalidId = `cd-line-${index}-item`;
          else if (computedLine.errors.quantity) firstInvalidId = `cd-line-${index}-qty`;
          else if (computedLine.errors.unit_price) firstInvalidId = `cd-line-${index}-price`;
          else if (computedLine.errors.line_discount) firstInvalidId = `cd-line-${index}-disc`;
        }
      }
    });

    if (totals.netTotal !== null && totals.netTotal <= 0n) {
      markError("invoice_discount", "مبلغ خالص فاکتور باید مثبت باشد.", "cd-inv-disc");
    }

    setClientErrors(nextErrors);
    setLineErrors(nextLineErrors);
    focusCreateField(firstInvalidId);
    return !Object.keys(nextErrors).length && !Object.keys(nextLineErrors).length;
  }

  function handleCreateDoc(onCreated?: () => void, onInvalidDetails?: () => void) {
    const periodId = workspace.periodId;
    if (!periodId || cmd.busy) return;
    if (!validateCreateDetails()) {
      onInvalidDetails?.();
      return;
    }

    const nextErrors: Record<string, string> = {};
    let firstInvalidId: string | undefined;
    const markError = (key: string, msg: string, id: string) => {
      nextErrors[key] = msg;
      firstInvalidId ??= id;
    };

    if (dueDate && issueDate && dueDate < issueDate) {
      markError("due_date", "سررسید نمی‌تواند پیش از تاریخ صدور باشد.", "cd-due-date");
    }

    if (settlementType === "mixed") {
      if (parsedCashAmount === null) {
        markError("cash_amount", "مبلغ نقد باید عدد صحیح نامنفی باشد.", "cd-cash");
      }
      if (parsedChequeAmount === null) {
        markError("cheque_amount", "مبلغ چک باید عدد صحیح نامنفی باشد.", "cd-cheque");
      }
      if (parsedOnAccountAmount === null) {
        markError("on_account_amount", "مبلغ نسیه باید عدد صحیح نامنفی باشد.", "cd-on-account");
      }
      if (
        parsedCashAmount !== null &&
        parsedChequeAmount !== null &&
        parsedOnAccountAmount !== null &&
        totals.payableTotal !== null
      ) {
        const settlementSum = parsedCashAmount + parsedChequeAmount + parsedOnAccountAmount;
        if (settlementSum !== totals.payableTotal) {
          markError(
            "on_account_amount",
            `مجموع سهم‌های نقد، چک و نسیه (${persian(settlementSum.toString())} ریال) با مبلغ قابل پرداخت فاکتور (${persian(totals.payableTotal.toString())} ریال) برابر نیست.`,
            "cd-on-account",
          );
        }
      }
      if (parsedChequeAmount !== null && parsedChequeAmount > 0n) {
        if (!chequeNumber.trim()) {
          markError("cheque_number", "شماره چک برای بخش تسویه با چک الزامی است.", "cd-cheque-number");
        }
        if (!chequeDueDate) {
          markError("cheque_due_date", "تاریخ سررسید چک برای بخش تسویه با چک الزامی است.", "cd-cheque-due-date");
        }
      }
    }

    const accountMeta: Record<CommercialAccountSlot, { id: string; label: string }> = {
      revenue_account_id: {
        id: "cd-revenue-account",
        label: "حساب درآمد فروش کالا",
      },
      cost_account_id: {
        id: "cd-cost-account",
        label: "حساب بهای تمام‌شده کالا",
      },
      service_revenue_account_id: {
        id: "cd-service-revenue-account",
        label: "حساب درآمد خدمات",
      },
      expense_account_id: {
        id: "cd-expense-account",
        label: "حساب هزینه خدمات",
      },
      counterparty_account_id: {
        id: "cd-counterparty-account",
        label: isSale ? "حساب دریافتنی تجاری (طرف حساب)" : "حساب پرداختنی تجاری (طرف حساب)",
      },
      cash_account_id: {
        id: "cd-cash-account",
        label: "حساب وجه نقد / بانک",
      },
      cheque_account_id: {
        id: "cd-cheque-account",
        label: isSale ? "حساب اسناد دریافتنی" : "حساب اسناد پرداختنی",
      },
    };

    (Object.keys(accountMeta) as CommercialAccountSlot[]).forEach((slot) => {
      const cfg = accountConfig[slot];
      if (!cfg.required) return;
      const chosen = selectedAccountId(slot);
      const allowed = cfg.allowedAccounts.some((a) => a.id === chosen);
      if (!chosen || !allowed) {
        const meta = accountMeta[slot];
        markError(
          slot,
          isSale
            ? cfg.status === "ambiguous"
              ? `چند حساب برای «${meta.label}» در کدینگ وجود دارد.`
              : `«${meta.label}» در کدینگ حساب فعال ندارد.`
            : `${meta.label} را انتخاب کنید.`,
          isSale ? "cd-account-errors" : meta.id,
        );
      }
    });

    setClientErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      focusCreateField(firstInvalidId);
      return;
    }

    const body: Record<string, unknown> = {
      direction,
      period_id: periodId,
      issue_date: issueDate,
      due_date: dueDate || null,
      party_id: partyId,
      warehouse_id: totals.hasGoods ? effectiveWarehouseId || null : null,
      currency: "IRR",
      invoice_discount: asciiDigits(invoiceDiscount).trim() || "0",
      settlement_type: settlementType,
      description: docDesc.trim(),
      lines: lines.map((l) => ({
        line_kind: l.line_kind,
        item_id: l.line_kind === "goods" ? l.item_id || null : null,
        description: l.description.trim() || "ردیف کالا/خدمت",
        quantity: Number(asciiDigits(l.quantity).trim() || "1"),
        unit_price: asciiDigits(l.unit_price).trim() || "0",
        line_discount: asciiDigits(l.line_discount).trim() || "0",
        vat_rate_pct: asciiDigits(l.vat_rate_pct || "0").trim() || "0",
      })),
    };

    if (isSale) {
      if (totals.hasGoods) {
        body.revenue_account_id = selectedAccountId("revenue_account_id");
        body.cost_account_id = selectedAccountId("cost_account_id");
      }
      if (totals.hasService) {
        body.service_revenue_account_id = selectedAccountId("service_revenue_account_id");
      }
    } else if (totals.hasService) {
      body.expense_account_id = selectedAccountId("expense_account_id");
    }

    if (settlementType === "on_account") {
      body.counterparty_account_id = selectedAccountId("counterparty_account_id");
    } else if (settlementType === "cash") {
      body.cash_account_id = selectedAccountId("cash_account_id");
    } else {
      body.cash_amount = asciiDigits(cashAmount).trim() || "0";
      body.cheque_amount = asciiDigits(chequeAmount).trim() || "0";
      body.on_account_amount = asciiDigits(onAccountAmount).trim() || "0";
      if (parsedCashAmount !== null && parsedCashAmount > 0n) {
        body.cash_account_id = selectedAccountId("cash_account_id");
      }
      if (parsedChequeAmount !== null && parsedChequeAmount > 0n) {
        body.cheque_account_id = selectedAccountId("cheque_account_id");
        body.cheque_number = chequeNumber.trim();
        body.cheque_due_date = chequeDueDate;
      }
      if (parsedOnAccountAmount !== null && parsedOnAccountAmount > 0n) {
        body.counterparty_account_id = selectedAccountId("counterparty_account_id");
      }
    }

    void cmd.run<CommercialDocumentDraftResponse>(
      workspace.companyPath("commercial/documents"),
      { body },
      () => {
        setCreateOpen(false);
        resetCreateForm();
        if (onCreated) onCreated();
        else refreshAll();
      },
      "پیش‌نویس فاکتور تجاری چندردیفی ایجاد شد.",
    );
  }

  function handleSubmitReturn() {
    const periodId = workspace.periodId;
    if (!detailDoc || !periodId) return;
    const retLines = detailDoc.lines
      .filter((l) => Number(retQuantities[l.id] || "0") > 0)
      .map((l) => ({
        document_line_id: l.id,
        quantity: Number(retQuantities[l.id]),
        condition: retConditions[l.id] ?? "healthy",
      }));
    if (!retLines.length || !retReason.trim()) return;
    void cmd.run(
      workspace.companyPath(`commercial/documents/${detailDoc.id}/returns`),
      { body: { period_id: periodId, date: retDate, reason: retReason.trim(), lines: retLines } },
      () => {
        setDetailDoc(null);
        refreshAll();
      },
      "پیش‌نویس برگشت از معامله ثبت شد.",
    );
  }

  function handleQuarantineDecision() {
    const periodId = workspace.periodId;
    if (!decidingQuarantine || !periodId || !qNote.trim()) return;
    const body: Record<string, unknown> = {
      decision: qDecision,
      period_id: periodId,
      date: qDate,
      note: qNote.trim(),
    };
    if (qDecision === "restocked" && qCostAccountId) {
      body.cost_account_id = qCostAccountId;
    }
    void cmd.run(
      workspace.companyPath(`commercial/quarantine/${decidingQuarantine.id}/decide`),
      { body },
      () => {
        setDecidingQuarantine(null);
        refreshAll();
      },
      "تصمیم قرنطینه کالا ثبت شد.",
    );
  }

  function handleCreditSubmit() {
    const periodId = workspace.periodId;
    if (!creditAction) return;
    if (creditAction.mode === "apply") {
      void cmd.run(
        workspace.companyPath(`commercial/credits/${creditAction.credit.id}/apply`),
        {
          body: {
            target_document_id: creditTargetDocId,
            amount_irr: creditAmount.trim(),
            date: creditDate,
          },
        },
        () => {
          setCreditAction(null);
          refreshAll();
        },
        "اعتبار طرف‌حساب به فاکتور اعمال شد.",
      );
      return;
    }
    if (!periodId) return;
    void cmd.run(
      workspace.companyPath(`commercial/credits/${creditAction.credit.id}/refund-draft`),
      {
        body: {
          period_id: periodId,
          date: creditDate,
          amount_irr: creditAmount.trim(),
          cash_account_id: creditCashAccount,
          counterparty_account_id: creditCpAccount,
          reason: creditReason.trim(),
        },
      },
      () => {
        setCreditAction(null);
        refreshAll();
      },
      "پیش‌نویس استرداد اعتبار ساخته شد.",
    );
  }

  const docRows = docs.data?.items ?? [];
  const quarantineRows = quarantine.data?.items ?? [];
  const creditRows = credits.data?.items ?? [];

  const eligibleTargetDocs = creditAction
    ? docRows.filter(
        (d) =>
          d.counterparty_id === creditAction.credit.counterparty_id &&
          (d.status === "posted" || d.status === "partially_returned") &&
          parseBigIntSafe(d.open_balance_irr || "0") > BigInt(0),
      )
    : [];

  return {
    workspace,
    isServiceMode,
    isSale,
    subTab,
    setSubTab,
    docs,
    quarantine,
    credits,
    counterparties,
    inventory,
    accounts,
    cmd,
    createOpen,
    setCreateOpen,
    detailDoc,
    setDetailDoc,
    decidingQuarantine,
    setDecidingQuarantine,
    creditAction,
    setCreditAction,
    partyQuickCreateOpen,
    setPartyQuickCreateOpen,
    viewingParty,
    setViewingParty,
    issueDate,
    setIssueDate,
    dueDate,
    setDueDate,
    partyId,
    setPartyId,
    setWarehouseId,
    invoiceDiscount,
    setInvoiceDiscount,
    settlementType,
    setSettlementType,
    cashAmount,
    setCashAmount,
    chequeAmount,
    setChequeAmount,
    onAccountAmount,
    setOnAccountAmount,
    chequeNumber,
    setChequeNumber,
    chequeDueDate,
    setChequeDueDate,
    accountOverrides,
    setAccountOverrides,
    docDesc,
    setDocDesc,
    lines,
    setLines,
    clientErrors,
    lineErrors,
    setLineErrors,
    retDate,
    setRetDate,
    retReason,
    setRetReason,
    retQuantities,
    setRetQuantities,
    retConditions,
    setRetConditions,
    qDecision,
    setQDecision,
    qDate,
    setQDate,
    qNote,
    setQNote,
    qCostAccountId,
    setQCostAccountId,
    creditTargetDocId,
    setCreditTargetDocId,
    creditAmount,
    setCreditAmount,
    creditDate,
    setCreditDate,
    creditCashAccount,
    setCreditCashAccount,
    creditCpAccount,
    setCreditCpAccount,
    creditReason,
    setCreditReason,
    cpOptions,
    cpNames,
    goodsItems,
    itemOptions,
    whOptions,
    accOptions,
    findRoleAccount,
    effectiveWarehouseId,
    totals,
    parsedCashAmount,
    parsedChequeAmount,
    parsedOnAccountAmount,
    accountConfig,
    selectedAccountId,
    clearClientError,
    openCreateDrawer,
    validateCreateDetails,
    handleCreateDoc,
    handleSubmitReturn,
    handleQuarantineDecision,
    handleCreditSubmit,
    docRows,
    quarantineRows,
    creditRows,
    eligibleTargetDocs,
  };
}
