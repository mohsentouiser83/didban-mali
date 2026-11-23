"use client";
import { usePathname } from "next/navigation";
import { navigationDestinations } from "@/lib/navigation-catalog";
import { settingsCatalog } from "@/lib/settings-catalog";
import { useExistingSourceReport } from "@/hooks/use-existing-source-report";
import { FormMessage } from "@/components/ui/field";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/content-states";
import {
  BuildingsIcon,
  PackageIcon,
  StorefrontIcon,
  CalendarBlankIcon,
  FilesIcon,
  UsersThreeIcon,
  SparkleIcon,
  GearIcon,
  HashIcon,
  ReceiptIcon,
} from "@phosphor-icons/react";
import { PageTitle } from "@/components/ui/page-title";
import type { Icon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
export function PageHeader({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: Icon;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const pathname = usePathname();
  const destination = navigationDestinations.find((item) => item.href === pathname)
    || settingsCatalog.flatMap((category) => category.items)
      .find((item) => item.href === pathname);
  const category = settingsCatalog.find((item) => item.hub === pathname);
  return (
    <div className="mb-5 flex min-w-0 flex-wrap items-center justify-between gap-4 [&>div]:min-w-0 [&>a]:max-w-full [&>button]:max-w-full">
      <div>
        <PageTitle icon={destination?.icon || category?.icon || icon}>
          {destination?.label || category?.title || title}
        </PageTitle>
        {children}
      </div>
      {action}
    </div>
  );
}
/** Route identity for states that replace the page view. */
export function CurrentPageHeader() {
  const pathname = usePathname();
  const extra: Record<string, { title: string; icon: Icon }> = {
    "/accounting/inventory": { title: "موجودی و گردش کالا", icon: PackageIcon },
    "/accounting/inventory/items": { title: "کالاها", icon: PackageIcon },
    "/accounting/inventory/warehouses": { title: "انبارها", icon: StorefrontIcon },
    "/cashflow/scenarios": { title: "سناریوی نقدینگی", icon: FilesIcon },
    "/receivables/followups": { title: "پیگیری وصول", icon: UsersThreeIcon },
    "/moadian/transmissions": { title: "ارسال و استعلام صورتحساب", icon: ReceiptIcon },
    "/reports/companies": { title: "مقایسه شرکت‌ها", icon: FilesIcon },
    "/reports/dimensions": { title: "گزارش پروژه و مرکز هزینه", icon: FilesIcon },
    "/reports/builder": { title: "گزارش‌ساز", icon: FilesIcon },
    "/employee-reports": { title: "حقوق و دستمزد", icon: UsersThreeIcon },
    "/settlements/plans": { title: "برنامه پرداخت", icon: CalendarBlankIcon },
    "/assistant": { title: "تحلیل با هوش مصنوعی", icon: SparkleIcon },
    "/settings": { title: "تنظیمات", icon: GearIcon },
    "/settings/numbering": { title: "سیستم شماره‌گذاری", icon: HashIcon },
  };
  const fallback = pathname.startsWith("/uploads/")
    ? { title: "گزارش پردازش فایل", icon: FilesIcon }
    : extra[pathname] || { title: "پیشخوان", icon: FilesIcon };
  return <PageHeader {...fallback} />;
}
export function Panel({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-panel border border-border bg-surface p-5 sm:p-7 motion-safe:animate-fade-in",
        className,
      )}
    >
      {(title || action) && (
        <div className="mb-5 flex min-w-0 flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-sm font-medium">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
/** @deprecated انتخاب دوره مالی به هدر اصلی منتقل شده است */
export function PeriodFilter() {
  return null;
}
export function NoCompany() {
  return (
    <>
    <CurrentPageHeader />
    <EmptyState
      title="شرکت خود را اضافه کنید"
      action={
        <ButtonLink href="/settings/company">
          <BuildingsIcon size={18} aria-hidden />
          ایجاد شرکت
        </ButtonLink>
      }
    />
    </>
  );
}
export function NoResult() {
  const controller = useExistingSourceReport();
  return (
    <Panel>
      <EmptyState
        title={
          controller.available
            ? "گزارش این دوره آماده نیست"
            : "اطلاعات مالی برای این دوره ثبت نشده است"
        }
        description={
          controller.available
            ? undefined
            : "برای مشاهده تحلیل‌ها و گزارش‌ها، اسناد حسابداری یا عملیات مالی دوره را ثبت کنید."
        }
        action={
          controller.available ? (
            <Button busy={controller.busy} onClick={controller.create}>
              محاسبه گزارش
            </Button>
          ) : undefined
        }
      />
      <FormMessage error>{controller.error?.message}</FormMessage>
    </Panel>
  );
}
