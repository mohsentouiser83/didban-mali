import {
  ArrowsLeftRightIcon,
  ChartLineUpIcon,
  FilesIcon,
  ReceiptIcon,
  ShieldCheckIcon,
  SquaresFourIcon,
  UsersThreeIcon,
  WalletIcon,
} from "@phosphor-icons/react";

export const navigationGroups = [
  {
    label: "فضای مالی",
    items: [
      { href: "/", label: "خلاصه مالی", icon: SquaresFourIcon },
      { href: "/review", label: "بررسی و شواهد", icon: ShieldCheckIcon },
      {
        href: "/reconciliation",
        label: "تطبیق بانک و دفتر",
        icon: ArrowsLeftRightIcon,
      },
    ],
  },
  {
    label: "عملیات و گزارش",
    items: [
      { href: "/receivables", label: "مطالبات", icon: UsersThreeIcon },
      { href: "/payables", label: "بدهی‌ها", icon: WalletIcon },
      { href: "/cashflow", label: "نقدینگی دوره", icon: ChartLineUpIcon },
      {
        href: "/cashflow/forecast",
        label: "پیش‌بینی ۳۰روزه",
        icon: ChartLineUpIcon,
      },
      { href: "/moadian", label: "مؤدیان", icon: ReceiptIcon },
      {
        href: "/settlements",
        label: "دریافت و پرداخت",
        icon: ArrowsLeftRightIcon,
      },
      { href: "/reports", label: "گزارش‌ها", icon: FilesIcon },
    ],
  },
];
