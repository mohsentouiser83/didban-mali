"use client";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import {
  Building2,
  ChartNoAxesCombined,
  UploadCloud,
  ChevronDown,
  Wallet,
  GitCompareArrows,
  Settings2,
  MessageCircle,
} from "lucide-react";
import { Button, cx } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CompanyNotifications } from "@/features/intake/notifications";

type Destination = { href: string; label: string };
function NavigationGroup({
  label,
  icon: Icon,
  items,
  path,
}: {
  label: string;
  icon: typeof Wallet;
  items: Destination[];
  path: string;
}) {
  const selected = items
    .filter((item) => path === item.href || path.startsWith(item.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cx(
            "gap-2 text-xs",
            selected ? "bg-accent text-primary" : "text-muted",
          )}
          aria-label={`${label}${selected ? `؛ ${selected.label}` : ""}`}
        >
          <Icon size={16} aria-hidden />
          <span>{selected?.label ?? label}</span>
          <ChevronDown size={14} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {items.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link
              href={item.href}
              prefetch={false}
              aria-current={selected?.href === item.href ? "page" : undefined}
              className={
                selected?.href === item.href
                  ? "bg-accent text-primary"
                  : undefined
              }
            >
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
export function CompanyNavigation() {
  const params = useParams<{ companyId?: string }>(),
    path = usePathname(),
    id = params.companyId;
  if (!id) return null;
  const base = `/companies/${id}`;
  return (
    <div className="border-b border-border bg-surface px-5 py-2 sm:px-7">
      <div className="mx-auto flex max-w-[1344px] items-start justify-between gap-2">
        <nav aria-label="بخش‌های شرکت" className="flex min-w-0 flex-wrap gap-1">
          {[
            { href: base, label: "نمای شرکت", icon: Building2 },
            {
              href: `${base}/results`,
              label: "نتایج مالی",
              icon: ChartNoAxesCombined,
            },
            { href: `${base}/uploads`, label: "بارگذاری", icon: UploadCloud },
          ].map((item) => {
            const active =
              path === item.href ||
              (item.href !== base && path.startsWith(item.href + "/"));
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-11 items-center gap-2 rounded-control px-3 text-xs font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none",
                  active
                    ? "bg-accent text-primary"
                    : "text-muted hover:bg-background",
                )}
              >
                <item.icon size={16} aria-hidden />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <NavigationGroup
            label="امور مالی"
            icon={Wallet}
            path={path}
            items={[
              { href: `${base}/reports`, label: "گزارش‌ها و خروجی‌ها" },
              { href: `${base}/receivables`, label: "مطالبات" },
              { href: `${base}/payables`, label: "بدهی‌ها" },
              { href: `${base}/settlements`, label: "دریافت‌وپرداخت" },
              { href: `${base}/planned-payments`, label: "برنامه پرداخت" },
              { href: `${base}/cashflow`, label: "گزارش نقدینگی" },
              { href: `${base}/cashflow/forecast`, label: "پیش‌بینی ۳۰روزه" },
            ]}
          />
          <NavigationGroup
            label="تطبیق‌ها"
            icon={GitCompareArrows}
            path={path}
            items={[
              { href: `${base}/reconciliation`, label: "بانک و دفتر" },
              { href: `${base}/moadian`, label: "مؤدیان" },
            ]}
          />
          <Link
            href={`${base}/assistant`}
            prefetch={false}
            aria-current={
              path.startsWith(`${base}/assistant`) ? "page" : undefined
            }
            className={cx(
              "flex min-h-11 items-center gap-2 rounded-control px-3 text-xs font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none",
              path.startsWith(`${base}/assistant`)
                ? "bg-accent text-primary"
                : "text-muted hover:bg-background",
            )}
          >
            <MessageCircle size={16} aria-hidden />
            <span>دستیار</span>
          </Link>
          <NavigationGroup
            label="مدیریت"
            icon={Settings2}
            path={path}
            items={[
              { href: `${base}/periods`, label: "دوره‌های مالی" },
              { href: `${base}/policies`, label: "سیاست‌های پردازش" },
              { href: `${base}/sources`, label: "فایل‌ها و نگهداری" },
              { href: `${base}/model-usage`, label: "مصرف مدل" },
            ]}
          />
        </nav>
        <CompanyNotifications company={id} />
      </div>
    </div>
  );
}
