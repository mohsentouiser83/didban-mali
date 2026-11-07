"use client";
import { usePathname } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
export function BotConnectionNavigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="بخش‌های اتصال بات" className="mb-5 flex flex-wrap gap-2">
      {[
        { href: "/settings/connections", label: "حساب‌ها" },
        { href: "/settings/connections/documents", label: "مدارک بات" },
        { href: "/settings/connections/notifications", label: "اعلان‌های بات" },
      ].map((item) => (
        <ButtonLink
          key={item.href}
          href={item.href}
          variant={pathname === item.href ? "primary" : "secondary"}
          aria-current={pathname === item.href ? "page" : undefined}
        >
          {item.label}
        </ButtonLink>
      ))}
    </nav>
  );
}
