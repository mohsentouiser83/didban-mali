"use client";
import { ErrorState } from "@/components/ui/financial";

import { PageHeader } from "@/components/ui/financial/page-header";

import { StatCards } from "@/components/ui/financial/stat-cards";
import { CashPaymentPlan } from "./cash-payment-plan";
import { useWorkspace } from "./workspace-provider";
import { CashPeriodReport } from "./cash-period-report";
import { useCashForecast } from "./use-cash-forecast";

export function CashFlowForecastWorkspace() {
  const { company } = useWorkspace();
  const { cards, loading, failed, asOfDate, refresh } = useCashForecast(company.id);

  return (
    <div dir="rtl" className="grid min-w-0 gap-5">
      <PageHeader title="پیش‌بینی ۳۰ روز آینده" />
      <section aria-label="خلاصه نقدینگی در ۳۰ روز آینده" aria-busy={loading}>
        {failed ? <ErrorState onRetry={refresh} variant="compact" ><p>اطلاعات نقدینگی دریافت نشد.</p></ErrorState> :
          <StatCards key={company.id} items={cards} loading={loading} /> }
      </section>
      <CashPaymentPlan key={`payments:${company.id}`} company={company} asOfDate={asOfDate} onChanged={refresh} />
    </div>
  );
}

export function CashFlowWorkspace() {
  const { company } = useWorkspace();
  return <div dir="rtl" className="grid min-w-0 gap-5"><PageHeader title="گزارش نقدینگی" /><CashPeriodReport company={company} /></div>;
}
