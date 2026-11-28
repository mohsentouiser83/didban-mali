import type { SelectOption } from "@/components/ui/select";

export type VoucherDirection = "receipts" | "issues";

export const voucherLabels = {
  receipts: {
    title: "رسید انبار",
    add: "افزودن رسید انبار",
    empty: "رسید انباری ثبت نشده است",
    warehouse: "انبار مقصد",
  },
  issues: {
    title: "خروج انبار",
    add: "افزودن خروج انبار",
    empty: "خروج انباری ثبت نشده است",
    warehouse: "انبار مبدأ",
  },
} as const;

export interface WarehouseVoucherOptions {
  can_create: boolean;
  items: (SelectOption & { unit: string })[];
  warehouses: SelectOption[];
  accounts: SelectOption[];
}

export interface WarehouseVoucher {
  id: string;
  draft_id: string;
  source_reference: string;
  date: string;
  warehouse_name: string;
  item_count: number;
  reference: string;
  description: string;
  state: "draft" | "posted" | "discarded" | "reversed";
}

export const voucherStates = {
  draft: { label: "پیش‌نویس", tone: "warning" },
  posted: { label: "ثبت نهایی", tone: "success" },
  discarded: { label: "کنار گذاشته‌شده", tone: "neutral" },
  reversed: { label: "برگشت‌خورده", tone: "neutral" },
} as const;
