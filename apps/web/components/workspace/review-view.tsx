"use client";
import { ShieldCheckIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Field } from "@/components/ui/field";
import { CursorPagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowHeader,
} from "@/components/ui/table";
import { useControlReview } from "@/hooks/use-control-workspace";
import { useWorkspace } from "@/hooks/workspace";
import { controlStateLabel } from "@/lib/control";
import { amount, displayDate } from "@/lib/utils";
import { ControlCasePanel } from "./control-case-panel";
import { NoCompany, PageHeader, Panel } from "./page-parts";

export function ReviewView() {
  const workspace = useWorkspace();
  if (!workspace.company) return <NoCompany />;
  return <ReviewWorkspace key={workspace.company.id} />;
}
function ReviewWorkspace() {
  const view = useControlReview();
  return (
    <>
      <PageHeader
        icon={ShieldCheckIcon}
        title="سلامت اسناد و مغایرت‌ها"
      />
      <Panel>
        <p className="mb-4 text-xs text-muted leading-6">
          پایش پیوستهٔ سلامت اسناد و دفاتر، کشف ناترازی‌ها و مغایرت‌های بانکی و سامانهٔ مؤدیان همراه با شواهد مستند مبدا.
        </p>
        <div className="mb-5 max-w-sm">
          <Field id="control-scope" label="نمایش">
            <Select
              id="control-scope"
              value={view.scope}
              onValueChange={view.setScope}
              options={[
                { value: "latest", label: "موارد آخرین گزارش" },
                { value: "cases", label: "همه پیگیری‌ها" },
              ]}
            />
          </Field>
        </div>
        {view.resource.loading ? (
          <LoadingState label="در حال دریافت موارد رسیدگی" variant="panels" />
        ) : view.resource.error ? (
          <ErrorState
            message={view.resource.error.message}
            onRetry={view.resource.refresh}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>موضوع</TableHead>
                  <TableHead>نوع</TableHead>
                  <TableHead>مبلغ درگیر (ریال)</TableHead>
                  <TableHead>مسئول و مهلت</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>
                    <span className="sr-only">عملیات</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.rows.length ? (
                  view.rows.map((row) => (
                    <TableRow key={row.subject_id}>
                      <TableRowHeader>
                        <span className="block max-w-sm break-words">
                          {row.source.title}
                        </span>
                      </TableRowHeader>
                      <TableCell>
                        <Badge>
                          {row.source.classification?.label || "نیازمند بررسی"}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {amount(row.source.amount)}
                      </TableCell>
                      <TableCell>
                        <span className="block">
                          {row.case?.assignee_name || "تعیین نشده"}
                        </span>
                        <span className="text-xs text-muted">
                          {displayDate(row.case?.due_date)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          tone={
                            row.case?.state === "resolved"
                              ? "success"
                              : "neutral"
                          }
                        >
                          {row.case
                            ? controlStateLabel(row.case.state)
                            : "بدون پیگیری"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="secondary"
                          onClick={() => view.panel.open(row)}
                        >
                          {row.case ? "پیگیری مغایرت" : "بررسی و شواهد"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableEmptyCell colSpan={6} title="تمام موارد بررسی شده‌اند و موردی باقی نمانده است" />
                )}
              </TableBody>
            </Table>
            <CursorPagination {...view.resource} />
          </>
        )}
      </Panel>
      <ControlCasePanel view={view.panel} />
    </>
  );
}
