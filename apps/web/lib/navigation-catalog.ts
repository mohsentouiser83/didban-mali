import {
  ArrowsLeftRightIcon, BankIcon, BooksIcon, CalendarBlankIcon, ChartLineUpIcon,
  FilesIcon, PackageIcon, ReceiptIcon, ShoppingCartIcon, SquaresFourIcon,
  StorefrontIcon, UsersThreeIcon, WalletIcon, type Icon,
} from "@phosphor-icons/react";

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
          { href: "/accounting", label: "پیش‌نویس‌ها", icon: FilesIcon },
          { href: "/accounting/journals", label: "دفتر روزنامه", icon: BooksIcon },
          { href: "/accounting/operations", label: "عملیات حسابداری", icon: ArrowsLeftRightIcon },
          { href: "/accounting/period-end", label: "بستن و افتتاح دوره", icon: CalendarBlankIcon },
        ],
      },
      {
        href: "/receivables", label: "خرید و فروش", icon: ShoppingCartIcon,
        children: [
          { href: "/receivables", label: "فاکتورهای فروش", icon: ReceiptIcon },
          { href: "/payables", label: "فاکتورهای خرید", icon: ShoppingCartIcon },
          { href: "/commercial/proformas", label: "پیش‌فاکتورها", icon: FilesIcon },
          { href: "/commercial/counterparties", label: "طرف‌حساب‌ها", icon: UsersThreeIcon },
        ],
      },
      {
        href: "/settlements", label: "دریافت و پرداخت", icon: ArrowsLeftRightIcon,
        children: [
          { href: "/settlements", label: "تسویه‌ها", icon: ArrowsLeftRightIcon },
          { href: "/settlements/cheques", label: "چک‌های صیادی", icon: ReceiptIcon },
          { href: "/settlements/plans", label: "برنامه پرداخت", icon: CalendarBlankIcon },
          { href: "/receivables/followups", label: "پیگیری وصول", icon: UsersThreeIcon },
        ],
      },
      {
        href: "/accounting/inventory", label: "انبار", icon: PackageIcon,
        children: [
          { href: "/accounting/inventory", label: "موجودی و کاردکس", icon: PackageIcon },
          { href: "/accounting/inventory/items", label: "کالاها و خدمات", icon: ShoppingCartIcon },
          { href: "/accounting/inventory/warehouses", label: "انبارها", icon: StorefrontIcon },
        ],
      },
      {
        href: "/payroll", label: "حقوق و دستمزد", icon: UsersThreeIcon,
        children: [
          { href: "/payroll", label: "لیست حقوق و فیش‌ها", icon: WalletIcon },
          { href: "/employee-reports", label: "گزارش کارکنان و کسورات", icon: FilesIcon },
        ],
      },
      {
        href: "/moadian", label: "مؤدیان", icon: ReceiptIcon,
        children: [
          { href: "/moadian", label: "صورتحساب‌های کارپوشه", icon: ReceiptIcon },
          { href: "/moadian/transmissions", label: "ارسال و استعلام", icon: ArrowsLeftRightIcon },
        ],
      },
    ],
  },
  {
    label: "گزارش‌ها",
    items: [
      {
        href: "/reports", label: "گزارش‌های مالی", icon: FilesIcon,
        children: [
          { href: "/reports", label: "آرشیو گزارش‌ها", icon: FilesIcon, matches: ["/reports/studio", "/reports/builder"] },
          { href: "/reports/native", label: "صورت‌های مالی", icon: BooksIcon },
          { href: "/reports/dimensions", label: "گزارش ابعاد مالی", icon: ChartLineUpIcon },
          { href: "/reports/companies", label: "مقایسه شرکت‌ها", icon: BankIcon },
          { href: "/reports/consolidation", label: "تلفیق شرکت‌ها", icon: FilesIcon },
        ],
      },
      {
        href: "/cashflow", label: "نقدینگی", icon: WalletIcon,
        children: [
          { href: "/cashflow", label: "جریان نقد دوره", icon: WalletIcon },
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
