"use client";

import { useId, useState } from "react";
import Link from "next/link";
import {
  CaretLeftIcon,
  CaretRightIcon,
  GearSixIcon,
  MagnifyingGlassIcon,
  SignOutIcon,
  UserIcon,
  XIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  type SettingsCategory,
  type SettingsSearchResult,
  isSettingsCategoryActive,
  settingsCategoryDestination,
} from "@/lib/settings-catalog";
import { cn, persian } from "@/lib/utils";

export interface GearMenuProps {
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

export function GearMenu({
  open,
  onOpenChange,
  pathname,
  onNavigate,
  categories,
  query,
  onQueryChange,
  results,
  onLogout,
  username,
  signingOut,
}: GearMenuProps) {
  const titleId = useId();
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);

  // When popover is closed, clear category selection
  const activeCategoryKey = open ? selectedCategoryKey : null;
  const selectedCategory = activeCategoryKey
    ? categories.find((cat) => cat.key === activeCategoryKey) || null
    : null;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSelectedCategoryKey(null);
    }
    onOpenChange(nextOpen);
  };

  function navigate() {
    setSelectedCategoryKey(null);
    onNavigate();
  }

  const isAnyCategoryActive = categories.some((category) =>
    isSettingsCategoryActive(category, pathname),
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          aria-label="تنظیمات"
          className={cn(
            "group size-10 min-h-10 rounded-full bg-transparent p-0 text-foreground shadow-none hover:bg-canvas hover:text-foreground active:scale-95",
            (open || isAnyCategoryActive) && "bg-canvas text-foreground",
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
        {/* Header */}
        {selectedCategory ? (
          <header className="flex shrink-0 items-center justify-between border-b border-canvas bg-linear-to-r from-canvas via-primary-soft/20 to-canvas px-4 py-2.5 sm:px-5">
            <div className="flex min-w-0 items-center gap-2.5">
              <Button
                variant="ghost"
                onClick={() => setSelectedCategoryKey(null)}
                aria-label="بازگشت به دسته‌بندی‌ها"
                className="h-8 gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted hover:bg-surface hover:text-foreground active:scale-95 transition-all"
              >
                <CaretRightIcon size={14} aria-hidden />
                <span>دسته‌ها</span>
              </Button>
              <div className="h-4 w-px bg-border/80" aria-hidden />
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                  <selectedCategory.icon size={15} aria-hidden />
                </span>
                <div className="min-w-0">
                  <h2
                    id={titleId}
                    className="truncate text-xs font-medium leading-tight text-foreground sm:text-sm"
                  >
                    {selectedCategory.title}
                  </h2>
                </div>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-primary-soft/80 px-2.5 py-0.5 text-[11px] font-medium text-primary">
              {persian(selectedCategory.items.length)} بخش
            </span>
          </header>
        ) : (
          <header className="flex shrink-0 items-center justify-between border-b border-canvas bg-linear-to-r from-canvas via-primary-soft/20 to-canvas px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-linear-to-tr from-primary to-primary-hover text-white shadow-xs">
                <GearSixIcon size={16} aria-hidden />
              </span>
              <div className="min-w-0">
                <h2
                  id={titleId}
                  className="truncate text-sm font-medium leading-tight"
                >
                  تنظیمات سامانه
                </h2>
              </div>
            </div>
            <span className="rounded-full bg-primary-soft/80 px-2.5 py-0.5 text-[11px] font-medium text-primary">
              {persian(categories.filter((category) => !category.standalone).length)} دسته‌بندی
            </span>
          </header>
        )}

        {/* Search Bar */}
        {onQueryChange && (
          <div className="border-b border-border/50 bg-canvas/30 px-3 py-2 sm:px-4">
            <div className="relative flex items-center">
              <MagnifyingGlassIcon
                size={15}
                className="pointer-events-none absolute start-3 text-muted"
                aria-hidden
              />
              <input
                type="search"
                value={query || ""}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="جستجو در بخش‌ها و تنظیمات..."
                aria-label="جستجو در تنظیمات"
                className="w-full rounded-xl border border-border/70 bg-surface/90 py-1.5 pe-8 ps-9 text-xs text-foreground placeholder:text-muted/70 outline-none transition-all focus:border-primary focus:bg-surface focus:ring-1 focus:ring-primary/30"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => onQueryChange("")}
                  className="absolute end-2 text-muted hover:text-foreground"
                  aria-label="پاک کردن جستجو"
                >
                  <XIcon size={13} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Main Content Area */}
        {query ? (
          /* Search Results */
          <div className="max-h-[min(55vh,420px)] overflow-y-auto p-3 sm:p-4">
            {results && results.length > 0 ? (
              <nav aria-label="نتایج جستجو" className="grid gap-2.5 sm:grid-cols-2">
                {results.map((res) => {
                  const Icon = res.icon;
                  const active =
                    pathname === res.href || pathname.startsWith(res.href + "/");
                  return (
                    <Link
                      key={res.key + res.href}
                      href={res.href}
                      onClick={navigate}
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
                            {res.label}
                          </span>
                          <span className="rounded-full bg-canvas px-1.5 py-0.5 text-[10px] font-medium text-muted">
                            {res.categoryTitle}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </nav>
            ) : (
              <div className="py-8 text-center">
                <p className="text-xs text-muted">نتیجه‌ای برای جستجوی شما یافت نشد.</p>
              </div>
            )}
          </div>
        ) : selectedCategory ? (
          /* Category Details View: Cards for this category */
          <nav
            aria-label={selectedCategory.title}
            className={cn(
              "grid gap-2.5 overflow-y-auto p-3 sm:gap-3 sm:p-4 max-h-[min(55vh,420px)]",
              selectedCategory.items.length > 1
                ? "grid-cols-1 sm:grid-cols-2"
                : "grid-cols-1",
            )}
          >
            {selectedCategory.items.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={navigate}
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
                  </div>
                </Link>
              );
            })}
          </nav>
        ) : (
          /* Categories View: Cards representing each category */
          <nav
            aria-label="دسته‌بندی‌های تنظیمات"
            className={cn(
              "grid gap-2.5 overflow-y-auto p-3 sm:gap-3 sm:p-4 max-h-[min(55vh,420px)]",
              categories.length > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1",
            )}
          >
            {categories.map((category) => {
              const active = isSettingsCategoryActive(category, pathname);
              const Icon = category.icon;
              const className = cn(
"group flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 text-start outline-none transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xs active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none sm:p-3",
                    active
                      ? "border-primary/60 bg-primary-soft/40 hover:border-primary hover:bg-primary-soft/60 ring-1 ring-primary/20"
                      : "border-border/70 bg-surface/90 hover:border-border hover:bg-canvas/80 focus-visible:bg-primary-soft/50 focus-visible:ring-2 focus-visible:ring-primary/30",
              );
              const content = (
                <>
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
                        {category.title}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {!category.standalone && (
                          <span className="rounded-full bg-canvas px-1.5 py-0.5 text-[10px] font-medium text-muted group-hover:bg-primary-soft group-hover:text-primary">
                            {persian(category.items.length)} بخش
                          </span>
                        )}
                        <CaretLeftIcon
                          size={14}
                          className="shrink-0 text-border transition-transform duration-200 group-hover:-translate-x-0.5 group-hover:text-primary motion-reduce:transform-none"
                          aria-hidden
                        />
                      </div>
                    </div>
                  </div>
                </>
              );
              return category.standalone ? (
                <Link
                  key={category.key}
                  href={settingsCategoryDestination(category)}
                  onClick={navigate}
                  aria-current={active ? "page" : undefined}
                  className={className}
                >
                  {content}
                </Link>
              ) : (
                <Button
                  key={category.key}
                  variant="ghost"
                  onClick={() => setSelectedCategoryKey(category.key)}
                  className={cn("h-auto min-h-0 shadow-none", className)}
                >
                  {content}
                </Button>
              );
            })}
          </nav>
        )}

        {/* Footer */}
        {(username || onLogout) && (
          <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-canvas bg-canvas/80 px-3.5 py-2.5 sm:px-5">
            {username ? (
              <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-foreground">
                <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-hover">
                  <UserIcon size={13} aria-hidden />
                </span>
                <span className="truncate">{username}</span>
              </span>
            ) : (
              <span />
            )}
            {onLogout && (
              <Button
                variant="ghost"
                busy={signingOut}
                className="h-7 rounded-lg px-2.5 text-xs text-muted hover:bg-surface hover:text-foreground"
                onClick={() => void onLogout()}
              >
                <SignOutIcon size={13} aria-hidden />
                خروج
              </Button>
            )}
          </footer>
        )}
      </PopoverContent>
    </Popover>
  );
}
