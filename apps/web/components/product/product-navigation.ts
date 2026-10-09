import {
  LayoutDashboard, WalletCards, ArrowDownLeft, ArrowUpRight,
  ClipboardCheck, FileText,
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
    { href: `${base}/reports`, label: "گزارش‌ها", icon: FileText },
  ] }];
  return { primary, secondary };
}

export function isProductItemActive(pathname: string, href: string, base: string) {
  const target = href.split("?")[0];
  const relatedRoutes: Record<string, string[]> = {
    [`${base}/cashflow`]: ["cashflow", "scenarios"],
    [`${base}/findings`]: ["findings", "actions", "reconciliation"],
  };
  return relatedRoutes[target]?.some((route) => containsRoute(pathname, `${base}/${route}`))
    ?? containsRoute(pathname, target);
}

export function productSectionNavigation(pathname: string, base: string) {
  if (containsRoute(pathname, `${base}/scenarios`)) {
    return { label: "نقدینگی", items: [
      { href: `${base}/cashflow`, label: "وضعیت و پیش‌بینی" },
      { href: `${base}/scenarios`, label: "سناریوها" },
    ] };
  }
  return null;
}
