"use client";
import { usePathname } from "next/navigation";
import { navigationGroups } from "@/lib/navigation-catalog";
import { settingsCatalog } from "@/lib/settings-catalog";
import { useExistingSourceReport } from "@/hooks/use-existing-source-report";
import { FormMessage } from "@/components/ui/field";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/content-states";
import { Select } from "@/components/ui/select";
import { useWorkspace } from "@/hooks/workspace";
import {
  BuildingsIcon,
  PackageIcon,
  StorefrontIcon,
  CalendarBlankIcon,
  UploadSimpleIcon,
  FilesIcon,
  UsersThreeIcon,
  BellIcon,
  ChatCircleIcon,
  GearIcon,
  ReceiptIcon,
} from "@phosphor-icons/react";
import { PageTitle } from "@/components/ui/page-title";
import type { Icon } from "@phosphor-icons/react";
import { cn, displayDate } from "@/lib/utils";
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
  const destination = navigationGroups.flatMap((group) => group.items)
    .find((item) => item.href === pathname)
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
    "/review/expense-changes": { title: "تغییرات هزینه", icon: FilesIcon },
    "/reports/companies": { title: "مقایسه شرکت‌ها", icon: FilesIcon },
    "/reports/dimensions": { title: "گزارش پروژه و مرکز هزینه", icon: FilesIcon },
    "/reports/builder": { title: "گزارش‌ساز", icon: FilesIcon },
    "/employee-reports": { title: "گزارش کارمندان", icon: UsersThreeIcon },
    "/settlements/plans": { title: "برنامه پرداخت", icon: CalendarBlankIcon },
    "/notifications": { title: "اعلان‌ها", icon: BellIcon },
    "/assistant": { title: "دستیار مالی", icon: ChatCircleIcon },
    "/settings": { title: "تنظیمات", icon: GearIcon },
  };
  const fallback = pathname.startsWith("/uploads/")
    ? { title: "پرونده پردازش", icon: FilesIcon }
    : extra[pathname] || { title: "فضای مالی", icon: FilesIcon };
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
export function PeriodFilter() {
  const { periodId, setPeriodId, periods } = useWorkspace();
  const current = periods.find((period) => period.id === periodId);
  return (
    <div className="mb-5 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-panel border border-border bg-surface p-4 sm:px-5">
      <div className="flex w-full min-w-0 flex-wrap items-center gap-3 sm:w-auto">
        <label
          htmlFor="report-period"
          className="flex items-center gap-2 text-sm text-muted"
        >
          <CalendarBlankIcon size={18} aria-hidden className="text-primary" />
          دوره گزارش
        </label>
        <Select
          id="report-period"
          label="دوره گزارش"
          value={periodId || "latest"}
          onValueChange={(id) => setPeriodId(id === "latest" ? "" : id)}
          options={[
            { value: "latest", label: "آخرین نتیجه" },
            ...periods.map((period) => ({
              value: period.id,
              label: period.name,
            })),
          ]}
          className="min-w-0 flex-1 sm:w-52 sm:flex-none"
        />
      </div>
      {current && (
        <p
          key={current.id}
          className="text-xs text-muted motion-safe:animate-fade-in"
        >
          {displayDate(current.start)} تا {displayDate(current.end)}
        </p>
      )}
    </div>
  );
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
            : "تصویر مالی شما از اینجا شروع می‌شود"
        }
        description={
          controller.available
            ? undefined
            : "فایل‌های Excel و CSV را اضافه کنید."
        }
        action={
          controller.available ? (
            <Button busy={controller.busy} onClick={controller.create}>
              محاسبه با اسناد موجود
            </Button>
          ) : controller.workspace.canWrite ? (
            <ButtonLink href="/uploads">
              <UploadSimpleIcon size={18} aria-hidden />
              بارگذاری اسناد
            </ButtonLink>
          ) : (
            <ButtonLink href="/reports" variant="secondary">
              گزارش‌ها
            </ButtonLink>
          )
        }
      />
      <FormMessage error>{controller.error?.message}</FormMessage>
    </Panel>
  );
}
