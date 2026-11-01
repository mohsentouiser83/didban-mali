"use client";
import {
  api,
  ApiError,
  listItems,
  setCsrf,
  type Company,
  type Period,
  type ResourceList,
  type User,
} from "@/lib/api";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { CompanyModules } from "@/lib/company-modules";
import { useResource } from "./use-resource";
import { usePeriodOptions } from "./use-period-options";
interface Workspace {
  user?: User;
  companies: Company[];
  company?: Company;
  periods: Period[];
  periodId: string;
  unit: "IRR" | "TOMAN";
  loading: boolean;
  error?: string;
  setCompany: (id: string) => void;
  setPeriodId: (id: string) => void;
  setUnit: (unit: "IRR" | "TOMAN") => void;
  refreshCompanies: () => Promise<void>;
  refreshPeriods: () => void;
  logout: () => Promise<void>;
  companyPath: (resource: string) => string | null;
  modules: ReturnType<typeof useResource<CompanyModules>>;
  canWrite: boolean;
  canApprove: boolean;
}
const Context = createContext<Workspace | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User>();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [unit, setUnitState] = useState<"IRR" | "TOMAN">("IRR");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const refreshCompanies = useCallback(async () => {
    const data = await api<ResourceList<Company>>("/companies");
    const items = listItems(data);
    setCompanies(items);
    setCompanyId((previous) =>
      items.some((company) => company.id === previous)
        ? previous
        : items.find(
            (company) => company.id === localStorage.getItem("didban-company"),
          )?.id ||
          items[0]?.id ||
          "",
    );
  }, []);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const auth = await api<{ user: User; csrf: string }>("/auth/me");
        if (!alive) return;
        setUser(auth.user);
        try {
          const savedUnit = localStorage.getItem(`didban-unit:${auth.user.id}`);
          setUnitState(savedUnit === "TOMAN" ? "TOMAN" : "IRR");
        } catch {
          // A blocked browser store must not prevent opening the workspace.
        }
        setCsrf(auth.csrf);
        await refreshCompanies();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401)
          router.replace("/login");
        else if (alive)
          setError(
            error instanceof Error
              ? error.message
              : "ورود به فضای کاری ممکن نشد.",
          );
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [refreshCompanies, router]);
  const company = companies.find((item) => item.id === companyId);
  const modules = useResource<CompanyModules>(companyId ? `/companies/${companyId}/modules` : null);
  const refreshModules = modules.refresh;
  useEffect(() => { refreshModules(); }, [pathname, refreshModules]);
  const periodsResource = usePeriodOptions(companyId);
  const periods = periodsResource.data;
  const setCompany = useCallback((id: string) => {
    setCompanyId(id);
    setPeriodId("");
    localStorage.setItem("didban-company", id);
  }, []);
  const setUnit = useCallback(
    (value: "IRR" | "TOMAN") => {
      setUnitState(value);
      if (!user) return;
      try {
        localStorage.setItem(`didban-unit:${user.id}`, value);
      } catch {
        // The selection still applies to the current session.
      }
    },
    [user],
  );
  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    setCsrf("");
    router.replace("/login");
  };
  return (
    <Context.Provider
      value={{
        modules,
        user,
        companies,
        company,
        periods,
        periodId,
        unit,
        loading,
        error,
        setCompany,
        setPeriodId,
        setUnit,
        refreshCompanies,
        refreshPeriods: periodsResource.refresh,
        logout,
        companyPath: (resource) =>
          companyId ? `/companies/${companyId}/${resource}` : null,
        canWrite: !!company && company.role !== "viewer",
        canApprove:
          !!company &&
          (company.role === "finance_manager" ||
            ((company.role === "owner" || company.role === "advisor") &&
              company.approve_financial_report)),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error("WorkspaceProvider missing");
  return context;
}
