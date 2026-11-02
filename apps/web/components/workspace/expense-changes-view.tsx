'use client';
import {ChartLineUpIcon} from '@phosphor-icons/react';
import {Button,ButtonLink} from '@/components/ui/button';
import {Drawer} from '@/components/ui/drawer';
import {ErrorState,LoadingState,EmptyState,StatusMessage} from '@/components/ui/content-states';
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell,TableRowHeader,TableEmptyCell} from '@/components/ui/table';
import {Pagination} from '@/components/ui/pagination';
import {useExpenseReview} from '@/hooks/use-expense-review';
import {useWorkspace} from '@/hooks/workspace';
import {amount,displayDate} from '@/lib/utils';
import {NoCompany,PageHeader,Panel,PeriodFilter} from './page-parts';
import {EvidenceList} from './evidence-list';
export function ExpenseChangesView(){const workspace=useWorkspace();return workspace.company?<Workspace key={workspace.company.id}/>:<NoCompany/>;}
function Workspace(){const view=useExpenseReview();return <>
<PageHeader title="تغییر هزینه‌ها" icon={ChartLineUpIcon} action={<ButtonLink href="/review" variant="secondary">بررسی و شواهد</ButtonLink>}/>
<PeriodFilter/>
<Panel title="مقایسهٔ حساب‌های هزینه">
{view.loading?<LoadingState label="در حال مقایسه هزینه‌ها"/>:view.error?<ErrorState message={view.error.message} onRetry={view.refresh}/>:!view.resource.data?<EmptyState title="گزارش این دوره موجود نیست"/>:view.resource.data.status==='unavailable'?<EmptyState title="مقایسه آماده نیست" description={view.resource.data.reason||undefined}/>:<>
<StatusMessage tone="primary">مرتب‌شده بر اساس قدر مطلق تغییر؛ بزرگی تغییر، به‌تنهایی نشانهٔ خطا یا تخلف نیست.</StatusMessage>
<dl className="my-4 grid gap-4 sm:grid-cols-2">
<div>
<dt>دوره جاری</dt>
<dd>{view.resource.data.current_period.name} · {displayDate(view.resource.data.current_period.start)} تا {displayDate(view.resource.data.current_period.end)}</dd>
</div>
<div>
<dt>دوره قبل</dt>
<dd>{view.resource.data.previous_period?.name} · {displayDate(view.resource.data.previous_period?.start)} تا {displayDate(view.resource.data.previous_period?.end)}</dd>
</div>
</dl>
<Table>
<TableHeader>
<TableRow>
<TableHead>حساب</TableHead>
<TableHead>دوره جاری (ریال)</TableHead>
<TableHead>دوره قبل (ریال)</TableHead>
<TableHead>تغییر (ریال)</TableHead>
<TableHead>شواهد</TableHead>
</TableRow>
</TableHeader>
<TableBody>{view.rows.length?view.rows.map(row=>
<TableRow key={row.account}>
<TableRowHeader>{row.account}</TableRowHeader>
<TableCell>{amount(row.current)}</TableCell>
<TableCell>{amount(row.previous)}</TableCell>
<TableCell>{amount(row.difference)}</TableCell>
<TableCell>
<Button variant="secondary" onClick={()=>view.setSelected(row)}>بررسی دو دوره</Button>
</TableCell>
</TableRow>):<TableEmptyCell colSpan={5} title="حساب هزینه‌ای در دو دوره موجود نیست"/>}</TableBody>
</Table>
<Pagination page={view.page} total={view.total} onPrevious={view.previous} onNext={view.next}/>
</>}
</Panel>
<Drawer title={view.selected?`شواهد حساب ${view.selected.account}`:'شواهد دو دوره'} open={!!view.selected} onOpenChange={open=>{if(!open)view.setSelected(null);}}>{view.selected&&<div className="space-y-5">
<section>
<h2 className="mb-3 font-medium">دوره جاری</h2>{view.selected.current_evidence_refs.length?<EvidenceList evidence={view.selected.current_evidence_refs}/>:<StatusMessage>در دفتر کامل این دوره، ردیفی برای این حساب ثبت نشده است؛ مبلغ صفر است.</StatusMessage>}</section>
<section>
<h2 className="mb-3 font-medium">دوره قبل</h2>{view.selected.previous_evidence_refs.length?<EvidenceList evidence={view.selected.previous_evidence_refs}/>:<StatusMessage>در دفتر کامل دوره قبل، ردیفی برای این حساب ثبت نشده است؛ مبلغ صفر است.</StatusMessage>}</section>
</div>}</Drawer>
</>;}
