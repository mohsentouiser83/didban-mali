"use client";
import { SlidersHorizontalIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  StatusMessage,
} from "@/components/ui/content-states";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableRowHeader,
} from "@/components/ui/table";
import { Select } from "@/components/ui/select";
import { useAutomationRules } from "@/hooks/use-automation-rules";
import { actionLabels } from "@/lib/automation";
import { amount, displayDate } from "@/lib/utils";
import { NoCompany, PageHeader, Panel } from "./page-parts";
import { RuleBuilder } from "./rule-builder";
export function RulesView() {
  const c = useAutomationRules();
  if (!c.view.workspace.company) return <NoCompany />;
  return (
    <>
      <PageHeader icon={SlidersHorizontalIcon} title="قواعد مالی" />
      <div className="space-y-5">
        <Panel
          title="قواعد شرکت"
          action={
            c.capabilities.data?.can_manage && (
              <Button variant="secondary" onClick={() => c.load(null)}>
                قاعده تازه
              </Button>
            )
          }
        >
          {c.rules.loading || c.capabilities.loading ? (
            <LoadingState />
          ) : c.rules.error || c.capabilities.error ? (
            <ErrorState
              message={(c.rules.error || c.capabilities.error)!.message}
              onRetry={() => {
                c.rules.refresh();
                c.capabilities.refresh();
              }}
            />
          ) : !c.rules.data?.items.length ? (
            <EmptyState compact title="قاعده‌ای تعریف نشده" />
          ) : (
            <>
              <Select
                label="انتخاب قاعده"
                value={c.local.item?.id || ""}
                onValueChange={(id) =>
                  c.load(
                    c.rules.data!.items.find((item) => item.id === id) || null,
                  )
                }
                options={c.rules.data.items.map((item) => ({
                  value: item.id,
                  label: `${item.name} · ${item.enabled ? "فعال" : "غیرفعال"}`,
                }))}
              />
              <Table aria-label="قواعد تعریف‌شده">
                <TableHeader>
                  <TableRow>
                    <TableHead>قاعده</TableHead>
                    <TableHead>اقدام</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>اجرا</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.rules.data.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableRowHeader>{item.name}</TableRowHeader>
                      <TableCell>
                        {actionLabels[item.definition.action]}
                      </TableCell>
                      <TableCell>
                        <Badge>{item.enabled ? "فعال" : "غیرفعال"}</Badge>
                      </TableCell>
                      <TableCell>
                        {c.capabilities.data?.can_manage && item.enabled && (
                          <Button
                            variant="secondary"
                            disabled={c.command.busy}
                            onClick={() => void c.execute(item)}
                          >
                            اجرای داخلی
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="ghost"
                  disabled={!c.rules.hasPrevious}
                  onClick={c.rules.previousPage}
                >
                  قبلی
                </Button>
                <Button
                  variant="ghost"
                  disabled={!c.rules.hasNext}
                  onClick={c.rules.nextPage}
                >
                  بعدی
                </Button>
              </div>
            </>
          )}
        </Panel>
        {c.capabilities.data?.can_manage && <RuleBuilder controller={c} />}
        {c.preview && (
          <Panel title="اثر قاعده روی گزارش">
            <StatusMessage>
              {c.preview.status === "unavailable"
                ? "داده لازم برای ارزیابی قاعده موجود نیست."
                : `${c.preview.match_count.toLocaleString("fa-IR")} مورد مطابق شرط‌ها؛ ${c.preview.unavailable_count.toLocaleString("fa-IR")} مورد فاقد داده لازم`}
            </StatusMessage>
            {c.preview.matches.length > 0 && (
              <Table aria-label="موارد مطابق قاعده">
                <TableHeader>
                  <TableRow>
                    <TableHead>مورد</TableHead>
                    <TableHead>مبلغ (ریال)</TableHead>
                    <TableHead>شاهد</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.preview.matches.map((item, index) => (
                    <TableRow key={`${item.subject_id}:${index}`}>
                      <TableRowHeader>{item.reference}</TableRowHeader>
                      <TableCell>{amount(item.value, "IRR")}</TableCell>
                      <TableCell>
                        {item.evidence_refs.length.toLocaleString("fa-IR")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Panel>
        )}
        <Panel title="سابقه اجرای داخلی">
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
              <Table aria-label="سابقه قواعد">
                <TableHeader>
                  <TableRow>
                    <TableHead>تاریخ</TableHead>
                    <TableHead>نسخه قاعده</TableHead>
                    <TableHead>موارد مطابق</TableHead>
                    <TableHead>اقدام</TableHead>
                    <TableHead>نتیجه</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.runs.data.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableRowHeader>
                        {displayDate(item.created_at.slice(0, 10))}
                      </TableRowHeader>
                      <TableCell>
                        {item.rule_version.toLocaleString("fa-IR")}
                      </TableCell>
                      <TableCell>
                        {item.result.match_count?.toLocaleString("fa-IR") ?? "—"}
                      </TableCell>
                      <TableCell>
                        {item.result.action_count.toLocaleString("fa-IR")}
                      </TableCell>
                      <TableCell>
                        {item.result.action_state === "completed"
                          ? "انجام شد"
                          : "مجوز مسئول لغو شده"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="ghost"
                  disabled={!c.runs.hasPrevious}
                  onClick={c.runs.previousPage}
                >
                  قبلی
                </Button>
                <Button
                  variant="ghost"
                  disabled={!c.runs.hasNext}
                  onClick={c.runs.nextPage}
                >
                  بعدی
                </Button>
              </div>
            </>
          )}
        </Panel>
      </div>
    </>
  );
}
