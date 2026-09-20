"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FindingsWorkspace } from "./findings-workspace";
import { AlertsWorkspace } from "./alerts-workspace";
import { SimulationWorkspace } from "./simulation-workspace";
import type { Company } from "@/lib/product-types";
import { ScanSearch, BellRing, SlidersHorizontal } from "lucide-react";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

export type RisksTab = "findings" | "alerts" | "simulation";

interface RisksWorkspaceProps {
  company: Company;
  defaultTab?: RisksTab;
}

export function RisksWorkspace({ company, defaultTab = "findings" }: RisksWorkspaceProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tabParam = searchParams.get("tab") as RisksTab | null;
  const initialTab = tabParam && ["findings", "alerts", "simulation"].includes(tabParam)
    ? tabParam
    : defaultTab;

  const [activeTab, setActiveTab] = useState<RisksTab>(initialTab);

  useEffect(() => {
    if (tabParam && ["findings", "alerts", "simulation"].includes(tabParam)) {
      setActiveTab(tabParam);
    } else if (defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [tabParam, defaultTab]);

  const handleTabChange = (value: string) => {
    const nextTab = value as RisksTab;
    setActiveTab(nextTab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    router.replace(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="risks-workspace space-y-6" dir="rtl">
      {/* Clean Single Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            پایش ریسک‌ها و مغایرت‌ها
          </h1>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} variant="line" className="w-full">
        <TabsList className="w-full border-b border-border/80 gap-2 sm:gap-6 overflow-x-auto justify-start">
          <TabsTrigger value="findings" className="gap-2 text-xs sm:text-sm py-2.5 font-bold">
            <ScanSearch className="size-4 text-primary" />
            <span>یافته‌ها و ناهنجاری‌ها</span>
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-2 text-xs sm:text-sm py-2.5 font-bold">
            <BellRing className="size-4 text-amber-500" />
            <span>هشدارهای زودهنگام</span>
          </TabsTrigger>
          <TabsTrigger value="simulation" className="gap-2 text-xs sm:text-sm py-2.5 font-bold">
            <SlidersHorizontal className="size-4 text-purple-500" />
            <span>شبیه‌ساز سناریوها</span>
          </TabsTrigger>
        </TabsList>

        <div className="pt-4">
          <TabsContent value="findings" className="m-0 focus-visible:outline-none">
            <FindingsWorkspace company={company} />
          </TabsContent>
          <TabsContent value="alerts" className="m-0 focus-visible:outline-none">
            <AlertsWorkspace company={company} />
          </TabsContent>
          <TabsContent value="simulation" className="m-0 focus-visible:outline-none">
            <SimulationWorkspace company={company} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
