"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ThemeToggle } from "@/components/design-system/theme-toggle";
import { CreateCompany } from "@/components/product/create-company";
import { Icon, Mark } from "@/components/product/icons";
import { api } from "@/lib/product-api";
import type { Company, User } from "@/lib/product-types";

export default function NewCompanyPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  useEffect(() => {
    let ignore = false;
    async function check() {
      try {
        try { await api<User>("/auth/me"); } catch { await api("/auth/refresh", { method: "POST" }); }
        const items = await api<Company[]>("/companies");
        if (!ignore) { setCompanies(items); setReady(true); }
      } catch { if (!ignore) router.replace("/login"); }
    }
    void check(); return () => { ignore = true; };
  }, [router]);
  if (!ready) {
    return (
      <main className="ds-root min-h-screen flex flex-col items-center justify-center gap-4 bg-background text-foreground">
        <Mark className="h-10 w-10 text-primary" />
        <strong className="text-lg font-bold">دیدبان مالی</strong>
        <span className="loading-ring" />
      </main>
    );
  }
  return (
    <main className="ds-root min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/70 max-w-5xl w-full mx-auto">
        <Link className="brand flex items-center gap-2.5 font-bold text-foreground hover:opacity-80 transition-opacity" href={companies.length ? `/companies/${companies[0].id}/overview` : "/"}>
          <Mark className="h-8 w-8 text-primary" />
          <span>دیدبان مالی</span>
        </Link>
        <ThemeToggle />
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <section className="new-company-card w-full max-w-xl p-6 sm:p-8 rounded-2xl border border-border/80 bg-card shadow-sm space-y-4 text-center">
          <span className="empty-icon mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary text-xl">
            <Icon name="company" />
          </span>
          <span className="overline inline-block text-xs font-semibold text-primary">فضای کاری تازه</span>
          <h1 className="text-xl sm:text-2xl font-black text-foreground">{companies.length ? "افزودن یک شرکت جدید" : "اولین شرکت را تعریف کنید"}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto">داده‌ها، اعضا و گزارش‌های هر شرکت در یک مرز امنیتی مستقل نگهداری می‌شوند.</p>
          <div className="text-right pt-2">
            <CreateCompany />
          </div>
        </section>
      </div>
    </main>
  );
}
