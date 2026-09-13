"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";

import { api } from "@/lib/product-api";
import type { Company, User } from "@/lib/product-types";

type WorkspaceContextValue = {
  user: User;
  companies: Company[];
  company: Company;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [initialPathname] = useState(pathname);
  const params = useParams<{ companyId: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        let currentUser: User;
        try { currentUser = await api<User>("/auth/me"); }
        catch { currentUser = (await api<{ user: User }>("/auth/refresh", { method: "POST" })).user; }
        const availableCompanies = await api<Company[]>("/companies");
        if (ignore) return;
        setUser(currentUser);
        setCompanies(availableCompanies);
        if (!availableCompanies.length) router.replace("/companies/new");
      } catch {
        if (!ignore) router.replace(`/login?next=${encodeURIComponent(initialPathname)}`);
      } finally {
        if (!ignore) setChecking(false);
      }
    }
    void load();
    return () => { ignore = true; };
  }, [initialPathname, router]);

  const company = companies.find((item) => item.id === params.companyId);
  useEffect(() => {
    if (!checking && companies.length && !company) {
      router.replace(`/companies/${companies[0].id}/overview`);
    }
  }, [checking, companies, company, router]);

  const value = useMemo(() => user && company ? { user, companies, company } : null, [user, companies, company]);
  if (checking || !value) return <main className="ds-root splash"><strong>دیدبان مالی</strong><span className="loading-ring" /></main>;
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace باید داخل WorkspaceProvider استفاده شود.");
  return value;
}
