"use client";
import { FlowArrowIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/ui/content-states";
import { CursorPagination } from "@/components/ui/pagination";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableRowHeader,
  TableEmptyCell,
} from "@/components/ui/table";
import { useAutomationRules } from "@/hooks/use-automation-rules";
import { useWorkspace } from "@/hooks/workspace";
import { actionLabels } from "@/lib/automation";
import { displayDate, persian } from "@/lib/utils";
import { NoCompany, PageHeader, Panel } from "./page-parts";
import { AutomationRuleForm } from "./automation-rule-form";
function RulesWorkspace() {
  const c = useAutomationRules();
  return (
    <>
      <PageHeader
        icon={FlowArrowIcon}
        title="قواعد خودکار"
        action={
          c.capabilities.data?.can_manage && (
            <Button onClick={() => c.load(null)}>قاعده جدید</Button>
          )
        }
      />
      <div className="space-y-5">
        <Panel title="قواعد شرکت">
          {c.rules.loading || c.capabilities.loading ? (
            <LoadingState label="در حال دریافت قواعد" />
          ) : c.rules.error || c.capabilities.error ? (
            <ErrorState
              message={(c.rules.error || c.capabilities.error)!.message}
              onRetry={() => {
                c.rules.refresh();
                c.capabilities.refresh();
              }}
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>قاعده</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.rules.data?.items.length ? (
                    c.rules.data.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableRowHeader>{item.name}</TableRowHeader>
                        <TableCell>
                          <Badge tone={item.enabled ? "success" : "neutral"}>
                            {item.enabled ? "فعال" : "غیرفعال"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            {c.capabilities.data?.can_manage ? (
                              <Button
                                variant="secondary"
                                onClick={() => c.load(item)}
                              >
                                ویرایش
                              </Button>
                            ) : (
                              <span>
                                {item.definition.scope === "native_journal" &&
                                item.definition.action === "followup"
                                  ? "پیگیری سند"
                                  : actionLabels[item.definition.action]}
                              </span>
                            )}
                            {c.capabilities.data?.can_manage &&
                              item.enabled && (
                                <Button
                                  variant="ghost"
                                  disabled={c.command.busy}
                                  onClick={() => void c.execute(item)}
                                >
                                  {item.definition.scope === "native_journal"
                                    ? "اجرا روی دفتر اصلی"
                                    : "اجرا روی آخرین گزارش"}
                                </Button>
                              )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableEmptyCell colSpan={3} title="قاعده‌ای تعریف نشده" />
                  )}
                </TableBody>
              </Table>
              <CursorPagination {...c.rules} />
            </>
          )}
        </Panel>
        {c.capabilities.data?.can_manage && <AutomationRuleForm c={c} />}
        {!c.nativeScope && c.view.error && (
          <ErrorState message={c.view.error.message} onRetry={c.view.refresh} />
        )}

        <Panel title={c.nativeScope ? "سابقه اجرای دفتر اصلی" : "سابقه اجرا"}>
          {c.runs.loading ? (
            <LoadingState />
          ) : c.runs.error ? (
            <ErrorState
              message={c.runs.error.message}
              onRetry={c.runs.refresh}
            />
          ) : !c.runs.data?.items.length ? (
            <EmptyState compact title="اجرایی ثبت نشده" />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>تاریخ</TableHead>
                    <TableHead>اقدام انجام‌شده</TableHead>
                    <TableHead>نتیجه</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.runs.data.items.map((run) => (
                    <TableRow key={run.id}>
                      <TableRowHeader>
                        {displayDate(run.created_at)}
                      </TableRowHeader>
                      <TableCell>{persian(run.result.action_count)}</TableCell>
                      <TableCell>
                        {(
                          {
                            completed: "بررسی شد",
                            actor_access_revoked: "مجوز مسئول لغو شده",
                            not_matched: "شرط منطبق نبود",
                            missing_condition_data: "اطلاعات شرط ناموجود است",
                            module_disabled: "ماژول خاموش است",
                          } as Record<string, string>
                        )[run.result.action_state] || "اقدام انجام نشد"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <CursorPagination {...c.runs} />
            </>
          )}
        </Panel>
      </div>
    </>
  );
}
export function AutomationRulesView() {
  const w = useWorkspace();
  if (!w.company) return <NoCompany />;
  return <RulesWorkspace key={`${w.user?.id}:${w.company.id}`} />;
}
