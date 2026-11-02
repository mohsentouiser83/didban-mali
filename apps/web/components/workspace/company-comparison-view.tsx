"use client";
import {BuildingsIcon} from "@phosphor-icons/react";
import {Button,ButtonLink} from "@/components/ui/button";
import {Checkbox} from "@/components/ui/checkbox";
import {Dialog} from "@/components/ui/dialog";
import {Form} from "@/components/ui/form";
import {Field,FormMessage} from "@/components/ui/field";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import {LoadingState,ErrorState,EmptyState,StatusMessage} from "@/components/ui/content-states";
import {CursorPagination,Pagination} from "@/components/ui/pagination";
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell,TableRowHeader} from "@/components/ui/table";
import {StatusBadge} from "@/components/ui/badge";
import {useWorkspace} from "@/hooks/workspace";
import {useCompanyComparison} from "@/hooks/use-company-comparison";
import {amount,displayDate} from "@/lib/utils";
import {NoCompany,PageHeader,Panel} from "./page-parts";
function Workspace(){const view=useCompanyComparison();return <>
<PageHeader title="مقایسه شرکت‌ها" icon={BuildingsIcon} action={<div className="flex flex-wrap gap-2"><ButtonLink href="/reports/consolidation" variant="secondary">پیش‌نویس حذف درون‌گروهی</ButtonLink><ButtonLink href="/reports" variant="secondary">گزارش‌ها</ButtonLink></div>}/>
<Panel title="گروه‌های شرکت" action={view.canManage&&<Button onClick={()=>view.open(null)}>گروه جدید</Button>}>
<Field id="comparison-period" label="دوره مقایسه"><Select id="comparison-period" value={view.period} onValueChange={view.setPeriod} options={view.periodOptions}/></Field>
{view.groups.loading?<LoadingState label="در حال دریافت گروه‌ها"/>:view.groups.error?<ErrorState message={view.groups.error.message} onRetry={view.groups.refresh}/>:view.rows.length?<div className="divide-y divide-border">{view.rows.map(group=><div key={group.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><span>{group.name}</span><div className="flex gap-2">{view.canManage&&<Button variant="ghost" onClick={()=>view.open(group)}>ویرایش</Button>}{view.canCompare&&<Button variant="secondary" disabled={!view.period} busy={view.command.busy} onClick={()=>view.compare(group)}>مقایسه</Button>}</div></div>)}</div>:<EmptyState title="گروهی تعریف نشده"/>}<CursorPagination {...view.groups}/><FormMessage error>{view.command.error?.message}</FormMessage></Panel>
{view.run&&<Panel title={view.run.snapshot.title} className="mt-5" action={view.downloadPath&&<ButtonLink download href={view.downloadPath} variant="secondary">دریافت Excel</ButtonLink>}><p className="mb-4 text-sm text-muted">{displayDate(view.run.snapshot.period.start)} تا {displayDate(view.run.snapshot.period.end)}</p><StatusMessage>{view.run.snapshot.limitation}</StatusMessage><Table><TableHeader><TableRow><TableHead>شرکت</TableHead><TableHead>شاخص و مبنا</TableHead><TableHead>مبلغ (ریال)</TableHead><TableHead>وضعیت</TableHead></TableRow></TableHeader><TableBody>{view.comparisonRows.map(row=><TableRow key={`${row.company_id}-${row.metric_key}-${row.basis}`}><TableRowHeader>{row.company}</TableRowHeader><TableCell>{row.label}</TableCell><TableCell>{amount(row.value)}</TableCell><TableCell><StatusBadge status={row.status}/>{row.reason&&<p className="mt-1 text-xs text-muted">{row.reason}</p>}</TableCell></TableRow>)}</TableBody></Table><Pagination page={view.comparisonPage} total={view.comparisonTotal} onPrevious={view.previousComparison} onNext={view.nextComparison}/></Panel>}
<Panel title="مقایسه‌های ذخیره‌شده" className="mt-5">{view.history.loading?<LoadingState/>:view.history.error?<ErrorState message={view.history.error.message} onRetry={view.history.refresh}/>:view.historyRows.length?<div className="flex flex-wrap gap-2">{view.historyRows.map(item=><Button key={item.id} variant="secondary" busy={view.command.busy} onClick={()=>view.view(item)}>{item.snapshot.title}</Button>)}</div>:<EmptyState title="مقایسه‌ای ذخیره نشده"/>}<CursorPagination {...view.history}/></Panel>
<Dialog title={view.editing?"ویرایش گروه":"گروه جدید"} open={view.editing!==undefined} onOpenChange={open=>{if(!open)view.close();}}><Form onSubmit={event=>{event.preventDefault();view.save();}}><Field id="comparison-name" label="نام گروه"><Input id="comparison-name" required maxLength={120} value={view.name} onChange={event=>view.setName(event.target.value)}/></Field><fieldset className="space-y-2"><legend className="mb-2 text-sm">شرکت‌های گروه</legend>{view.workspace.companies.map(company=><Checkbox key={company.id} id={`compare-${company.id}`} label={company.name} checked={view.selected.includes(company.id)} disabled={company.id===view.workspace.company!.id||view.command.busy} onCheckedChange={()=>view.toggle(company.id)}/>)}</fieldset><FormMessage error>{view.command.error?.message}</FormMessage><Button type="submit" disabled={view.selected.length<2} busy={view.command.busy}>ذخیره گروه</Button></Form></Dialog>
</>}
export function CompanyComparisonView(){const workspace=useWorkspace();if(!workspace.company)return <NoCompany/>;return <Workspace key={`${workspace.user?.id}:${workspace.company.id}`}/>}
