import {
  ArrowDownIcon, ArrowUpIcon, ArrowsLeftRightIcon, BankIcon, BooksIcon, CalendarBlankIcon, ChartLineUpIcon,
  FilesIcon, PackageIcon, ReceiptIcon, ShoppingCartIcon, SquaresFourIcon,
  StorefrontIcon, UsersThreeIcon, WalletIcon, type Icon,
} from "@phosphor-icons/react";
import { builtInReports } from "./report-archive-catalog";

export interface NavigationItem {
  href: string;
  label: string;
  icon: Icon;
  matches?: string[];
  children?: NavigationItem[];
}

export interface NavigationGroup {
  label?: string;
  items: NavigationItem[];
}

export const navigationGroups: NavigationGroup[] = [
  { items: [{ href: "/", label: "داشبورد", icon: SquaresFourIcon }] },
  {
    label: "حسابداری",
    items: [
      {
        href: "/accounting", label: "اسناد حسابداری", icon: BooksIcon,
        children: [
          { href: "/accounting", label: "فهرست اسناد", icon: FilesIcon },
          { href: "/accounting/electronic-ledgers", label: "دفاتر الکترونیک", icon: BooksIcon },
          { href: "/accounting/period-end", label: "بستن و افتتاح دوره", icon: CalendarBlankIcon },
        ],
      },
      {
        href: "/receivables", label: "خرید و فروش", icon: ShoppingCartIcon,
        children: [
          { href: "/commercial/proformas", label: "پیش‌فاکتورها", icon: FilesIcon },
          { href: "/receivables", label: "فاکتورهای فروش", icon: ReceiptIcon },
          { href: "/payables", label: "فاکتورهای خرید", icon: ShoppingCartIcon },
          { href: "/reconciliation/counterparties", label: "تطبیق طرف‌حساب‌ها", icon: ArrowsLeftRightIcon, matches: ["/reconciliation/counterparty"] },
        ],
      },
      {
        href: "/settlements", label: "دریافت و پرداخت", icon: ArrowsLeftRightIcon,
        children: [
          { href: "/settlements", label: "دریافت‌ها و پرداخت‌ها", icon: ArrowsLeftRightIcon },
          { href: "/settlements/cheques", label: "چک‌های صیادی", icon: ReceiptIcon },
          { href: "/reconciliation", label: "تطبیق بانک و دفتر", icon: BankIcon, matches: ["/reconciliation/bank"] },
        ],
      },
      {
        href: "/accounting/inventory", label: "انبار", icon: PackageIcon,
        children: [
          { href: "/accounting/inventory/receipts", label: "رسید انبار", icon: ArrowDownIcon },
          { href: "/accounting/inventory/issues", label: "خروج انبار", icon: ArrowUpIcon },
          { href: "/accounting/inventory/items", label: "کالاها و خدمات", icon: ShoppingCartIcon },
          { href: "/accounting/inventory/warehouses", label: "انبارها", icon: StorefrontIcon },
        ],
      },
      {
        href: "/payroll", label: "حقوق و دستمزد", icon: UsersThreeIcon,
        children: [
          { href: "/payroll/employees", label: "کارمندان", icon: UsersThreeIcon },
          { href: "/payroll/contracts", label: "قرارداد", icon: BooksIcon },
          { href: "/payroll", label: "لیست حقوق و فیش‌ها", icon: WalletIcon },
        ],
      },
      {
        href: "/moadian", label: "مؤدیان", icon: ReceiptIcon,
        children: [
          { href: "/moadian", label: "صورتحساب‌های کارپوشه", icon: ReceiptIcon },
          { href: "/moadian/transmissions", label: "جمع‌آوری و ارسال", icon: ArrowsLeftRightIcon },
          { href: "/moadian/reports", label: "گزارش صورتحساب‌های مؤدیان", icon: FilesIcon },
          { href: "/reconciliation/moadian", label: "تطبیق کارپوشه مؤدیان", icon: ArrowsLeftRightIcon },
        ],
      },
    ],
  },
  {
    label: "گزارش‌ها",
    items: [
      {
        href: "/reports", label: "گزارش‌ها", icon: FilesIcon,
        matches: [
          "/reports/studio", "/reports/builder", "/accounting/journals",
          ...builtInReports.map(({ href }) => href),
        ],
      },
      {
        href: "/cashflow", label: "نقدینگی", icon: WalletIcon,
        children: [
          { href: "/cashflow/forecast", label: "پیش‌بینی ۳۰روزه", icon: ChartLineUpIcon },
          { href: "/cashflow/scenarios", label: "سناریوهای نقدینگی", icon: FilesIcon },
        ],
      },
    ],
  },
];

export const navigationDestinations = navigationGroups.flatMap((group) =>
  group.items.flatMap((item) => item.children ?? [item]),
);

export function isCurrentNavItem(itemHref: string, pathname: string) {
  const path = pathname.replace(/\/$/, "") || "/";
  const normalizedItemHref = itemHref.replace(/\/$/, "") || "/";
  if (path === normalizedItemHref) return true;
  const exact = navigationDestinations.find((item) => item.href === path);
  if (exact) return exact.href === itemHref;

  const active = navigationDestinations.find((item) =>
    item.matches?.some((match) => path === match || path.startsWith(match + "/")),
  ) ?? navigationDestinations
    .filter((item) => item.href !== "/" && path.startsWith(item.href + "/"))
    .reduce<NavigationItem | undefined>((best, item) =>
      !best || item.href.length > best.href.length ? item : best, undefined);
  return active?.href === itemHref;
}

export function isItemOrChildActive(item: NavigationItem, pathname: string): boolean {
  return item.children
    ? item.children.some((child) => isItemOrChildActive(child, pathname))
    : item.href === pathname || isCurrentNavItem(item.href, pathname);
}
