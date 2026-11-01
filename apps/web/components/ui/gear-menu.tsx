"use client";
import { useId, useRef } from "react";
import Link from "next/link";
import {
  ArrowUpLeftIcon,
  CaretLeftIcon,
  GearSixIcon,
  MagnifyingGlassIcon,
  SignOutIcon,
  UserIcon,
  XIcon,
} from "@phosphor-icons/react";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/content-states";
import {
  isSettingsCategoryActive,
  settingsCategoryDestination,
  type SettingsCategory,
  type SettingsSearchResult,
} from "@/lib/settings-catalog";
import { cn, persian } from "@/lib/utils";
interface GearMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pathname: string;
  query: string;
  onQueryChange: (query: string) => void;
  categories: SettingsCategory[];
  results: SettingsSearchResult[];
  onNavigate: () => void;
  onLogout: () => Promise<void>;
  username?: string;
  signingOut?: boolean;
}
/** Pin's header/settings/search/category structure, freshly rendered with shared React controls. */
export function GearMenu({
  open,
  onOpenChange,
  pathname,
  query,
  onQueryChange,
  categories,
  results,
  onNavigate,
  onLogout,
  username,
  signingOut = false,
}: GearMenuProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const searchId = useId();
  if (!categories.length) return null;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          aria-label="تنظیمات"
          className={cn(
            "group size-10 min-h-10 rounded-full bg-transparent p-0 text-foreground shadow-none hover:bg-canvas hover:text-foreground active:scale-95",
            (pathname === "/settings" || pathname.startsWith("/settings/")) &&
              "bg-canvas text-foreground",
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
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchRef.current?.focus();
        }}
        className="flex w-120 max-h-[min(42rem,var(--radix-popover-content-available-height))] flex-col overflow-hidden rounded-2xl border-border/90 bg-surface/95 p-0 text-foreground shadow-2xl shadow-foreground/20 backdrop-blur-2xl sm:w-130"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-canvas bg-linear-to-r from-canvas via-primary-soft/20 to-canvas px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
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
                مدیریت سامانه
              </p>
            </div>
          </div>
          <ButtonLink
            href="/settings"
            variant="ghost"
            className="group min-h-8 shrink-0 rounded-lg px-2.5 py-1.5 text-xs text-primary-hover hover:bg-primary-soft hover:text-primary-hover focus-visible:ring-primary/35"
            onClick={onNavigate}
          >
            نمایش همه
            <ArrowUpLeftIcon size={13} aria-hidden />
          </ButtonLink>
        </header>
        <div className="shrink-0 border-b border-canvas/80 bg-surface/80 px-3 pt-2.5 pb-2">
          <Form
            onSubmit={(event) => event.preventDefault()}
            className="space-y-0"
          >
            <label
              htmlFor={searchId}
              className="mb-1.5 block text-xs font-medium text-foreground"
            >
              جستجوی تنظیمات
            </label>
            <div className="relative flex items-center">
              <MagnifyingGlassIcon
                size={14}
                className="pointer-events-none absolute start-3 text-muted"
                aria-hidden
              />
              <Input
                ref={searchRef}
                id={searchId}
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="جستجو در تنظیمات…"
                className="h-9 min-h-9 rounded-xl border-border/60 bg-canvas/70 py-2 ps-9 pe-8 text-xs font-medium text-foreground placeholder:text-muted focus:border-primary/50 focus:bg-surface focus:ring-primary/15"
              />
              {query && (
                <Button
                  variant="ghost"
                  aria-label="پاک‌کردن جستجو"
                  className="absolute end-1 size-8 min-h-8 rounded-full p-0 text-muted hover:bg-border hover:text-foreground"
                  onClick={() => {
                    onQueryChange("");
                    searchRef.current?.focus();
                  }}
                >
                  <XIcon size={11} />
                </Button>
              )}
            </div>
          </Form>
        </div>
        <div className="min-h-0 max-h-90 overflow-y-auto overscroll-contain p-2.5">
          {query.trim() ? (
            results.length ? (
              <nav aria-label="نتایج جستجوی تنظیمات" className="grid gap-1.5">
                {results.map((result) => (
                  <Link
                    key={result.href}
                    href={result.href}
                    onClick={onNavigate}
                    aria-current={pathname === result.href ? "page" : undefined}
                    className="group flex min-h-15 items-center justify-between gap-3 rounded-xl border border-canvas bg-surface p-2.5 text-start outline-none transition-all duration-150 hover:-translate-y-0.5 hover:border-primary-soft hover:bg-canvas/90 hover:shadow-xs focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transform-none motion-reduce:transition-none"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-hover transition-transform duration-200 group-hover:scale-105 motion-reduce:transform-none">
                        <result.icon size={15} aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-medium">
                            {result.label}
                          </span>
                          <span className="rounded-md bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium text-primary-hover ring-1 ring-primary-soft/80 ring-inset">
                            {result.categoryTitle}
                          </span>
                        </span>
                      </span>
                    </span>
                    <CaretLeftIcon
                      size={14}
                      className="shrink-0 text-border group-hover:text-primary"
                      aria-hidden
                    />
                  </Link>
                ))}
              </nav>
            ) : (
              <EmptyState
                compact
                title="تنظیمی پیدا نشد"
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      onQueryChange("");
                      searchRef.current?.focus();
                    }}
                  >
                    پاک‌کردن جستجو
                  </Button>
                }
              />
            )
          ) : (
            <nav
              aria-label="دسته‌های تنظیمات"
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
            >
              {categories.map((category) => {
                const active = isSettingsCategoryActive(category, pathname);
                return (
                  <Link
                    key={category.key}
                    href={settingsCategoryDestination(category)}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex min-h-18 items-start gap-2.5 rounded-xl border p-2.5 text-start outline-none transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xs active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none",
                      active
                        ? "border-primary bg-primary-soft/70 text-primary-hover shadow-xs ring-1 ring-primary/20"
                        : "border-border/70 bg-surface/90 hover:border-border hover:bg-canvas/80 focus-visible:bg-primary-soft/50 focus-visible:ring-2 focus-visible:ring-primary/30",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-xl shadow-2xs transition-all duration-300 group-hover:scale-110 motion-reduce:transform-none motion-reduce:transition-none",
                        active
                          ? "bg-primary text-white ring-2 ring-primary-soft"
                          : "bg-primary-soft text-primary-hover group-hover:bg-primary group-hover:text-white",
                      )}
                    >
                      <category.icon size={16} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-1">
                        <span className="text-xs font-medium leading-snug group-hover:text-primary-hover">
                          {category.title}
                        </span>
                        <CaretLeftIcon
                          size={13}
                          className="shrink-0 translate-x-1 text-border opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:text-primary group-hover:opacity-100 motion-reduce:transform-none"
                          aria-hidden
                        />
                      </span>
                      <span className="mt-0.5 line-clamp-1 block text-[11px] leading-relaxed text-muted">
                        {category.key === "company-access" &&
                        category.items.length === 1
                          ? "اطلاعات شرکت"
                          : category.description}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-canvas bg-canvas/90 px-3.5 py-2.5">
          <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-foreground">
            <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-hover">
              <UserIcon size={13} aria-hidden />
            </span>
            <span className="truncate">{username}</span>
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-[10px] font-medium text-muted sm:inline-block">
              {persian(categories.length)} دسته
            </span>
            <Button
              variant="ghost"
              busy={signingOut}
              className="min-h-8 rounded-xl px-2.5 py-1.5 text-xs text-foreground hover:bg-surface hover:text-primary-hover hover:shadow-xs"
              onClick={() => void onLogout()}
            >
              <SignOutIcon size={13} aria-hidden />
              خروج
            </Button>
          </div>
        </footer>
      </PopoverContent>
    </Popover>
  );
}
