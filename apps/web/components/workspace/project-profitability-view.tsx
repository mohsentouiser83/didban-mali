"use client";

import { ChartLineUpIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingState, StatusMessage } from "@/components/ui/content-states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableRowHeader } from "@/components/ui/table";
import { useResource } from "@/hooks/use-resource";
import { useWorkspace } from "@/hooks/workspace";
import { NoCompany, PageHeader, Panel } from "./page-parts";

interface ProjectProfitabilityItem {
  dimension_id: string;
  project_code: string;
  project_name: string;
  contracted_amount_irr: string;
  invoiced_revenue_irr: string;
  collected_cash_irr: string;
  unreleased_retention_irr: string;
  payroll_cost_irr: string;
  petty_cash_cost_irr: string;
  total_direct_cost_irr: string;
  gross_profit_irr: string;
  profit_margin_pct: string | null;
}

interface ProfitabilityResponse {
  period_id: string | null;
  items: ProjectProfitabilityItem[];
  summary: {
    total_invoiced_revenue_irr: string;
    total_project_payroll_cost_irr: string;
    total_project_petty_cash_cost_irr: string;
    total_project_gross_profit_irr: string;
    unallocated_payroll_cost_irr: string;
    unallocated_petty_cash_cost_irr: string;
    estimated_operating_profit_irr: string;
  };
}

const fmtIrr = (val: string | number | null | undefined) => `${Number(val || 0).toLocaleString("fa-IR")} ریال`;

export function ProjectProfitabilityView() {
  const { company } = useWorkspace();
  return company ? <ProjectProfitabilityContent key={company.id} companyId={company.id} /> : <NoCompany />;
}

function ProjectProfitabilityContent({ companyId }: { companyId: string }) {
  const report = useResource<ProfitabilityResponse>(
    `/companies/${companyId}/reports/project-profitability`,
  );

  return (
    <>
      <PageHeader title="گزارش سودآوری پروژه‌ها و قراردادها" icon={ChartLineUpIcon} />
      <Panel>
        {report.data && (
          <div className="mb-4 space-y-2">
            <StatusMessage tone="primary">
              درآمد کل پروژه‌ها: {fmtIrr(report.data.summary.total_invoiced_revenue_irr)} | سود ناخالص پروژه‌ها:{" "}
              {fmtIrr(report.data.summary.total_project_gross_profit_irr)} | برآورد سود عملیاتی شرکت:{" "}
              {fmtIrr(report.data.summary.estimated_operating_profit_irr)}
            </StatusMessage>
          </div>
        )}
        {report.loading ? (
          <LoadingState label="در حال محاسبه سودآوری پروژه‌ها" />
        ) : report.error ? (
          <ErrorState message={report.error.message} />
        ) : !report.data?.items.length ? (
          <EmptyState title="پروژه‌ای برای محاسبه سودآوری ثبت نشده است" />
        ) : (
          <Table aria-label="جدول سودآوری پروژه‌ها">
            <TableHeader>
              <TableRow>
                <TableHead>کد پروژه</TableHead>
                <TableHead>نام پروژه</TableHead>
                <TableHead>درآمد صورت‌وضعیت</TableHead>
                <TableHead>هزینه حقوق</TableHead>
                <TableHead>هزینه تنخواه</TableHead>
                <TableHead>سود ناخالص</TableHead>
                <TableHead>حاشیه سود</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.data.items.map((item) => {
                const isLoss = Number(item.gross_profit_irr) < 0;
                return (
                  <TableRow key={item.dimension_id}>
                    <TableRowHeader>{item.project_code}</TableRowHeader>
                    <TableCell>{item.project_name}</TableCell>
                    <TableCell>{fmtIrr(item.invoiced_revenue_irr)}</TableCell>
                    <TableCell>{fmtIrr(item.payroll_cost_irr)}</TableCell>
                    <TableCell>{fmtIrr(item.petty_cash_cost_irr)}</TableCell>
                    <TableCell>{fmtIrr(item.gross_profit_irr)}</TableCell>
                    <TableCell>
                      {item.profit_margin_pct != null ? (
                        <Badge tone={isLoss ? "danger" : "success"}>{item.profit_margin_pct}٪</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>
    </>
  );
}
