"use client";
import { ErrorState } from "@/components/ui/financial";

import { PageHeader } from "@/components/ui/financial/page-header";

import type { Company } from "@/lib/product-types";
import { PayablesVendors } from "./payables-vendors";
import { StatCards } from "@/components/ui/financial/stat-cards";
import { usePayablesWorkspace } from "./use-payables-workspace";

export function PayablesWorkspace({ company }: { company: Company }) {
  const { summary, cards, loading, failed, refresh } = usePayablesWorkspace(company);
  return <div dir="rtl" className="flex min-w-0 flex-col gap-6">
    <PageHeader title="بدهی‌ها" />
    <section aria-label="آمار بدهی‌ها" aria-busy={loading}>
      {failed ? <ErrorState onRetry={refresh}  variant="compact"><p>اطلاعات بدهی‌ها دریافت نشد.</p></ErrorState> : <StatCards key={company.id} items={cards} loading={loading} />}
    </section>
    {summary && <PayablesVendors key={company.id} companyId={company.id} asOfDate={summary.as_of_date} />}
  </div>;
}
