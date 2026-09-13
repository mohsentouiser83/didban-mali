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
  if (!ready) return <main className="ds-root splash"><Mark /><strong>دیدبان مالی</strong><span className="loading-ring" /></main>;
  return <main className="ds-root new-company-shell"><header><Link className="brand" href={companies.length ? `/companies/${companies[0].id}/overview` : "/"}><Mark /><span>دیدبان مالی</span></Link><ThemeToggle /></header><section className="new-company-card"><span className="empty-icon"><Icon name="company" /></span><span className="overline">فضای کاری تازه</span><h1>{companies.length ? "افزودن یک شرکت جدید" : "اولین شرکت را تعریف کنید"}</h1><p>داده‌ها، اعضا و گزارش‌های هر شرکت در یک مرز امنیتی مستقل نگهداری می‌شوند.</p><CreateCompany /></section></main>;
}
