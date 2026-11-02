"use client";
import { Button } from "@/components/ui/button";
import { Table,TableHeader,TableRow,TableHead,TableBody,TableRowHeader,TableCell } from "@/components/ui/table";
import type { ManualGroupRow } from "@/hooks/use-manual-groups";
import { amount,displayDate } from "@/lib/utils";
export function ReconciliationSelectedRows({rows,canRemove,busy,onRemove}:{rows:ManualGroupRow[];canRemove:boolean;busy:boolean;onRemove:(id:string)=>void}){
 if(!rows.length)return null;
 return <Table><TableHeader><TableRow><TableHead>حساب / مرجع</TableHead><TableHead>تاریخ</TableHead><TableHead>مبلغ (ریال)</TableHead><TableHead>طرف حساب</TableHead>{canRemove&&<TableHead>انتخاب</TableHead>}</TableRow></TableHeader>
 <TableBody>{rows.map(row=><TableRow key={row.id}><TableRowHeader><p>{row.account}</p><p className="text-xs text-muted">{row.reference||"بدون مرجع"}</p></TableRowHeader><TableCell>{displayDate(row.date)}</TableCell><TableCell>{amount(row.amount)}</TableCell><TableCell>{row.party_id||"نامشخص"}</TableCell>{canRemove&&<TableCell><Button variant="ghost" disabled={busy} onClick={()=>onRemove(row.id)} aria-label={`حذف انتخاب ${row.reference||row.account}`}>حذف</Button></TableCell>}</TableRow>)}</TableBody></Table>;
}
