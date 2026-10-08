"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/financial";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/product-api";
import type {
  Company,
  DataOverviewResponse,
  ImportBatch,
} from "@/lib/product-types";
import {
  LayoutDashboard,
  UploadCloud,
  History,
  FileCode2,
  ShieldCheck,
  Database,
  Building2,
} from "@/components/ui/icons";
import { DataReadinessSummary } from "./data-readiness-summary";
import { DataOverviewTab } from "./data-overview-tab";
import { DataImportWizardTab } from "./data-import-wizard-tab";
import { DataHistoryTab } from "./data-history-tab";
import { DataTemplatesTab } from "./data-templates-tab";
import { DataQualityTab } from "./data-quality-tab";

interface DataCenterWorkspaceProps {
  company: Company;
}

export function DataCenterWorkspace({ company }: DataCenterWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Active tab derived directly from URL searchParams
  const tabParam = searchParams.get("tab") || "overview";
  const activeTab = [
    "overview",
    "upload",
    "history",
    "templates",
    "quality",
  ].includes(tabParam)
    ? tabParam
    : "overview";
  const [wizardSourceKind, setWizardSourceKind] = useState<
    "accounting" | "bank" | "sales"
  >("accounting");

  // Overview data
  const [overview, setOverview] = useState<DataOverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState<boolean>(true);

  // History batches
  const [historyBatches, setHistoryBatches] = useState<ImportBatch[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(true);

  const setTab = useCallback(
    (tab: string, initialKind?: "accounting" | "bank" | "sales") => {
      if (initialKind) {
        setWizardSourceKind(initialKind);
      }
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams],
  );

  const fetchOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const res = await api<DataOverviewResponse>(
        `/companies/${company.id}/data/overview`,
      );
      setOverview(res);
    } catch {
      // silent
    } finally {
      setOverviewLoading(false);
    }
  }, [company.id]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await api<ImportBatch[]>(`/companies/${company.id}/imports`);
      setHistoryBatches(res);
    } catch {
      // silent
    } finally {
      setHistoryLoading(false);
    }
  }, [company.id]);

  useEffect(() => {
    void fetchOverview();
    void fetchHistory();
  }, [fetchOverview, fetchHistory]);

  return (
    <div className="pp-page pp-data space-y-6" dir="rtl">
      <PageHeader
        title="داده‌های مالی"
        statusMetadata={<span>{company.legal_name}</span>}
        primaryAction={
          <Button onClick={() => setTab("upload")}>بارگذاری داده</Button>
        }
      />

      {/* Primary Sub-Navigation Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setTab(val)}
        className="space-y-6"
      >
        <TabsList className="bg-card border border-border p-1.5 rounded-[var(--ds-card-radius)] h-auto flex flex-wrap gap-1 shadow-2xs">
          <TabsTrigger
            value="overview"
            className="rounded-[var(--ds-card-radius)] text-xs py-2 px-3.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary font-bold gap-2"
          >
            <LayoutDashboard className="size-4" />
            <span>مرکز داده‌های مالی</span>
          </TabsTrigger>

          <TabsTrigger
            value="upload"
            className="rounded-[var(--ds-card-radius)] text-xs py-2 px-3.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary font-bold gap-2"
          >
            <UploadCloud className="size-4" />
            <span>بارگذاری داده</span>
          </TabsTrigger>

          <TabsTrigger
            value="history"
            className="rounded-[var(--ds-card-radius)] text-xs py-2 px-3.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary font-bold gap-2"
          >
            <History className="size-4" />
            <span>تاریخچه بارگذاری</span>
            {historyBatches.length > 0 && (
              <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded-md text-muted-foreground">
                {historyBatches.length}
              </span>
            )}
          </TabsTrigger>

          <TabsTrigger
            value="templates"
            className="rounded-[var(--ds-card-radius)] text-xs py-2 px-3.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary font-bold gap-2"
          >
            <FileCode2 className="size-4" />
            <span>الگوهای نگاشت</span>
          </TabsTrigger>

          <TabsTrigger
            value="quality"
            className="rounded-[var(--ds-card-radius)] text-xs py-2 px-3.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary font-bold gap-2"
          >
            <ShieldCheck className="size-4" />
            <span>کیفیت داده‌ها</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Overview */}
        <TabsContent
          value="overview"
          className="mt-0 focus-visible:outline-none"
        >
          <div className="space-y-4">
          <DataReadinessSummary key={company.id} companyId={company.id} expanded={searchParams.get("setup") === "open"} />
          <DataOverviewTab
            overview={overview}
            loading={overviewLoading}
            onNavigateTab={setTab}
            onRefresh={() => {
              void fetchOverview();
              void fetchHistory();
            }}
          />
          </div>
        </TabsContent>

        {/* Tab 2: Upload Wizard */}
        <TabsContent value="upload" className="mt-0 focus-visible:outline-none">
          <DataImportWizardTab
            company={company}
            initialSourceKind={wizardSourceKind}
            onFinishImport={() => {
              void fetchOverview();
              void fetchHistory();
            }}
            onNavigateTab={setTab}
          />
        </TabsContent>

        {/* Tab 3: History */}
        <TabsContent
          value="history"
          className="mt-0 focus-visible:outline-none"
        >
          <DataHistoryTab
            company={company}
            items={historyBatches}
            loading={historyLoading}
            onRefresh={fetchHistory}
            onSelectBatchForReview={(batchId) => {
              router.push(`/companies/${company.id}/imports/${batchId}`);
            }}
          />
        </TabsContent>

        {/* Tab 4: Templates */}
        <TabsContent
          value="templates"
          className="mt-0 focus-visible:outline-none"
        >
          <DataTemplatesTab
            company={company}
            onRefreshOverview={fetchOverview}
          />
        </TabsContent>

        {/* Tab 5: Quality */}
        <TabsContent
          value="quality"
          className="mt-0 focus-visible:outline-none"
        >
          <DataQualityTab company={company} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
