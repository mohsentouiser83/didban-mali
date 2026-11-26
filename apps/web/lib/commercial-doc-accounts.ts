import type { LedgerAccount } from "./accounting";
import { isAccountPostable } from "./account-catalogue";
import { asciiDigits } from "./utils";

export type CommercialDirection = "sale" | "purchase";
export type CommercialLineKind = "goods" | "service";
export type CommercialSettlementType = "on_account" | "cash" | "mixed";

export interface CommercialDraftLineInput {
  key: number;
  line_kind: CommercialLineKind;
  item_id: string;
  description: string;
  quantity: string;
  unit_price: string;
  line_discount: string;
}

export type CommercialAccountSlot =
  | "revenue_account_id"
  | "cost_account_id"
  | "service_revenue_account_id"
  | "expense_account_id"
  | "counterparty_account_id"
  | "cash_account_id"
  | "cheque_account_id";

export interface CommercialAccountSlotResolution {
  slot: CommercialAccountSlot;
  required: boolean;
  defaultAccountId: string;
  status: "determined" | "ambiguous" | "missing";
  allowedAccounts: LedgerAccount[];
}

const CASH_ROLES = new Set(["cash_bank", "bank", "cash", "petty_cash"]);

export function parseNonNegativeInt(raw: string, emptyAsZero = false): bigint | null {
  const normalized = asciiDigits(raw).trim();
  if (!normalized) return emptyAsZero ? 0n : null;
  if (!/^\d+$/.test(normalized)) return null;
  return BigInt(normalized);
}

export interface ComputedCommercialLine {
  key: number;
  quantity: number | null;
  unitPrice: bigint | null;
  lineDiscount: bigint | null;
  lineGross: bigint | null;
  lineNet: bigint | null;
  errors: {
    item_id?: string;
    quantity?: string;
    unit_price?: string;
    line_discount?: string;
  };
}

export interface ComputedCommercialTotals {
  lines: ComputedCommercialLine[];
  grossTotal: bigint;
  lineDiscountTotal: bigint;
  netBeforeInvoiceDiscount: bigint;
  invoiceDiscount: bigint | null;
  invoiceDiscountError?: string;
  netTotal: bigint | null;
  hasGoods: boolean;
  hasService: boolean;
  hasLineErrors: boolean;
}

export function computeCommercialTotals(
  lines: CommercialDraftLineInput[],
  invoiceDiscountRaw: string,
): ComputedCommercialTotals {
  let grossTotal = 0n;
  let lineDiscountTotal = 0n;
  let hasLineErrors = false;
  let hasGoods = false;
  let hasService = false;

  const computedLines: ComputedCommercialLine[] = lines.map((line) => {
    if (line.line_kind === "goods") hasGoods = true;
    else hasService = true;

    const errors: ComputedCommercialLine["errors"] = {};
    if (line.line_kind === "goods" && !line.item_id) {
      errors.item_id = "کالای ردیف را انتخاب کنید.";
    }

    const qtyInt = parseNonNegativeInt(line.quantity, false);
    const quantity =
      qtyInt !== null && qtyInt >= 1n && qtyInt <= 1_000_000_000n ? Number(qtyInt) : null;
    if (quantity === null) {
      errors.quantity = "تعداد باید عدد صحیح مثبت باشد.";
    }

    const unitPrice = parseNonNegativeInt(line.unit_price, false);
    if (unitPrice === null || unitPrice <= 0n) {
      errors.unit_price = "قیمت واحد باید عدد صحیح مثبت باشد.";
    }

    const lineDiscount = parseNonNegativeInt(line.line_discount, true);
    if (lineDiscount === null || lineDiscount < 0n) {
      errors.line_discount = "تخفیف ردیف باید عدد صحیح نامنفی باشد.";
    }

    let lineGross: bigint | null = null;
    let lineNet: bigint | null = null;
    if (quantity !== null && unitPrice !== null) {
      lineGross = BigInt(quantity) * unitPrice;
      grossTotal += lineGross;
      if (lineDiscount !== null) {
        if (lineDiscount > lineGross) {
          errors.line_discount = "تخفیف ردیف نمی‌تواند از مبلغ کل ردیف بیشتر باشد.";
        } else {
          lineNet = lineGross - lineDiscount;
          lineDiscountTotal += lineDiscount;
        }
      }
    }

    if (Object.keys(errors).length > 0) hasLineErrors = true;
    return { key: line.key, quantity, unitPrice, lineDiscount, lineGross, lineNet, errors };
  });

  const netBeforeInvoiceDiscount = grossTotal - lineDiscountTotal;
  const invoiceDiscount = parseNonNegativeInt(invoiceDiscountRaw, true);
  let invoiceDiscountError: string | undefined;
  if (invoiceDiscount === null || invoiceDiscount < 0n) {
    invoiceDiscountError = "تخفیف کل باید عدد صحیح نامنفی باشد.";
  } else if (invoiceDiscount > netBeforeInvoiceDiscount) {
    invoiceDiscountError = "تخفیف کل نمی‌تواند از جمع خالص ردیف‌ها بیشتر باشد.";
  }

  const netTotal =
    !hasLineErrors && !invoiceDiscountError && invoiceDiscount !== null
      ? netBeforeInvoiceDiscount - invoiceDiscount
      : null;

  return {
    lines: computedLines,
    grossTotal,
    lineDiscountTotal,
    netBeforeInvoiceDiscount,
    invoiceDiscount,
    invoiceDiscountError,
    netTotal,
    hasGoods,
    hasService,
    hasLineErrors,
  };
}

function sortSlotAccounts(accounts: LedgerAccount[], exactRoles: ReadonlySet<string>): LedgerAccount[] {
  return [...accounts].sort((a, b) => {
    const aExact = a.role ? exactRoles.has(a.role) : false;
    const bExact = b.role ? exactRoles.has(b.role) : false;
    if (aExact !== bExact) return aExact ? -1 : 1;
    return a.code.localeCompare(b.code, "en", { numeric: true });
  });
}

function resolveSlot(
  slot: CommercialAccountSlot,
  required: boolean,
  postableAccounts: LedgerAccount[],
  exactRoles: string[],
  allowedRoles: string[],
  autoPreferredOrder?: string[][],
  excludeAutoIds?: ReadonlySet<string>,
): CommercialAccountSlotResolution {
  const exactSet = new Set(exactRoles);
  const allowedSet = new Set(allowedRoles);
  const allowedAccounts = sortSlotAccounts(
    postableAccounts.filter((a) => !a.role || allowedSet.has(a.role)),
    exactSet,
  );

  let defaultAccountId = "";
  let status: CommercialAccountSlotResolution["status"] = "missing";

  if (autoPreferredOrder && autoPreferredOrder.length > 0) {
    for (const tierRoles of autoPreferredOrder) {
      const tierSet = new Set(tierRoles);
      const tierMatches = postableAccounts.filter(
        (a) => a.role && tierSet.has(a.role) && !(excludeAutoIds?.has(a.id)),
      );
      if (tierMatches.length === 1) {
        defaultAccountId = tierMatches[0].id;
        status = "determined";
        break;
      }
      if (tierMatches.length > 1) {
        status = "ambiguous";
        break;
      }
    }
  } else {
    const exactMatches = postableAccounts.filter(
      (a) => a.role && exactSet.has(a.role) && !(excludeAutoIds?.has(a.id)),
    );
    if (exactMatches.length === 1) {
      defaultAccountId = exactMatches[0].id;
      status = "determined";
    } else if (exactMatches.length > 1) {
      status = "ambiguous";
    }
  }

  return {
    slot,
    required,
    defaultAccountId,
    status,
    allowedAccounts,
  };
}

export function resolveCommercialAccountConfig({
  accounts,
  direction,
  hasGoods,
  hasService,
  settlementType,
  cashAmount,
  chequeAmount,
  onAccountAmount,
  inventoryAccountIds,
}: {
  accounts: LedgerAccount[];
  direction: CommercialDirection;
  hasGoods: boolean;
  hasService: boolean;
  settlementType: CommercialSettlementType;
  cashAmount: bigint | null;
  chequeAmount: bigint | null;
  onAccountAmount: bigint | null;
  inventoryAccountIds?: ReadonlySet<string>;
}): Record<CommercialAccountSlot, CommercialAccountSlotResolution> {
  const postable = accounts.filter((a) => isAccountPostable(a));
  const sale = direction === "sale";

  const needsCounterparty =
    settlementType === "on_account" ||
    (settlementType === "mixed" && onAccountAmount !== null && onAccountAmount > 0n);
  const needsCash =
    settlementType === "cash" ||
    (settlementType === "mixed" && cashAmount !== null && cashAmount > 0n);
  const needsCheque =
    settlementType === "mixed" && chequeAmount !== null && chequeAmount > 0n;

  const cpRole = sale ? "trade_receivable" : "trade_payable";
  const cashRoles = Array.from(CASH_ROLES);
  const chequeExactRoles = sale ? ["notes_receivable", "other_asset"] : ["notes_payable", "other_liability"];
  const chequeTiers = sale
    ? [["notes_receivable"], ["other_asset"]]
    : [["notes_payable"], ["other_liability"]];

  return {
    revenue_account_id: resolveSlot(
      "revenue_account_id",
      sale && hasGoods,
      postable,
      ["revenue"],
      ["revenue"],
    ),
    cost_account_id: resolveSlot(
      "cost_account_id",
      sale && hasGoods,
      postable,
      ["expense"],
      ["expense"],
    ),
    service_revenue_account_id: resolveSlot(
      "service_revenue_account_id",
      sale && hasService,
      postable,
      ["revenue"],
      ["revenue"],
    ),
    expense_account_id: resolveSlot(
      "expense_account_id",
      !sale && hasService,
      postable,
      ["expense"],
      ["expense"],
    ),
    counterparty_account_id: resolveSlot(
      "counterparty_account_id",
      needsCounterparty,
      postable,
      [cpRole],
      [cpRole],
    ),
    cash_account_id: resolveSlot(
      "cash_account_id",
      needsCash,
      postable,
      cashRoles,
      cashRoles,
    ),
    cheque_account_id: resolveSlot(
      "cheque_account_id",
      needsCheque,
      postable,
      chequeExactRoles,
      chequeExactRoles,
      chequeTiers,
      sale ? inventoryAccountIds : undefined,
    ),
  };
}
