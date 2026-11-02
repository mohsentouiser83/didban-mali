"use client";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { CursorPagination } from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableEmptyCell, TableHead, TableHeader, TableRow, TableRowHeader } from "@/components/ui/table";
import type { ReportBuilderController } from "@/hooks/use-report-builder";
import { listItems } from "@/lib/api";
import { displayDate, persian } from "@/lib/utils";
import { Panel } from "./page-parts";

export function ReportBuilderSaved({ controller: c }: { controller: ReportBuilderController }) {
  return <>
    <Panel title="گزارش‌های ذخیره‌شده">{c.definitions.loading ? <LoadingState label="دریافت گزارش‌های ذخیره‌شده" /> : c.definitions.error ? <ErrorState message={c.definitions.error.message} onRetry={c.definitions.refresh} /> : <><Table><TableHeader><TableRow><TableHead>گزارش</TableHead><TableHead>نسخه</TableHead><TableHead>عملیات</TableHead></TableRow></TableHeader><TableBody>{listItems(c.definitions.data).length ? listItems(c.definitions.data).map(item => <TableRow key={item.id}><TableRowHeader>{item.name}</TableRowHeader><TableCell>{persian(item.version)}</TableCell><TableCell><div className="flex flex-wrap gap-2"><Button variant="ghost" disabled={c.command.busy} onClick={() => c.open(item)}>بررسی تعریف</Button>{c.workspace.canWrite && <Button variant="soft" disabled={c.command.busy} onClick={() => c.rerun(item)}>اجرای دوباره</Button>}</div></TableCell></TableRow>) : <TableEmptyCell colSpan={3} title="گزارش ذخیره‌شده‌ای نیست" />}</TableBody></Table><CursorPagination {...c.definitions} /></>}</Panel>
    <Panel title="اجراهای ثابت گزارش">{c.runs.loading ? <LoadingState label="دریافت اجراهای گزارش" /> : c.runs.error ? <ErrorState message={c.runs.error.message} onRetry={c.runs.refresh} /> : <><Table><TableHeader><TableRow><TableHead>گزارش</TableHead><TableHead>تاریخ اجرا</TableHead><TableHead>ردیف‌ها</TableHead><TableHead>مشاهده</TableHead></TableRow></TableHeader><TableBody>{listItems(c.runs.data).length ? listItems(c.runs.data).map(item => <TableRow key={item.id}><TableRowHeader>{item.title}</TableRowHeader><TableCell>{displayDate(item.created_at)}</TableCell><TableCell>{persian(item.row_count || 0)}</TableCell><TableCell><Button variant="ghost" disabled={c.command.busy} onClick={() => c.viewRun(item)}>مشاهدهٔ همین نسخه</Button></TableCell></TableRow>) : <TableEmptyCell colSpan={4} title="اجرای ذخیره‌شده‌ای نیست" />}</TableBody></Table><CursorPagination {...c.runs} /></>}</Panel>
  </>;
}
