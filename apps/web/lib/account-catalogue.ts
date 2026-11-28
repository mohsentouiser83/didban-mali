import type { ParsedTableImport } from "@/components/ui/table-import-dialog";
import type { AccountNature, LedgerAccount } from "./accounting";
import { asciiDigits } from "./utils";

export type AccountLevel = "group" | "general" | "subsidiary" | "detail";
export const ACCOUNT_LEVEL_OPTIONS: { value: AccountLevel; label: string }[] = [
  { value: "group", label: "گروه" },
  { value: "general", label: "کل" },
  { value: "subsidiary", label: "معین" },
  { value: "detail", label: "تفصیلی" },
];
export const accountLevelLabel = (level?: string | null) =>
  ACCOUNT_LEVEL_OPTIONS.find((option) => option.value === level)?.label || "تعیین‌نشده";
export function normalizeAccountSearch(value: string) {
  return asciiDigits(value)
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200c\s]+/g, " ")
    .trim()
    .toLowerCase();
}
export const parentAccountLevel = (level: string): AccountLevel | null =>
  level === "detail"
    ? "subsidiary"
    : level === "subsidiary"
      ? "general"
      : level === "general"
        ? "group"
        : null;

export const childAccountLevel = (level?: string | null): AccountLevel | null =>
  level === "group"
    ? "general"
    : level === "general"
      ? "subsidiary"
      : level === "subsidiary"
        ? "detail"
        : null;

export interface AccountTreeRow {
  account: LedgerAccount;
  depth: number;
  hasChildren: boolean;
  childCount: number;
  expanded: boolean;
  childLevel: AccountLevel | null;
}

export function buildAccountTreeRows(
  accounts: LedgerAccount[],
  collapsedIds: ReadonlySet<string>,
): AccountTreeRow[] {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const childrenMap = new Map<string, LedgerAccount[]>();
  const roots: LedgerAccount[] = [];

  for (const account of accounts) {
    const parentId = account.parent_id;
    if (parentId && parentId !== account.id && byId.has(parentId)) {
      const list = childrenMap.get(parentId) ?? [];
      list.push(account);
      childrenMap.set(parentId, list);
    } else {
      roots.push(account);
    }
  }

  const byCode = (a: LedgerAccount, b: LedgerAccount) =>
    a.code.localeCompare(b.code, "en", { numeric: true });
  roots.sort(byCode);
  for (const list of childrenMap.values()) {
    list.sort(byCode);
  }

  const rows: AccountTreeRow[] = [];
  const visited = new Set<string>();

  function visit(account: LedgerAccount, depth: number) {
    if (visited.has(account.id)) return;
    visited.add(account.id);
    const children = childrenMap.get(account.id) ?? [];
    const hasChildren = children.length > 0;
    const expanded = !collapsedIds.has(account.id);
    rows.push({
      account,
      depth,
      hasChildren,
      childCount: children.length,
      expanded,
      childLevel: childAccountLevel(account.level),
    });
    if (hasChildren && expanded) {
      for (const child of children) {
        visit(child, depth + 1);
      }
    }
  }

  for (const root of roots) {
    visit(root, 0);
  }
  return rows;
}

export function accountPostableStatus(
  account: Pick<LedgerAccount, "active" | "level" | "has_children" | "postable">,
): { postable: boolean; label: string; reason?: string } {
  if (!account.active) {
    return {
      postable: false,
      label: "غیرقابل ثبت (غیرفعال)",
      reason: "حساب غیرفعال است و در اسناد جدید قابل انتخاب نیست.",
    };
  }
  if (account.level === "group") {
    return {
      postable: false,
      label: "غیرقابل ثبت (گروه)",
      reason: "حساب سطح گروه مستقیم سند نمی‌گیرد.",
    };
  }
  if (account.has_children || account.postable === false) {
    return {
      postable: false,
      label: "غیرقابل ثبت (دارای زیرمجموعه)",
      reason: "حساب دارای زیرمجموعه است؛ ثبت سند روی زیرحساب‌ها انجام می‌شود.",
    };
  }
  return { postable: true, label: "قابل ثبت سند" };
}

export function isAccountPostable(account: Pick<LedgerAccount, "active" | "level" | "has_children" | "postable">): boolean {
  return accountPostableStatus(account).postable;
}

export function suggestAccountCode(
  accounts: Pick<LedgerAccount, "id" | "code">[],
  level: string,
  parentId?: string | null,
): string {
  const existing = new Set(accounts.map((a) => a.code));
  if (level === "group") {
    const nums = accounts
      .map((a) => a.code)
      .filter((code) => /^[0-9]{2}$/.test(code))
      .map((code) => Number(code));
    const start = nums.length ? Math.max(...nums) + 1 : 1;
    for (let n = start; n <= 99; n++) {
      const candidate = String(n).padStart(2, "0");
      if (!existing.has(candidate)) return candidate;
    }
    for (let n = 1; n < start; n++) {
      const candidate = String(n).padStart(2, "0");
      if (!existing.has(candidate)) return candidate;
    }
    return "";
  }
  if (level === "detail" && !parentId) {
    let nextCode = 10_000_000;
    while (existing.has(String(nextCode))) nextCode++;
    return String(nextCode);
  }
  const parent = accounts.find((a) => a.id === parentId);
  if (!parent) return "";
  const parentExpectedLen = level === "general" ? 2 : level === "subsidiary" ? 4 : level === "detail" ? 6 : 0;
  if (!parentExpectedLen || !new RegExp(`^[0-9]{${parentExpectedLen}}$`).test(parent.code)) {
    return "";
  }
  const prefix = parent.code;
  const targetLen = prefix.length + 2;
  const nums = accounts
    .map((a) => a.code)
    .filter((code) => code.startsWith(prefix) && code.length === targetLen && /^[0-9]+$/.test(code.slice(prefix.length)))
    .map((code) => Number(code.slice(prefix.length)));
  const start = nums.length ? Math.max(...nums) + 1 : 1;
  for (let n = start; n <= 99; n++) {
    const candidate = `${prefix}${String(n).padStart(2, "0")}`;
    if (!existing.has(candidate)) return candidate;
  }
  for (let n = 1; n < start; n++) {
    const candidate = `${prefix}${String(n).padStart(2, "0")}`;
    if (!existing.has(candidate)) return candidate;
  }
  if (level === "detail") {
    for (let n = 100; n <= 999; n++) {
      const candidate = `${prefix}${String(n).padStart(3, "0")}`;
      if (!existing.has(candidate)) return candidate;
    }
  }
  return "";
}

export function validateAccountCodePattern(
  code: string,
  level: string,
  parentCode?: string | null,
): string | undefined {
  const trimmed = code.trim();
  if (!trimmed) return "کد حساب لازم است.";
  if (level === "group") {
    return /^[0-9]{2}$/.test(trimmed) ? undefined : "کد گروه باید دقیقاً ۲ رقم عددی باشد (مثلاً 11).";
  }
  if (level === "general") {
    if (!/^[0-9]{4}$/.test(trimmed) || (parentCode && !trimmed.startsWith(parentCode))) {
      return "کد کل باید دقیقاً ۴ رقم عددی باشد و با کد گروه بالادست شروع شود.";
    }
    return undefined;
  }
  if (level === "subsidiary") {
    if (!/^[0-9]{6}$/.test(trimmed) || (parentCode && !trimmed.startsWith(parentCode))) {
      return "کد معین باید دقیقاً ۶ رقم عددی باشد و با کد کل بالادست شروع شود.";
    }
    return undefined;
  }
  if (level === "detail") {
    if (!/^[0-9]{8,12}$/.test(trimmed)) return "کد تفصیلی باید ۸ تا ۱۲ رقم عددی باشد.";
    if (parentCode && !trimmed.startsWith(parentCode))
      return "کد تفصیلی باید با کد معین بالادست شروع شود.";
    return undefined;
  }
  return undefined;
}

export const TREASURY_ROLES = ["bank", "cash", "petty_cash", "cash_bank"] as const;
export type TreasuryRole = (typeof TREASURY_ROLES)[number];

export const ACCOUNT_ROLE_OPTIONS = [
  { value: "unassigned", label: "بدون نقش" },
  { value: "bank", label: "بانک" },
  { value: "cash", label: "صندوق" },
  { value: "petty_cash", label: "تنخواه‌گردان" },
  { value: "cash_bank", label: "موجودی نقد و بانک" },
  { value: "trade_receivable", label: "مطالبات تجاری" },
  { value: "trade_payable", label: "بدهی تجاری" },
  { value: "revenue", label: "درآمد" },
  { value: "expense", label: "هزینه" },
  { value: "other_asset", label: "سایر دارایی‌ها" },
  { value: "other_liability", label: "سایر بدهی‌ها" },
  { value: "equity", label: "حقوق مالکانه" },
  { value: "payroll_payable", label: "حقوق پرداختنی" },
  { value: "insurance_payable", label: "بیمه پرداختنی" },
  { value: "payroll_tax_payable", label: "مالیات حقوق پرداختنی" },
  { value: "other_payroll_deductions", label: "سایر کسورات پرداختنی" },
  { value: "inventory_nrv_allowance", label: "ذخیره کاهش ارزش موجودی (D35)" },
  { value: "inventory_nrv_expense", label: "هزینه کاهش ارزش موجودی (D35)" },
  { value: "inventory_nrv_recovery", label: "برگشت ذخیره کاهش ارزش موجودی (D35)" },
];

const INVENTORY_ACCOUNT_ROLES = new Set([
  "inventory_nrv_allowance",
  "inventory_nrv_expense",
  "inventory_nrv_recovery",
]);

export function visibleAccountRoleOptions(
  businessMode?: "trading" | "service",
  currentRole?: string | null,
) {
  if (businessMode !== "service") return ACCOUNT_ROLE_OPTIONS;
  return ACCOUNT_ROLE_OPTIONS.filter(
    (opt) => !INVENTORY_ACCOUNT_ROLES.has(opt.value) || opt.value === currentRole,
  );
}

export function treasuryRoleLabel(role?: string | null): string {
  if (role === "bank") return "بانک";
  if (role === "cash") return "صندوق";
  if (role === "petty_cash") return "تنخواه";
  if (role === "cash_bank") return "نقد و بانک";
  return "";
}

export function accountRoleLabel(role?: string | null): string {
  if (!role || role === "unassigned") return "بدون نقش";
  const match = ACCOUNT_ROLE_OPTIONS.find((opt) => opt.value === role);
  return match?.label || role;
}

export function isTreasuryAccount(account: { role?: string | null; name: string; code?: string }): boolean {
  if (account.role && (TREASURY_ROLES as readonly string[]).includes(account.role)) {
    return true;
  }
  const name = (account.name || "").toLowerCase();
  return name.includes("بانک") || name.includes("صندوق") || name.includes("تنخواه");
}

export function isTreasuryRoleKey(roleKey: string): boolean {
  return ["bank_a", "bank_b", "cash_bank", "bank", "cash", "petty_cash"].includes(roleKey);
}

/** Preserve text codes, explicit levels and batch parent references from uploaded tables. */
export function accountImportRows(parsed: ParsedTableImport) {
  const headers = parsed.headers.map((header) => header.trim().toLowerCase());
  const column = (aliases: string[]) => headers.findIndex((header) => aliases.includes(header));
  const codeIndex = column(["کد حساب", "کد", "code"]);
  const nameIndex = column(["نام حساب", "عنوان حساب", "نام", "عنوان", "شرح حساب", "name", "title"]);
  const natureIndex = column(["ماهیت", "ماهیت حساب", "nature"]);
  const levelIndex = column(["سطح", "سطح حساب", "level"]);
  const parentIndex = column(["کد بالادست", "کد حساب بالادست", "parent_code"]);
  if (codeIndex < 0 || nameIndex < 0) throw new Error("ستون کد حساب و نام حساب لازم است.");
  return parsed.rows.map((row) => {
    const text = (index: number) => index < 0 ? "" : String(row[index] ?? "").trim();
    const rawNature = text(natureIndex).toLowerCase();
    const nature: AccountNature = /بستان|credit/.test(rawNature) ? "credit"
      : /شناور|float/.test(rawNature) ? "floating"
        : /خنثی|بدون|none/.test(rawNature) ? "none" : "debit";
    const level = text(levelIndex);
    const parent = text(parentIndex);
    return {
      code: text(codeIndex), name: text(nameIndex), nature, active: true,
      ...(level ? { level } : {}), ...(parent ? { parent_code: parent } : {}),
    };
  });
}
