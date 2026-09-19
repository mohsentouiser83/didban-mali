"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Mark } from "@/components/product/icons";
import { api } from "@/lib/product-api";
import type { Company, User } from "@/lib/product-types";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    let ignore = false;
    async function chooseDestination() {
      try {
        try { await api<User>("/auth/me"); }
        catch { await api<{ user: User }>("/auth/refresh", { method: "POST" }); }
        const companies = await api<Company[]>("/companies");
        if (!ignore) router.replace(companies.length ? `/companies/${companies[0].id}/overview` : "/companies/new");
      } catch { if (!ignore) router.replace("/login"); }
    }
    void chooseDestination();
    return () => { ignore = true; };
  }, [router]);
  return (
    <main className="ds-root min-h-screen flex flex-col items-center justify-center gap-4 bg-background text-foreground">
      <Mark className="h-10 w-10 text-primary" />
      <strong className="text-lg font-bold">دیدبان مالی</strong>
      <span className="loading-ring" />
    </main>
  );
}
