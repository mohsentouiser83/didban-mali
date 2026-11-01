"use client";
import { GearIcon as HeaderIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { ArrowUpLeftIcon, GearSixIcon } from "@phosphor-icons/react";
import { useSettingsNavigation } from "@/hooks/use-settings-navigation";
import { settingsCategoryDestination } from "@/lib/settings-catalog";
import { EmptyState } from "@/components/ui/content-states";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader, Panel } from "./page-parts";

export function SettingsOverviewView({
  categoryKey,
}: {
  categoryKey?: string;
}) {
  const view = useSettingsNavigation();
  const category = categoryKey
    ? view.categories.find((category) => category.key === categoryKey)
    : undefined;
  const destinations = category
    ? category.items.map((item) => ({
        key: item.key,
        href: item.href,
        label: item.label,
        icon: item.icon,
        description: "",
      }))
    : view.categories.map((group) => ({
        key: group.key,
        href: settingsCategoryDestination(group),
        label: group.title,
        icon: group.icon,
        description:
          group.key === "company-access" && group.items.length === 1
            ? "اطلاعات شرکت"
            : group.description,
      }));
  return (
    <>
      <PageHeader icon={HeaderIcon}
        title={category?.title || "تنظیمات"}
        action={
          categoryKey && (
            <ButtonLink href="/settings" variant="secondary">
              <GearSixIcon size={18} aria-hidden className="text-primary" />
              همه تنظیمات
            </ButtonLink>
          )
        }
      />
      {categoryKey && !category ? (
        <Panel>
          <EmptyState title="این بخش در دسترس شما نیست" />
        </Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {destinations.map((destination) => (
            <Link
              key={destination.key}
              href={destination.href}
              className="group flex min-h-28 items-start justify-between gap-3 rounded-panel border border-border bg-surface p-5 outline-none transition-[background-color,border-color,box-shadow] duration-200 ease-interface hover:border-primary/25 hover:bg-primary-soft/40 hover:shadow-action focus-visible:border-primary/25 focus-visible:bg-primary-soft/40 focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
            >
              <span className="flex min-w-0 items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-control bg-primary-soft text-primary transition-colors duration-200 ease-interface group-hover:bg-primary group-hover:text-white group-focus-visible:bg-primary group-focus-visible:text-white motion-reduce:transition-none">
                  <destination.icon size={23} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{destination.label}</span>
                  {destination.description && (
                    <span className="mt-1 block text-xs leading-6 text-muted">
                      {destination.description}
                    </span>
                  )}
                </span>
              </span>
              <ArrowUpLeftIcon
                size={18}
                aria-hidden
                className="mt-1 shrink-0 text-primary transition-colors duration-200 group-hover:text-primary group-focus-visible:text-primary motion-reduce:transition-none"
              />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
