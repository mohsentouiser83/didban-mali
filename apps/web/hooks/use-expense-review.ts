'use client';
import {useState} from 'react';
import {useFinancialView} from './use-financial-view';
import {useResource} from './use-resource';
import type {ExpenseChange,ExpenseChanges} from '@/lib/expense-review';
export function useExpenseReview(){
 const financial=useFinancialView();
 const resource=useResource<ExpenseChanges>(financial.manifest?financial.workspace.companyPath(`expense-changes?manifest_id=${financial.manifest.id}`):null);
 const [pageState,setPage]=useState<{manifestId?:string;page:number}>({page:0});
 const [selection,setSelection]=useState<{manifestId?:string;row:ExpenseChange}|null>(null);
 const selected=selection?.manifestId===financial.manifest?.id?selection?.row||null:null;
 const setSelected=(row:ExpenseChange|null)=>setSelection(row?{manifestId:financial.manifest?.id,row}:null);
 const page=pageState.manifestId===financial.manifest?.id?pageState.page:0;
 const rows=(resource.data?.rows||[]).slice(page*25,(page+1)*25);
 return {workspace:financial.workspace,financial,resource,selected,setSelected,rows,page,total:resource.data?.rows.length||0,error:financial.error||resource.error,loading:financial.loading||resource.loading,
 refresh:()=>{financial.refresh();resource.refresh();},previous:()=>setPage({manifestId:financial.manifest?.id,page:Math.max(0,page-1)}),next:()=>setPage({manifestId:financial.manifest?.id,page:page+1})};
}
