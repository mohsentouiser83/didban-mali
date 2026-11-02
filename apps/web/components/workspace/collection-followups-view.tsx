"use client";
import { UsersThreeIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CursorPagination, Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Hint } from "@/components/ui/tooltip";
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
import { useCollectionFollowups } from "@/hooks/use-control-workspace";
import { useWorkspace } from "@/hooks/workspace";
import { controlStateLabel } from "@/lib/control";
import { amount, displayDate } from "@/lib/utils";
import { ControlCasePanel } from "./control-case-panel";
import { CollectionReminderDialog } from "./collection-reminder-dialog";
import { useInvoiceBasis } from "@/hooks/use-invoice-basis";
import { NativeInvoicesView } from "./native-invoices-view";
import { NoCompany, PageHeader, Panel } from "./page-parts";

function ImportedCollectionFollowupsView() {
  const workspace = useWorkspace();
  if (!workspace.company) return <NoCompany />;
  return <CollectionWorkspace key={`${workspace.user?.id}:${workspace.company.id}`} />;
}
function CollectionWorkspace() {
  const view = useCollectionFollowups();
  return (
    <>
      <Panel>
        <div className="mb-5 flex flex-wrap items-end gap-4">
          <Field id="collection-scope" label="نمایش">
            <Select
              id="collection-scope"
              value={view.scope}
              onValueChange={view.setScope}
              options={[
                { value: "invoices", label: "فاکتورهای آخرین گزارش" },
                { value: "cases", label: "همه پیگیری‌ها" },
              ]}
            />
          </Field>
          {view.scope === "invoices" && (
            <Field id="collection-query" label="فاکتور یا طرف حساب">
              <Input
                id="collection-query"
                value={view.query}
                maxLength={100}
                onChange={(event) => view.setQuery(event.target.value)}
              />
            </Field>
          )}
          {view.scope === "invoices" && view.resource.data && (
            <Hint label="ترتیب پیگیری">
              {view.resource.data.priority_formula}
            </Hint>
          )}
          {view.scope === "invoices" && (
            <Field id="collection-priority" label="ترتیب پیگیری">
              <Select
                id="collection-priority"
                value={view.priority}
                onValueChange={view.setPriority}
                options={[
                  { value: "amount", label: "مانده و تأخیر" },
                  { value: "history", label: "سابقه وصول مشتری" },
                ]}
              />
            </Field>
          )}
        </div>
        {view.scope === "invoices" ? (
          view.resource.loading ? (
            <LoadingState
              label="در حال دریافت فاکتورهای قابل پیگیری"
              variant="panels"
            />
          ) : view.resource.error ? (
            <ErrorState
              message={view.resource.error.message}
              onRetry={view.resource.refresh}
            />
          ) : (
            <>
              {view.resource.data?.as_of_date && (
                <p className="mb-4 text-xs text-muted">
                  مبنای مانده و تأخیر:{" "}
                  {displayDate(view.resource.data.as_of_date)}
                </p>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>فاکتور</TableHead>
                    <TableHead>طرف حساب</TableHead>
                    <TableHead>مانده (ریال)</TableHead>
                    <TableHead>تأخیر تا تاریخ گزارش</TableHead>
                    {view.priority === "history" && (
                      <TableHead>تأخیر معمول وصول</TableHead>
                    )}
                    <TableHead>پیگیری</TableHead>
                    <TableHead>
                      <span className="sr-only">عملیات</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.rows.length ? (
                    view.rows.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableRowHeader>
                          <span dir="ltr">{invoice.reference}</span>
                        </TableRowHeader>
                        <TableCell>{invoice.party_id}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {amount(invoice.remaining)}
                        </TableCell>
                        <TableCell>{invoice.delayLabel}</TableCell>
                        {view.priority === "history" && (
                          <TableCell>{invoice.historyLabel}</TableCell>
                        )}
                        <TableCell>
                          <Badge>
                            {invoice.case
                              ? controlStateLabel(invoice.case.state)
                              : "بدون پیگیری"}
                          </Badge>
                          {!invoice.ranked && (
                            <span className="mt-1 block text-xs text-muted">
                              مانده ناموجود؛ بدون رتبه
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="secondary"
                            onClick={() => view.openInvoice(invoice)}
                          >
                            {invoice.case ? "پرونده پیگیری" : "بررسی و پیگیری"}
                          </Button>
                          {view.reminder.canPrepare && (
                            <Button
                              variant="ghost"
                              disabled={
                                view.reminder.command.busy ||
                                invoice.remaining === null ||
                                !view.resource.data?.manifest_id
                              }
                              onClick={() => {
                                if (view.resource.data?.manifest_id)
                                  view.reminder.open(
                                    invoice.id,
                                    view.resource.data.manifest_id,
                                  );
                              }}
                            >
                              پیش‌نویس یادآوری
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableEmptyCell
                      colSpan={view.priority === "history" ? 7 : 6}
                      title={
                        view.query
                          ? "فاکتوری با این جستجو پیدا نشد"
                          : "فاکتور قابل پیگیری در آخرین گزارش نیست"
                      }
                    />
                  )}
                </TableBody>
              </Table>
              <Pagination
                page={view.page}
                total={view.resource.data?.total || 0}
                onPrevious={view.previousPage}
                onNext={view.nextPage}
              />
            </>
          )
        ) : view.cases.loading ? (
          <LoadingState label="در حال دریافت پیگیری‌ها" variant="panels" />
        ) : view.cases.error ? (
          <ErrorState
            message={view.cases.error.message}
            onRetry={view.cases.refresh}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>فاکتور</TableHead>
                  <TableHead>مسئول</TableHead>
                  <TableHead>مهلت پیگیری</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>
                    <span className="sr-only">عملیات</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.historicalCases.length ? (
                  view.historicalCases.map((item) => (
                    <TableRow key={item.id}>
                      <TableRowHeader>
                        {item.source_snapshot.title}
                      </TableRowHeader>
                      <TableCell>
                        {item.assignee_name || "تعیین نشده"}
                      </TableCell>
                      <TableCell>{displayDate(item.due_date)}</TableCell>
                      <TableCell>
                        <Badge>{controlStateLabel(item.state)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="secondary"
                          onClick={() => view.openCase(item)}
                        >
                          پرونده پیگیری
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableEmptyCell colSpan={5} title="پیگیری‌ای ثبت نشده" />
                )}
              </TableBody>
            </Table>
            <CursorPagination {...view.cases} />
          </>
        )}
      </Panel>
      <ControlCasePanel view={view.panel} />
      <CollectionReminderDialog c={view.reminder} />
    </>
  );
}

export function CollectionFollowupsView() {
 const view=useInvoiceBasis();
 if(!view.workspace.company)return <NoCompany/>;
 return <><PageHeader icon={UsersThreeIcon} title="پیگیری وصول" action={<ButtonLink href="/receivables" variant="secondary">مطالبات</ButtonLink>}/><Panel><Field id="collection-data-basis" label="مبنای پیگیری وصول"><Select id="collection-data-basis" value={view.basis} onValueChange={view.select} options={[{value:"native_invoice",label:"فاکتور خدمات دفتر دیدبان"},{value:"imported_invoice",label:"فاکتور واردشده از فایل"}]}/></Field></Panel>{view.setup.loading?<LoadingState/>:view.setup.error?<ErrorState message={view.setup.error.message} onRetry={view.setup.refresh}/>:view.basis==="native_invoice"?<NativeInvoicesView key={view.scope} direction="sale" followups/>:<ImportedCollectionFollowupsView key={view.scope}/>}</>;
}
