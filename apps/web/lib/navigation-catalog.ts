import {
  ArrowsLeftRightIcon,
  BankIcon,
  BarcodeIcon,
  BooksIcon,
  ChartLineUpIcon,
  FilesIcon,
  PackageIcon,
  ReceiptIcon,
  SquaresFourIcon,
  StorefrontIcon,
  UsersThreeIcon,
  WalletIcon,
  type Icon,
} from "@phosphor-icons/react";

export interface NavigationItem {
  href: string;
  label: string;
  icon: Icon;
  badge?: string;
  adminOnly?: boolean;
  children?: NavigationItem[];
}

export interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

export const navigationGroups: NavigationGroup[] = [
  {
    label: "داشبورد",
    items: [
      { href: "/", label: "خلاصه مالی", icon: SquaresFourIcon },
    ],
  },
  {
    label: "حسابداری",
    items: [
      { href: "/accounting", label: "اسناد", icon: BooksIcon },
      {
        href: "/settlements",
        label: "دریافت و پرداخت",
        icon: ArrowsLeftRightIcon,
      },
      {
        href: "/reconciliation",
        label: "تطبیق و مغایرت‌گیری",
        icon: ArrowsLeftRightIcon,
        children: [
          {
            href: "/reconciliation",
            label: "تطبیق بانک و دفتر",
            icon: BankIcon,
          },
          {
            href: "/reconciliation/counterparties",
            label: "تطبیق طرف‌حساب‌ها",
            icon: UsersThreeIcon,
          },
          {
            href: "/reconciliation/moadian",
            label: "تطبیق کارپوشه مؤدیان",
            icon: ReceiptIcon,
          },
        ],
      },
      {
        href: "/accounting/inventory",
        label: "انبار",
        icon: PackageIcon,
        children: [
          {
            href: "/accounting/inventory",
            label: "موجودی و کاردکس",
            icon: PackageIcon,
          },
          {
            href: "/accounting/inventory/items",
            label: "کالاها",
            icon: BarcodeIcon,
          },
          {
            href: "/accounting/inventory/warehouses",
            label: "انبارها",
            icon: StorefrontIcon,
          },
        ],
      },
      {
        href: "/payroll",
        label: "حقوق و دستمزد",
        icon: UsersThreeIcon,
      },
      { href: "/moadian", label: "مؤدیان", icon: ReceiptIcon },
    ],
  },
  {
    label: "گزارش‌ها",
    items: [
      { href: "/reports", label: "صورت‌های مالی", icon: FilesIcon },
      { href: "/reports/studio", label: "گزارش جدید", icon: ChartLineUpIcon },
      { href: "/cashflow", label: "تحلیل و نقدینگی", icon: WalletIcon },
    ],
  },
];

export function isCurrentNavItem(itemHref: string, pathname: string) {
  if (pathname === itemHref) return true;
  if (itemHref === "/accounting") {
    return (
      pathname.startsWith("/accounting/journals") ||
      pathname.startsWith("/accounting/operations") ||
      pathname.startsWith("/accounting/period-end")
    );
  }
  if (itemHref === "/accounting/inventory") {
    return (
      pathname === "/accounting/inventory" ||
      pathname === "/accounting/inventory/"
    );
  }
  if (itemHref === "/accounting/inventory/items") {
    return (
      pathname === "/accounting/inventory/items" ||
      pathname.startsWith("/accounting/inventory/items/")
    );
  }
  if (itemHref === "/accounting/inventory/warehouses") {
    return (
      pathname === "/accounting/inventory/warehouses" ||
      pathname.startsWith("/accounting/inventory/warehouses/")
    );
  }
  if (itemHref === "/reports") {
    return (
      (pathname.startsWith("/reports/") &&
        pathname !== "/employee-reports" &&
        pathname !== "/reports/studio" &&
        pathname !== "/reports/builder") ||
      pathname === "/reports"
    );
  }
  if (itemHref === "/reports/studio" || itemHref === "/reports/builder") {
    return (
      pathname.startsWith("/reports/studio") ||
      pathname.startsWith("/reports/builder")
    );
  }
  if (itemHref === "/payroll") {
    return (
      pathname === "/payroll" ||
      pathname.startsWith("/payroll/") ||
      pathname.startsWith("/employee-reports")
    );
  }
  if (itemHref === "/settlements") {
    return (
      pathname.startsWith("/settlements/") ||
      pathname === "/receivables" ||
      pathname.startsWith("/receivables/") ||
      pathname === "/payables" ||
      pathname.startsWith("/payables/")
    );
  }
  if (itemHref === "/moadian") {
    return pathname.startsWith("/moadian/");
  }
  if (itemHref === "/cashflow") {
    return pathname.startsWith("/cashflow/");
  }
  if (itemHref === "/reconciliation") {
    return (
      pathname === "/reconciliation" ||
      pathname === "/reconciliation/" ||
      pathname === "/reconciliation/bank" ||
      pathname.startsWith("/reconciliation/bank/")
    );
  }
  if (itemHref === "/reconciliation/counterparties") {
    return (
      pathname === "/reconciliation/counterparties" ||
      pathname.startsWith("/reconciliation/counterparties/") ||
      pathname.startsWith("/reconciliation/counterpart")
    );
  }
  if (itemHref === "/reconciliation/moadian") {
    return (
      pathname === "/reconciliation/moadian" ||
      pathname.startsWith("/reconciliation/moadian/")
    );
  }
  if (itemHref.startsWith("/settings/")) {
    return pathname.startsWith(itemHref + "/");
  }
  return false;
}

export function isItemOrChildActive(item: NavigationItem, pathname: string): boolean {
  if (isCurrentNavItem(item.href, pathname)) return true;
  if (item.children?.some((child) => isItemOrChildActive(child, pathname))) {
    return true;
  }
  if (
    item.href === "/accounting/inventory" &&
    pathname.startsWith("/accounting/inventory")
  ) {
    return true;
  }
  if (
    item.href === "/reconciliation" &&
    pathname.startsWith("/reconciliation")
  ) {
    return true;
  }
  return false;
}

