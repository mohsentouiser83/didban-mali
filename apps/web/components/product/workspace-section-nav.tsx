"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function WorkspaceSectionNav({ label, items }: {
  label: string;
  items: { href: string; label: string }[];
}) {
  const pathname = usePathname();
  const activeHref = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label={label} dir="rtl" className="mb-6 flex gap-2 overflow-x-auto border-b border-border pb-2">
      {items.map((item) => {
        const active = item.href === activeHref;
        return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
          className={cn("inline-flex min-h-11 shrink-0 items-center rounded-lg px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary", active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
          {item.label}
        </Link>;
      })}
    </nav>
  );
}
