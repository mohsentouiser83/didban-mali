"use client";
import Link from "next/link";
import { CompanyNavigation } from "./company-navigation";
import { usePathname } from "next/navigation";
import {
  Building2,
  Users,
  LogOut,
  Sparkles,
  ArrowUpLeft,
  Gauge,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCurrentUser, useLogout } from "@/features/auth/use-auth";
import { Button, cx } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { message } from "@/lib/api";
export function WorkspaceShell({ children }: { children: ReactNode }) {
  const user = useCurrentUser(),
    logout = useLogout(),
    path = usePathname();
  if (user.isPending)
    return (
      <main className="mx-auto max-w-5xl p-7 pt-20">
        <LoadingState label="در حال بررسی نشست" />
      </main>
    );
  if (!user.data)
    return (
      <main className="mx-auto max-w-lg p-7 pt-20">
        <ErrorState
          message={message(user.error)}
          onRetry={() => user.refetch()}
        />
      </main>
    );
  const links = [
    { href: "/companies", label: "شرکت‌ها", icon: Building2 },
    ...(user.data.is_installation_admin
      ? [
          { href: "/users", label: "کاربران سازمان", icon: Users },
          { href: "/model-budget", label: "بودجه مدل", icon: Gauge },
        ]
      : []),
  ];
  return (
    <div className="min-h-dvh lg:ps-[252px]">
      <a
        href="#main-content"
        className="fixed -top-20 start-4 z-100 rounded-control bg-primary px-4 py-3 text-white focus:top-4"
      >
        رفتن به محتوا
      </a>
      <aside className="fixed inset-y-0 start-0 hidden w-[252px] flex-col border-e border-border bg-surface p-6 lg:flex">
        <Link href="/companies" className="mb-12 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-[14px] bg-primary text-white">
            <Sparkles size={21} aria-hidden />
          </span>
          <span className="font-heading text-base font-medium">
            دیدبان مالی
          </span>
        </Link>
        <p className="mb-3 px-3 text-xs text-muted">فضای سازمان</p>
        <nav aria-label="ناوبری اصلی" className="space-y-2">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              prefetch={false}
              aria-current={path.startsWith(l.href) ? "page" : undefined}
              className={cx(
                "flex min-h-12 items-center gap-3 rounded-control px-3 font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-primary",
                path.startsWith(l.href)
                  ? "bg-accent text-primary"
                  : "text-muted hover:bg-background",
              )}
            >
              <l.icon size={19} aria-hidden />
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto rounded-panel border border-border p-4">
          <p className="text-xs text-muted">حساب سازمانی</p>
          <p className="mt-1 truncate font-medium">{user.data.display_name}</p>
          <p className="mb-3 truncate text-xs text-muted" dir="ltr">
            {user.data.email}
          </p>
          <Button
            variant="ghost"
            className="w-full justify-start px-0"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
          >
            <LogOut size={17} aria-hidden />
            {logout.isPending ? "در حال خروج…" : "خروج از حساب"}
          </Button>
          {logout.error ? (
            <p role="alert" className="text-xs text-danger">
              {message(logout.error)}
            </p>
          ) : null}
        </div>
      </aside>
      <header className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-border bg-surface/80 px-5 py-3 sm:px-7">
        <Link href="/companies" className="flex items-center gap-2 text-muted">
          <span className="font-heading font-medium text-foreground lg:hidden">
            دیدبان مالی
          </span>
          <span className="hidden sm:inline">فضای کار سازمان</span>
          <ArrowUpLeft size={15} aria-hidden />
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">{user.data.display_name}</span>
          <span
            className="flex size-9 items-center justify-center rounded-control bg-accent text-primary"
            aria-hidden
          >
            {user.data.display_name.slice(0, 1)}
          </span>
          <Button
            variant="ghost"
            className="px-2 lg:hidden"
            aria-label="خروج از حساب"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
          >
            <LogOut size={18} />
          </Button>
        </div>
        <nav aria-label="ناوبری موبایل" className="flex w-full flex-wrap gap-2 lg:hidden">
          {links.map((l) => (
            <Button
              key={l.href}
              asChild
              variant={path.startsWith(l.href) ? "secondary" : "ghost"}
            >
              <Link
                href={l.href}
                prefetch={false}
                aria-current={path.startsWith(l.href) ? "page" : undefined}
              >
                <l.icon size={17} aria-hidden />
                {l.label}
              </Link>
            </Button>
          ))}
        </nav>
      </header>
      <CompanyNavigation />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-[1400px] p-5 outline-none sm:p-7"
      >
        <div key={path}>{children}</div>
      </main>
    </div>
  );
}
