"use client";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useWorkspace } from "./workspace";
import {
  visibleSettingsCategories,
  searchSettings,
} from "@/lib/settings-catalog";
import { notify } from "@/components/ui/sonner";
export function useSettingsNavigation() {
  const workspace = useWorkspace();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [open, setOpenState] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const categories = useMemo(
    () =>
      visibleSettingsCategories({
        hasCompany: !!workspace.company,
        role: workspace.company?.role,
        installationAdmin: !!workspace.user?.installation_admin,
      }),
    [workspace.company, workspace.user?.installation_admin],
  );
  const results = useMemo(
    () => searchSettings(categories, query),
    [categories, query],
  );
  const setOpen = (next: boolean) => {
    setOpenState(next);
    if (!next) setQuery("");
  };
  const navigate = () => setOpen(false);
  const logout = async () => {
    setSigningOut(true);
    try {
      await workspace.logout();
      setOpen(false);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "خروج انجام نشد.");
    } finally {
      setSigningOut(false);
    }
  };
  return {
    workspace,
    pathname,
    query,
    setQuery,
    open,
    setOpen,
    categories,
    results,
    navigate,
    logout,
    signingOut,
  };
}
