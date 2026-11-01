"use client";
import { useModelAdministration } from "@/hooks/use-model-administration";
import { listItems } from "@/lib/api";
import { displayDate, persian } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { CursorPagination } from "@/components/ui/pagination";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableRowHeader,
  TableCell,
  TableEmptyCell,
} from "@/components/ui/table";
import { NoCompany, Panel } from "./page-parts";
import { InstallationBudgetPanel } from "./installation-budget-panel";
import { ModelTariffPanel } from "./model-tariff-panel";
import { ModelConnectionPanel } from "./model-connection-panel";
const purposes: Record<string, string> = {
  classify_document: "تشخیص منبع",
  propose_mapping: "تفسیر ستون‌ها",
  suggest_account_role: "نقش حساب",
  explain_finding: "توضیح یافته",
  summarize_report: "خلاصه گزارش",
};
const states: Record<string, string> = {
  pending: "در صف",
  reserved: "بودجه رزرو شده",
  running: "در حال اجرا",
  succeeded: "انجام‌شده",
  completed: "انجام‌شده",
  failed: "ناموفق",
  unknown: "هزینه نامعلوم",
  waiting_dependency: "در انتظار سرویس",
  blocked: "متوقف",
  rejected: "ردشده",
  applied: "اعمال‌شده",
};
export function ModelAdministration() {
  const controller = useModelAdministration();
  const { configuration, status, requests, workspace } = controller;
  return (
    <div className="space-y-5">
      <ModelConnectionPanel configuration={configuration} />
      <InstallationBudgetPanel controller={controller} />
      {!workspace.company ? (
        <NoCompany />
      ) : (
        <>
          <Panel title="آمادگی شرکت فعال">
            {status.loading ? (
              <LoadingState />
            ) : status.error ? (
              <ErrorState message={status.error.message} onRetry={status.refresh} />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>{workspace.company.name}</span>
                  <Badge
                    tone={
                      status.data?.status === "configured_unverified"
                        ? "warning"
                        : "neutral"
                    }
                  >
                    {status.data?.status === "disabled"
                      ? "غیرفعال"
                      : status.data?.status === "configured_unverified"
                        ? "نیازمند ارزیابی"
                        : "پیکربندی نشده"}
                  </Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    { key: "key_configured", label: "اتصال" },
                    { key: "tariff_configured", label: "تعرفه" },
                    { key: "budget_configured", label: "بودجه" },
                  ].map((item) => (
                    <Badge
                      key={item.key}
                      tone={
                        status.data?.[
                          item.key as
                            | "key_configured"
                            | "tariff_configured"
                            | "budget_configured"
                        ]
                          ? "success"
                          : "neutral"
                      }
                    >
                      {item.label}:{" "}
                      {item.key === "budget_configured" && status.data?.budget_mode === "unlimited" ? "نامحدود" : status.data?.[
                        item.key as
                          | "key_configured"
                          | "tariff_configured"
                          | "budget_configured"
                      ]
                        ? "تنظیم‌شده"
                        : "تنظیم نشده"}
                    </Badge>
                  ))}
                </div>
                {!status.data?.key_configured && (
                  <p className="mt-4 text-sm text-muted">
                    تنظیمات اتصال در نصب انجام می‌شود.
                  </p>
                )}
              </>
            )}
          </Panel>
          <ModelTariffPanel controller={controller} />
          <Panel
            title="درخواست‌های مدل"
            action={
              <Button variant="ghost" onClick={requests.refresh}>
                تازه‌سازی
              </Button>
            }
          >
            {requests.loading ? (
              <LoadingState />
            ) : requests.error ? (
              <ErrorState
                message={requests.error.message}
                onRetry={requests.refresh}
              />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>درخواست</TableHead>
                      <TableHead>زمان</TableHead>
                      <TableHead>وضعیت</TableHead>
                      <TableHead>توکن ورودی</TableHead>
                      <TableHead>توکن خروجی</TableHead>
                      <TableHead>تلاش</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {listItems(requests.data).length ? (
                      listItems(requests.data).map((request) => (
                        <TableRow key={request.id}>
                          <TableRowHeader>
                            {purposes[request.purpose] || "پردازش مالی"}
                          </TableRowHeader>
                          <TableCell className="whitespace-nowrap">
                            {displayDate(request.created_at)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              tone={
                                ["failed", "rejected"].includes(request.state)
                                  ? "danger"
                                  : ["succeeded", "completed", "applied"].includes(
                                        request.state,
                                      )
                                    ? "success"
                                    : "neutral"
                              }
                            >
                              {states[request.state] || "نامشخص"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {request.usage?.input_tokens != null
                              ? persian(request.usage.input_tokens)
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {request.usage?.output_tokens != null
                              ? persian(request.usage.output_tokens)
                              : "—"}
                          </TableCell>
                          <TableCell>{persian(request.attempts)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableEmptyCell colSpan={6} title="درخواستی اجرا نشده" />
                    )}
                  </TableBody>
                </Table>
                <CursorPagination {...requests} />
              </>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
