"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CashFlowWorkspace } from "./cashflow-workspace";
import { ReceivablesWorkspace } from "./receivables-workspace";
import { PayablesWorkspace } from "./payables-workspace";
import { ReconciliationWorkspace } from "./reconciliation-workspace";
import type { Company } from "@/lib/product-types";
import { WalletCards, ArrowDownLeft, ArrowUpRight, ArrowLeftRight } from "lucide-react";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

export type TreasuryTab = "cashflow" | "receivables" | "payables" | "reconciliation";

interface TreasuryWorkspaceProps {
  company: Company;
  defaultTab?: TreasuryTab;
}

export function TreasuryWorkspace({ company, defaultTab = "cashflow" }: TreasuryWorkspaceProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tabParam = searchParams.get("tab") as TreasuryTab | null;
  const initialTab = tabParam && ["cashflow", "receivables", "payables", "reconciliation"].includes(tabParam)
    ? tabParam
    : defaultTab;

  const [activeTab, setActiveTab] = useState<TreasuryTab>(initialTab);

  useEffect(() => {
    if (tabParam && ["cashflow", "receivables", "payables", "reconciliation"].includes(tabParam)) {
      setActiveTab(tabParam);
    } else if (defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [tabParam, defaultTab]);

  const handleTabChange = (value: string) => {
    const nextTab = value as TreasuryTab;
    setActiveTab(nextTab);
    // Update URL query string
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    router.replace(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="treasury-workspace space-y-6" dir="rtl">
      {/* Header Hub Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/70 pb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-primary mb-1">
            <WalletCards className="size-4" />
            <span>مدیریت نقدینگی و خزانه‌داری</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
            مرکز کنترل وجوه نقد، تسویه‌ها و تطبیق بانکی
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            پایش یکپارچه جریان نقدینگی، پیش‌بینی تاب‌آوری، وصول مطالبات، تعهدات پرداختنی و مغایرت‌گیری اسناد با بانک.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} variant="line" className="w-full">
        <TabsList className="w-full border-b border-border/80 gap-2 sm:gap-6 overflow-x-auto justify-start">
          <TabsTrigger value="cashflow" className="gap-2 text-xs sm:text-sm py-2.5">
            <WalletCards className="size-4" />
            <span>جریان و پیش‌بینی نقد</span>
          </TabsTrigger>
          <TabsTrigger value="receivables" className="gap-2 text-xs sm:text-sm py-2.5">
            <ArrowDownLeft className="size-4 text-emerald-500" />
            <span>مطالبات و مشتریان</span>
          </TabsTrigger>
          <TabsTrigger value="payables" className="gap-2 text-xs sm:text-sm py-2.5">
            <ArrowUpRight className="size-4 text-amber-500" />
            <span>بدهی‌ها و تامین‌کنندگان</span>
          </TabsTrigger>
          <TabsTrigger value="reconciliation" className="gap-2 text-xs sm:text-sm py-2.5">
            <ArrowLeftRight className="size-4 text-blue-500" />
            <span>تطبیق حساب‌ها و بانک</span>
          </TabsTrigger>
        </TabsList>

        <div className="pt-4">
          <TabsContent value="cashflow" className="m-0 focus-visible:outline-none">
            <CashFlowWorkspace company={company} />
          </TabsContent>
          <TabsContent value="receivables" className="m-0 focus-visible:outline-none">
            <ReceivablesWorkspace company={company} />
          </TabsContent>
          <TabsContent value="payables" className="m-0 focus-visible:outline-none">
            <PayablesWorkspace company={company} />
          </TabsContent>
          <TabsContent value="reconciliation" className="m-0 focus-visible:outline-none">
            <ReconciliationWorkspace company={company} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
