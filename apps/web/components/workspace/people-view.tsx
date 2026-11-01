"use client";
import { UsersThreeIcon, ReceiptIcon, ShieldCheckIcon, WalletIcon, ArrowClockwiseIcon } from "@phosphor-icons/react";
import { usePeopleView, payrollLabels, type PeopleKind } from "@/hooks/use-people-view";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState, StatusMessage } from "@/components/ui/content-states";
import { SearchInput } from "@/components/ui/search-input";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableRowHeader, TableCell, TableEmptyCell } from "@/components/ui/table";
import { StatCards } from "@/components/ui/financial/stat-cards";
import { NoCompany, PageHeader, Panel, PeriodFilter } from "./page-parts";
import { amount, displayDate, persian } from "@/lib/utils";
const icons = { employees: UsersThreeIcon, payroll: WalletIcon, tax: ReceiptIcon, insurance: ShieldCheckIcon, "employee-reports": UsersThreeIcon };
export function PeopleView({ kind }: { kind: PeopleKind }) {
  const view = usePeopleView(kind);
  if (!view.workspace.company) return <NoCompany />;
  const columns = view.config.columns;
  return <>
    <PageHeader title={view.config.title} icon={icons[kind]} action={<div className="flex flex-wrap gap-2">{kind !== "employee-reports" && <ButtonLink variant="secondary" href="/employee-reports">گزارش کارمندان</ButtonLink>}<ButtonLink variant="secondary" href={kind === "employees" ? "/templates/employees.csv" : "/templates/payroll.csv"}>قالب فایل</ButtonLink></div>} />
    <PeriodFilter />
    {view.loading ? <LoadingState label={`در حال دریافت ${view.config.title}`} /> : view.error ? <ErrorState message={view.error.message} onRetry={view.refresh} /> : view.data?.status !== "available" ? <Panel><EmptyState title={view.data?.reason || "اسناد این بخش موجود نیست"} action={view.workspace.canWrite && <ButtonLink href="/uploads">بارگذاری اسناد</ButtonLink>} /></Panel> : <div className="space-y-5">
      {kind === "tax" && <StatusMessage>مالیات حقوق ثبت‌شده در اسناد</StatusMessage>}
      {kind !== "employees" && <StatCards metrics={view.metrics} items={columns.map(key => ({key, label: payrollLabels[key], icon: icons[kind]}))} />}
      <Panel title="اطلاعات اسناد">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <SearchInput label="جستجوی نام یا کد کارمند" value={view.query} onChange={event => view.setQuery(event.target.value)} className="min-w-0 flex-1" />
          {view.query && <Button variant="ghost" onClick={() => view.setQuery("")}><ArrowClockwiseIcon size={18} aria-hidden />پاک‌کردن جستجو</Button>}
          <span className="text-xs text-muted">{persian(view.total)} ردیف</span>
        </div>
        <Table><TableHeader><TableRow><TableHead>کارمند</TableHead><TableHead>کد پرسنلی</TableHead><TableHead>تاریخ سند</TableHead>{columns.map(key => <TableHead key={key}>{payrollLabels[key]} ({view.workspace.unit === "IRR" ? "ریال" : "تومان"})</TableHead>)}</TableRow></TableHeader>
        <TableBody>{view.rows.length ? view.rows.map(row => <TableRow key={row.id}><TableRowHeader>{row.employee_name}</TableRowHeader><TableCell><span dir="ltr">{row.employee_id}</span></TableCell><TableCell>{displayDate(row.date)}</TableCell>{columns.map(key => <TableCell key={key}>{amount(row.values[key], view.workspace.unit)}</TableCell>)}</TableRow>) : <TableEmptyCell colSpan={3 + columns.length} title="کارمندی با این جستجو پیدا نشد" action={<Button variant="secondary" onClick={() => view.setQuery("")}>پاک‌کردن جستجو</Button>} />}</TableBody></Table>
        {(view.hasNext || view.hasPrevious) && <div className="mt-4 flex items-center justify-between gap-3"><Button variant="secondary" disabled={!view.hasPrevious} onClick={view.previous}>قبلی</Button><span className="text-xs text-muted">صفحه {persian(view.page + 1)}</span><Button variant="secondary" disabled={!view.hasNext} onClick={view.next}>بعدی</Button></div>}
      </Panel>
    </div>}
  </>;
}
