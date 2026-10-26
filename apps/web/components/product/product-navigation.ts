import {
  LayoutDashboard, WalletCards, ArrowDownLeft, ArrowUpRight,
  ClipboardCheck, FileText, UploadCloud, Calendar,
} from "@/components/ui/icons";
import type { ProductNavGroup } from "./product-sidebar";

const containsRoute = (pathname: string, route: string) =>
  pathname === route || pathname.startsWith(`${route}/`);

export function productNavigation(base: string, actionCount = 0, criticalCount = 0) {
  const primary: ProductNavGroup[] = [{ items: [
    { href: `${base}/overview`, label: "داشبورد", icon: LayoutDashboard },
    { href: `${base}/cashflow`, label: "نقدینگی", icon: WalletCards },
    { href: `${base}/receivables`, label: "مطالبات", icon: ArrowDownLeft },
    { href: `${base}/payables`, label: "بدهی‌ها", icon: ArrowUpRight },
    {
      href: `${base}/findings`, label: "بررسی و پیگیری", icon: ClipboardCheck,
      badge: criticalCount > 0 ? criticalCount : actionCount > 0 ? actionCount : null,
      badgeVariant: criticalCount > 0 ? "critical" : "warning",
    },
  ] }];
  const secondary: ProductNavGroup[] = [{ items: [
    { href: `${base}/financial-periods`, label: "دوره‌های مالی", icon: Calendar },
    { href: `${base}/imports`, label: "بارگذاری اسناد", icon: UploadCloud },
    { href: `${base}/bank-accounts`, label: "ارتباط حساب‌های بانکی", icon: WalletCards },
    { href: `${base}/settlements`, label: "دریافت و پرداخت", icon: WalletCards },
    { href: `${base}/moadian`, label: "تطبیق مؤدیان", icon: ClipboardCheck },
    { href: `${base}/reports`, label: "گزارش‌ها", icon: FileText },
  ] }];
  return { primary, secondary };
}

export function isProductItemActive(pathname: string, href: string, base: string) {
  const target = href.split("?")[0];
  return containsRoute(pathname, target);
}

export function productSectionNavigation(_pathname: string, _base: string): { label: string; items: { href: string; label: string }[] } | null { return null; }
