import {
  ArrowsLeftRightIcon,
  BooksIcon,
  ChartLineUpIcon,
  FilesIcon,
  PackageIcon,
  ReceiptIcon,
  ShieldCheckIcon,
  SparkleIcon,
  SquaresFourIcon,
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
}

export interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

export const navigationGroups: NavigationGroup[] = [
  {
    label: "فضای مالی",
    items: [
      { href: "/", label: "خلاصه مالی", icon: SquaresFourIcon },
      {
        href: "/assistant",
        label: "هوش مصنوعی",
        icon: SparkleIcon,
        badge: "AI",
      },
      { href: "/review", label: "بررسی و شواهد", icon: ShieldCheckIcon },
      {
        href: "/reconciliation",
        label: "تطبیق بانک و دفتر",
        icon: ArrowsLeftRightIcon,
      },
    ],
  },
  {
    label: "عملیات مالی",
    items: [
      { href: "/accounting", label: "اسناد حسابداری", icon: BooksIcon },
      {
        href: "/settlements",
        label: "دریافت و پرداخت",
        icon: ArrowsLeftRightIcon,
      },
      { href: "/receivables", label: "مطالبات", icon: UsersThreeIcon },
      { href: "/payables", label: "بدهی‌ها", icon: WalletIcon },
      {
        href: "/accounting/inventory",
        label: "موجودی و انبار",
        icon: PackageIcon,
      },
    ],
  },
  {
    label: "تحلیل و گزارش",
    items: [
      { href: "/cashflow", label: "نقدینگی", icon: ChartLineUpIcon },
      { href: "/moadian", label: "مؤدیان", icon: ReceiptIcon },
      {
        href: "/employee-reports",
        label: "کارمندان و حقوق",
        icon: UsersThreeIcon,
      },
      { href: "/reports", label: "گزارش‌ها", icon: FilesIcon },
    ],
  },
  {
    label: "مدارک و فایل‌ها",
    items: [
      {
        href: "/sources",
        label: "فایل‌ها و مدارک",
        icon: FilesIcon,
      },
    ],
  },
];
