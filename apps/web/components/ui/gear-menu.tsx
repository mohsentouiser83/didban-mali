"use client";
import { useId } from "react";
import Link from "next/link";
import {
  BooksIcon,
  BuildingsIcon,
  CalendarBlankIcon,
  CaretLeftIcon,
  GearSixIcon,
  HashIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import type { SettingsCategory, SettingsSearchResult } from "@/lib/settings-catalog";
import { cn, persian } from "@/lib/utils";

interface GearMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pathname: string;
  onNavigate: () => void;
  categories: SettingsCategory[];
  query?: string;
  onQueryChange?: (query: string) => void;
  results?: SettingsSearchResult[];
  onLogout?: () => Promise<void>;
  username?: string;
  signingOut?: boolean;
}

const defaultGearItems = [
  {
    key: "members",
    href: "/settings/members",
    label: "دسترسی",
    description: "مدیریت کاربران و مجوزهای شرکت",
    icon: UsersThreeIcon,
  },
  {
    key: "accounts",
    href: "/settings/accounts",
    label: "کدینگ حساب‌ها",
    description: "ساختار سرفصل‌ها و حساب‌های معین و تفصیلی",
    icon: BooksIcon,
  },
  {
    key: "periods",
    href: "/settings/periods",
    label: "دوره‌های مالی",
    description: "مدیریت سال‌ها و دوره‌های مالی فعال و بسته",
    icon: CalendarBlankIcon,
  },
  {
    key: "dimensions",
    href: "/settings/dimensions",
    label: "ابعاد مالی",
    description: "پروژه، شعبه و مرکز هزینه",
    icon: BuildingsIcon,
  },
  {
    key: "numbering",
    href: "/settings/numbering",
    label: "شماره‌گذاری",
    description: "الگو، پیشوند و شماره شروع موجودیت‌ها و اسناد",
    icon: HashIcon,
  },
];

export function GearMenu({
  open,
  onOpenChange,
  pathname,
  onNavigate,
  categories,
}: GearMenuProps) {
  const titleId = useId();

  const items = categories.length
    ? categories.flatMap((cat) => cat.items)
    : defaultGearItems;

  if (!items.length) return null;

  const isActive = items.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
  );

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          aria-label="تنظیمات"
          className={cn(
            "group size-10 min-h-10 rounded-full bg-transparent p-0 text-foreground shadow-none hover:bg-canvas hover:text-foreground active:scale-95",
            isActive && "bg-canvas text-foreground",
          )}
        >
          <GearSixIcon
            size={18}
            aria-hidden
            className="transition-transform duration-700 ease-out group-hover:rotate-180 motion-reduce:rotate-0 motion-reduce:transition-none"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-labelledby={titleId}
        align="end"
        sideOffset={8}
        className="flex max-h-[calc(100dvh-5rem)] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border-border/90 bg-surface/95 p-0 text-foreground shadow-xl shadow-foreground/10 backdrop-blur-2xl sm:w-[580px] md:w-[640px]"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-canvas bg-linear-to-r from-canvas via-primary-soft/20 to-canvas px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-linear-to-tr from-primary to-primary-hover text-white shadow-xs">
              <GearSixIcon size={15} aria-hidden />
            </span>
            <div className="min-w-0">
              <h2
                id={titleId}
                className="truncate text-sm font-medium leading-tight"
              >
                تنظیمات
              </h2>
              <p className="truncate text-[11px] font-medium leading-tight text-muted">
                دسترسی، تعاریف پایه و شماره‌گذاری
              </p>
            </div>
          </div>
          <span className="rounded-full bg-primary-soft/80 px-2.5 py-0.5 text-[11px] font-medium text-primary">
            {persian(items.length)} بخش
          </span>
        </header>
        <nav
          aria-label="تنظیمات"
          className={cn(
            "grid gap-2.5 overflow-y-auto p-3 sm:gap-3 sm:p-4",
            items.length > 1 ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          {items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-xl border p-2.5 text-start outline-none transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xs active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none sm:p-3",
                  active
                    ? "border-primary bg-primary-soft/70 text-primary-hover shadow-xs ring-1 ring-primary/20"
                    : "border-border/70 bg-surface/90 hover:border-border hover:bg-canvas/80 focus-visible:bg-primary-soft/50 focus-visible:ring-2 focus-visible:ring-primary/30",
                )}
              >
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-xl shadow-2xs transition-all duration-200 group-hover:scale-105 motion-reduce:transform-none sm:size-10",
                    active
                      ? "bg-primary text-white ring-2 ring-primary-soft"
                      : "bg-primary-soft text-primary-hover group-hover:bg-primary group-hover:text-white",
                  )}
                >
                  <Icon size={18} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="truncate text-xs font-medium leading-snug group-hover:text-primary-hover sm:text-sm">
                      {item.label}
                    </span>
                    <CaretLeftIcon
                      size={14}
                      className={cn(
                        "shrink-0 transition-transform duration-200 group-hover:-translate-x-0.5 group-hover:text-primary motion-reduce:transform-none",
                        active ? "text-primary" : "text-border",
                      )}
                      aria-hidden
                    />
                  </div>
                  {item.description && (
                    <span className="mt-0.5 line-clamp-1 block text-[11px] leading-relaxed text-muted sm:text-xs">
                      {item.description}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>
      </PopoverContent>
    </Popover>
  );
}
