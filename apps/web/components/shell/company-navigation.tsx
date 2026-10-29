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
import { Badge } from "@/components/ui/badge";
import { StatusMessage } from "@/components/ui/states";
import {
  useCompanyModules,
  usePayrollAccess,
} from "@/features/companies/use-company-modules";
import type { Schema } from "@didban/api-client";
import { CompanyNotifications } from "@/features/intake/notifications";

import { AppIcon, type AppIconName } from "@/components/ui/app-icon";

function moduleForPath(
  path: string,
): keyof Schema<"CompanyModuleValues"> | undefined {
  if (path.includes("/cashflow/forecast")) return "forecast";
  if (path.includes("/cashflow") || path.includes("/reconciliation"))
    return "cash";
  if (path.includes("/moadian")) return "moadian";
  if (path.includes("/receivables") || path.includes("/payables"))
    return "balances";
  if (path.includes("/settlements") || path.includes("/planned-payments"))
    return "settlements";
  if (path.includes("/statements")) return "accounting";
  if (path.includes("/employees") || path.includes("/payroll/"))
    return "payroll";
}

type Destination = { href: string; label: string; icon: AppIconName };
function NavigationGroup({
  label,
  icon: Icon,
  items,
  path,
  modules,
}: {
  label: string;
  icon: typeof Wallet;
  items: Destination[];
  path: string;
  modules?: Schema<"CompanyModuleValues">;
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
              <AppIcon name={item.icon} size={16} />
              {item.label}
              {modules &&
              moduleForPath(item.href) &&
              !modules[moduleForPath(item.href)!] ? (
                <Badge tone="neutral">غیرفعال</Badge>
              ) : null}
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
  const moduleQuery = useCompanyModules(id ?? "", !!id);
  const payrollAccess = usePayrollAccess(id ?? "", !!id);
  const modules = moduleQuery.data?.modules;
  const activeModule = moduleForPath(path);
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
            modules={modules}
            items={[
              {
                href: `${base}/reports`,
                label: "گزارش‌ها و خروجی‌ها",
                icon: "ClipboardList",
              },
              {
                href: `${base}/statements`,
                label: "صورت‌های مالی",
                icon: "ChartPie",
              },
              {
                href: `${base}/daily-report`,
                label: "گزارش روزانه مدیر مالی",
                icon: "CalendarCheck",
              },
              {
                href: `${base}/actionable-analysis`,
                label: "تحلیل و پیشنهادها",
                icon: "Sparkles",
              },
              {
                href: `${base}/financial-analysis`,
                label: "تحلیل تغییر سود و نقدینگی",
                icon: "ChartNoAxesCombined",
              },
              {
                href: `${base}/receivables`,
                label: "مطالبات",
                icon: "ArrowDownLeft",
              },
              {
                href: `${base}/payables`,
                label: "بدهی‌ها",
                icon: "ArrowUpRight",
              },
              {
                href: `${base}/settlements`,
                label: "دریافت‌وپرداخت",
                icon: "ArrowLeftRight",
              },
              {
                href: `${base}/planned-payments`,
                label: "برنامه پرداخت",
                icon: "CalendarDays",
              },
              {
                href: `${base}/cashflow`,
                label: "گزارش نقدینگی",
                icon: "Wallet",
              },
              {
                href: `${base}/cashflow/statement`,
                label: "صورت جریان وجوه نقد",
                icon: "Activity",
              },
              {
                href: `${base}/cashflow/forecast`,
                label: "پیش‌بینی ۳۰روزه",
                icon: "TrendingUp",
              },
            ]}
          />
          <NavigationGroup
            label="تطبیق‌ها"
            icon={GitCompareArrows}
            path={path}
            modules={modules}
            items={[
              {
                href: `${base}/reconciliation`,
                label: "بانک و دفتر",
                icon: "GitCompareArrows",
              },
              { href: `${base}/moadian`, label: "مؤدیان", icon: "FileCheck2" },
            ]}
          />
          {payrollAccess.data?.view ? (
            <NavigationGroup
              label="کارکنان و حقوق"
              icon={Wallet}
              path={path}
              modules={modules}
              items={[
                { href: `${base}/employees`, label: "کارکنان", icon: "Users" },
                {
                  href: `${base}/payroll/contracts`,
                  label: "قراردادها",
                  icon: "FileCheck2",
                },
                {
                  href: `${base}/payroll/work`,
                  label: "کارکرد",
                  icon: "CalendarCheck",
                },
                {
                  href: `${base}/payroll/rules`,
                  label: "قواعد حقوق",
                  icon: "SlidersHorizontal",
                },
                {
                  href: `${base}/payroll/runs`,
                  label: "محاسبه و فیش حقوق",
                  icon: "ClipboardList",
                },
              ]}
            />
          ) : null}
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
            modules={modules}
            items={[
              {
                href: `${base}/modules`,
                label: "ماژول‌های شرکت",
                icon: "Layers3",
              },
              {
                href: `${base}/periods`,
                label: "دوره‌های مالی",
                icon: "CalendarRange",
              },
              {
                href: `${base}/policies`,
                label: "سیاست‌های پردازش",
                icon: "SlidersHorizontal",
              },
              {
                href: `${base}/sources`,
                label: "فایل‌ها و نگهداری",
                icon: "Archive",
              },
              { href: `${base}/model-usage`, label: "مصرف مدل", icon: "Coins" },
            ]}
          />
        </nav>
        <CompanyNotifications company={id} />
      </div>
      {modules && activeModule && !modules[activeModule] ? (
        <div className="mx-auto mt-2 max-w-[1344px]">
          <StatusMessage>
            این ماژول غیرفعال است؛ سوابق قبلی قابل مشاهده‌اند.
          </StatusMessage>
        </div>
      ) : null}
    </div>
  );
}
