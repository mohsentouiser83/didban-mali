"use client";
import { archiveTableImport, TableImportArchiveContext } from "./table-import-archive";
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
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
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
  updateUser: (patch: Partial<User>) => void;
  refreshCompanies: () => Promise<void>;
  refreshPeriods: () => void;
  logout: () => Promise<void>;
  companyPath: (resource: string) => string | null;
  canWrite: boolean;
  canApprove: boolean;
}
const Context = createContext<Workspace | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
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
    setCompanyId((previous) => {
      const activeId = items.some((company) => company.id === previous)
        ? previous
        : items.find(
            (company) => company.id === localStorage.getItem("didban-company"),
          )?.id ||
          items[0]?.id ||
          "";
      try {
        const savedPeriod = localStorage.getItem(`didban-period:${activeId}`) || "";
        setPeriodId(savedPeriod);
      } catch {
        // Ignore storage errors
      }
      return activeId;
    });
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
  const periodsResource = usePeriodOptions(companyId);
  const periods = periodsResource.data;
  const setCompany = useCallback((id: string) => {
    setCompanyId(id);
    let savedPeriod = "";
    try {
      savedPeriod = localStorage.getItem(`didban-period:${id}`) || "";
      localStorage.setItem("didban-company", id);
    } catch {
      // Ignore storage errors
    }
    setPeriodId(savedPeriod);
  }, []);
  const handleSetPeriodId = useCallback(
    (id: string) => {
      setPeriodId(id);
      if (companyId) {
        try {
          if (id) {
            localStorage.setItem(`didban-period:${companyId}`, id);
          } else {
            localStorage.removeItem(`didban-period:${companyId}`);
          }
        } catch {
          // Ignore storage errors
        }
      }
    },
    [companyId],
  );
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
  const updateUser = useCallback((patch: Partial<User>) => {
    setUser((previous) => (previous ? { ...previous, ...patch } : previous));
  }, []);
  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    setCsrf("");
    router.replace("/login");
  };
  return (
    <Context.Provider
      value={{
        user,
        companies,
        company,
        periods,
        periodId,
        unit,
        loading,
        error,
        setCompany,
        setPeriodId: handleSetPeriodId,
        setUnit,
        updateUser,
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
      <TableImportArchiveContext.Provider value={company ? (file) => archiveTableImport(company.id, file) : null}>
        {children}
      </TableImportArchiveContext.Provider>
    </Context.Provider>
  );
}
export function useWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error("WorkspaceProvider missing");
  return context;
}
