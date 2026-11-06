'use client';
import { BooksIcon } from '@phosphor-icons/react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Drawer } from "@/components/ui/drawer";
import { Form } from '@/components/ui/form';
import { Field, FormMessage } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select } from '@/components/ui/select';
import { ErrorState, LoadingState } from '@/components/ui/content-states';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableRowHeader, TableEmptyCell } from '@/components/ui/table';
import { CursorPagination } from '@/components/ui/pagination';
import { Badge } from '@/components/ui/badge';
import { useDimensionManagement } from '@/hooks/use-dimensions';
import { useWorkspace } from '@/hooks/workspace';
import { dimensionKinds } from '@/lib/dimensions';
import { NoCompany, PageHeader, Panel } from './page-parts';
export function DimensionsManagementView() { const workspace = useWorkspace(); return workspace.company ? <Workspace key={workspace.company.id}/> : <NoCompany />; }
function Workspace() {
    const view = useDimensionManagement();
    return <>
    <PageHeader title="پروژه، شعبه و مرکز هزینه" icon={BooksIcon} action={<div className="flex flex-wrap gap-2">
<ButtonLink href="/reports/dimensions" variant="secondary">گزارش ابعاد</ButtonLink>{view.workspace.canWrite && <Button onClick={() => view.open(null)}>بُعد جدید</Button>}</div>}/>
    <Panel>{view.resource.loading ? <LoadingState label="در حال دریافت ابعاد"/> : view.resource.error ? <ErrorState message={view.resource.error.message} onRetry={view.resource.refresh}/> : <>
<Table>
<TableHeader>
<TableRow>
<TableHead>نام</TableHead>
<TableHead>کد</TableHead>
<TableHead>نوع</TableHead>
<TableHead>وضعیت</TableHead>
<TableHead>عملیات</TableHead>
</TableRow>
</TableHeader>
<TableBody>{view.rows.length ? view.rows.map(item => <TableRow key={item.id}>
<TableRowHeader>{item.name}</TableRowHeader>
<TableCell>{item.code}</TableCell>
<TableCell>{dimensionKinds.find(kind => kind.value === item.kind)?.label}</TableCell>
<TableCell>
<Badge>{item.active ? 'فعال' : 'بایگانی'}</Badge>
</TableCell>
<TableCell>{view.workspace.canWrite && <Button variant="secondary" onClick={() => view.open(item)}>ویرایش</Button>}</TableCell>
</TableRow>) : <TableEmptyCell colSpan={5} title="بُعدی تعریف نشده"/>}</TableBody>
</Table>
<CursorPagination {...view.resource}/>
</>}</Panel>
    <Drawer title={view.editing ? 'ویرایش بُعد' : 'بُعد جدید'} open={view.editing !== undefined} onOpenChange={open => { if (!open)
        view.close(); }}>
<Form fieldErrors={view.command.error?.fields} onSubmit={event => { event.preventDefault(); view.save(); }}>
<Field id="dimension-kind" label="نوع">
<Select id="dimension-kind" value={view.value.kind} options={dimensionKinds} disabled={!!view.editing || view.command.busy} onValueChange={kind => view.change({ kind })}/>
</Field>
<Field id="dimension-code" label="کد">
<Input id="dimension-code" required maxLength={80} value={view.value.code} onChange={event => view.change({ code: event.target.value })}/>
</Field>
<Field id="dimension-name" label="نام">
<Input id="dimension-name" required maxLength={120} value={view.value.name} onChange={event => view.change({ name: event.target.value })}/>
</Field>
<Checkbox id="dimension-active" label="فعال" checked={view.value.active} onCheckedChange={active => view.change({ active })}/>
<FormMessage error>{view.command.error?.message}</FormMessage>
<Button type="submit" busy={view.command.busy}>ذخیره</Button>
</Form>
</Drawer>
</>;
}
