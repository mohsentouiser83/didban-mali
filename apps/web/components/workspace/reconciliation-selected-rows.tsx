"use client";
import { TableRowAction, TableRowActions } from "@/components/ui/table-row-actions";
import { Table,TableHeader,TableRow,TableHead,TableBody,TableRowHeader,TableCell } from "@/components/ui/table";
import type { ManualGroupRow } from "@/hooks/use-manual-groups";
import { amount,displayDate } from "@/lib/utils";
export function ReconciliationSelectedRows({rows,canRemove,busy,onRemove}:{rows:ManualGroupRow[];canRemove:boolean;busy:boolean;onRemove:(id:string)=>void}){
 if(!rows.length)return null;
 return <Table><TableHeader><TableRow><TableHead>حساب / مرجع</TableHead><TableHead>تاریخ</TableHead><TableHead>مبلغ (ریال)</TableHead><TableHead>طرف حساب</TableHead>{canRemove&&<TableHead>عملیات</TableHead>}</TableRow></TableHeader>
 <TableBody>{rows.map(row=><TableRow key={row.id}><TableRowHeader><p>{row.account}</p><p className="text-xs text-muted">{row.reference||"بدون مرجع"}</p></TableRowHeader><TableCell>{displayDate(row.date)}</TableCell><TableCell>{amount(row.amount)}</TableCell><TableCell>{row.party_id||"نامشخص"}</TableCell>{canRemove&&<TableCell><TableRowActions label={`عملیات ${row.reference || row.account}`}><TableRowAction danger kind="delete" disabled={busy} onClick={() => onRemove(row.id)}>حذف انتخاب</TableRowAction></TableRowActions></TableCell>}</TableRow>)}</TableBody></Table>;
}
