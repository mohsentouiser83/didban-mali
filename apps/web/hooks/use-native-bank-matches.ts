"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { useWorkspace } from "./workspace";
import { useResource } from "./use-resource";
import { usePagedResource } from "./use-paged-resource";
import { useCommand } from "./use-command";
import type { ManualGroupPreview, ManualGroupRow } from "./use-manual-groups";
import { amount, displayDate, persian } from "@/lib/utils";
interface Statement { id:string; digest:string; snapshot:{title:string;as_of:string;period:{name:string}} }
interface Sources {bank_manifest_id:string|null;bank_accounts:string[];ledger_accounts:string[]}
interface Page {items:ManualGroupRow[];page:number;total:number;page_size:number}
interface NativePreview extends ManualGroupPreview {
  native_statement_id:string;
  snapshot:ManualGroupPreview["snapshot"]&{basis:"native_book";native_statement_id:string;bank_account:string;ledger_account:string;statement_as_of:string;statement_period:{name:string}};
}
interface Editor {scope:string;statementId:string;bankAccount:string;ledgerAccount:string;banks:ManualGroupRow[];ledgers:ManualGroupRow[];preview:NativePreview|null;reason:string}
const blank=(scope:string):Editor=>({scope,statementId:"",bankAccount:"",ledgerAccount:"",banks:[],ledgers:[],preview:null,reason:""});
export function useNativeBankMatches(){
 const workspace=useWorkspace();const scope=`${workspace.user?.id}:${workspace.company?.id}`;
 const live=useRef({scope,canWrite:workspace.canWrite});useLayoutEffect(()=>{live.current={scope,canWrite:workspace.canWrite};},[scope,workspace.canWrite]);
 const base=workspace.companyPath("reconciliation-native-groups");const command=useCommand();
 const [editor,setEditor]=useState<Editor>(()=>blank(scope));const current=editor.scope===scope?editor:blank(scope);
 const statements=usePagedResource<Statement>(workspace.companyPath("accounting/statements"));
 const sources=useResource<Sources>(base?`${base}/sources${current.statementId?`?native_statement_id=${encodeURIComponent(current.statementId)}`:""}`:null);
 const history=usePagedResource<NativePreview>(base?`${base}/previews`:null);
 const [query,setQuery]=useState({scope,bank:"",ledger:""});const queries=query.scope===scope?query:{scope,bank:"",ledger:""};
 const [pagination,setPagination]=useState({bankScope:"",ledgerScope:"",bank:0,ledger:0});
 const bankScope=`${scope}:${current.statementId}:${current.bankAccount}:${queries.bank}`;
 const ledgerScope=`${scope}:${current.statementId}:${current.ledgerAccount}:${queries.ledger}`;
 const bankPage=pagination.bankScope===bankScope?pagination.bank:0;const ledgerPage=pagination.ledgerScope===ledgerScope?pagination.ledger:0;
 const optionPath=(side:"bank"|"ledger",account:string,q:string,page:number)=>base&&current.statementId&&account?`${base}/options?native_statement_id=${encodeURIComponent(current.statementId)}&side=${side}&account=${encodeURIComponent(account)}&q=${encodeURIComponent(q)}&page=${page}`:null;
 const bankOptions=useResource<Page>(optionPath("bank",current.bankAccount,queries.bank,bankPage));const ledgerOptions=useResource<Page>(optionPath("ledger",current.ledgerAccount,queries.ledger,ledgerPage));
 const revision=useRef(0);
 const valid=()=>live.current.scope===scope&&live.current.canWrite;
 const change=(patch:Partial<Editor>)=>setEditor(previous=>({...(previous.scope===scope?previous:blank(scope)),...patch}));
 function add(side:"bank"|"ledger",id:string){if(!valid()||command.busy)return;const row=(side==="bank"?bankOptions:ledgerOptions).data?.items.find(item=>item.id===id);if(!row)return;revision.current++;const key=side==="bank"?"banks":"ledgers";setEditor(previous=>{const value=previous.scope===scope?previous:blank(scope);if(value[key].some(item=>item.id===id)||value[key].length>=100)return value;return {...value,[key]:[...value[key],row],preview:null,reason:""};});command.clearError();}
 function remove(side:"bank"|"ledger",id:string){if(!valid()||command.busy)return;revision.current++;const key=side==="bank"?"banks":"ledgers";setEditor(previous=>{const value=previous.scope===scope?previous:blank(scope);return {...value,[key]:value[key].filter(item=>item.id!==id),preview:null,reason:""};});command.clearError();}
 const canPreview=workspace.canWrite&&!command.busy&&!sources.loading&&!sources.error&&!!sources.data?.bank_manifest_id&&!!current.statementId&&!!current.bankAccount&&!!current.ledgerAccount&&!!current.banks.length&&!!current.ledgers.length;
 function preview(){if(!canPreview||!valid())return;const requestRevision=++revision.current;change({preview:null,reason:""});void command.run<NativePreview>(base?`${base}/previews`:null,{body:{bank_manifest_id:sources.data!.bank_manifest_id,native_statement_id:current.statementId,bank_account:current.bankAccount,ledger_account:current.ledgerAccount,bank_ids:current.banks.map(row=>row.id),ledger_ids:current.ledgers.map(row=>row.id)}},result=>{if(live.current.scope!==scope||revision.current!==requestRevision)return;change({preview:result});history.refresh();});}
 function startNew() {
   revision.current++;
   setEditor(blank(scope));
   setQuery({scope, bank:"", ledger:""});
   setPagination({bankScope:"",ledgerScope:"",bank:0,ledger:0});
   command.clearError();
 }
 function view(item:NativePreview){if(command.busy)return;const requestRevision=++revision.current;change({preview:null,reason:""});void command.run<NativePreview>(base?`${base}/previews/${item.id}`:null,{method:"GET"},result=>{if(live.current.scope!==scope||revision.current!==requestRevision)return;change({preview:result,statementId:result.native_statement_id,bankAccount:result.snapshot.bank_account,ledgerAccount:result.snapshot.ledger_account,banks:result.snapshot.banks,ledgers:result.snapshot.ledgers,reason:""});});}
 const canDecide=!!current.preview&&workspace.canWrite&&!command.busy&&!!current.reason.trim()&&command.error?.code!=="version_conflict";const canAccept=canDecide&&!!current.preview?.current&&!!current.preview?.snapshot.can_accept;
 function decide(decision:"accepted"|"rejected"){if(!valid()||!canDecide||!current.preview||(decision==="accepted"&&!canAccept))return;const selected=current.preview;const requestRevision=++revision.current;void command.run<NativePreview>(base?`${base}/previews/${selected.id}/decisions`:null,{version:selected.version,body:{expected_digest:selected.digest,expected_version:selected.version,decision,reason:current.reason.trim()}},result=>{if(live.current.scope!==scope||revision.current!==requestRevision)return;change({preview:result,reason:""});history.refresh();},"تصمیم تطبیق با دفتر دیدبان ثبت شد.");}
 const choices=(side:"bank"|"ledger")=>{const selected=new Set((side==="bank"?current.banks:current.ledgers).map(row=>row.id));return ((side==="bank"?bankOptions:ledgerOptions).data?.items||[]).filter(row=>!selected.has(row.id)).map(row=>({value:row.id,label:`${row.reference||"بدون مرجع"} · ${displayDate(row.date)} · ${amount(row.amount)} ریال · ${row.party_id||"طرف نامشخص"}`}));};
 return {workspace,command,current,statements,sources,history,bankOptions,ledgerOptions,bankPage,ledgerPage,queries,canPreview,canDecide,canAccept,add,remove,preview,view,decide,startNew,
   statementChoices:(statements.data?.items||[]).map(item=>({value:item.id,label:`${item.snapshot.period.name} · ${displayDate(item.snapshot.as_of)} · ${item.digest.slice(0,8)}`})),
   bankAccountChoices:(sources.data?.bank_accounts||[]).map(value=>({value,label:value})),ledgerAccountChoices:(sources.data?.ledger_accounts||[]).map(value=>({value,label:value})),
   bankChoices:choices("bank"),ledgerChoices:choices("ledger"),
   selectStatement:(statementId:string)=>{if(!command.busy){revision.current++;setEditor({...blank(scope),statementId});command.clearError();}},
   selectAccount:(side:"bank"|"ledger",account:string)=>{if(!command.busy){revision.current++;change(side==="bank"?{bankAccount:account,banks:[],preview:null,reason:""}:{ledgerAccount:account,ledgers:[],preview:null,reason:""});command.clearError();}},
   queryChange:(side:"bank"|"ledger",value:string)=>setQuery({...queries,[side]:value}),
   pageChange:(side:"bank"|"ledger",page:number)=>setPagination(previous=>({...previous,[side]:Math.max(0,page),[side==="bank"?"bankScope":"ledgerScope"]:side==="bank"?bankScope:ledgerScope})),
   setReason:(reason:string)=>{change({reason});command.clearError();},refreshSelected:()=>{if(current.preview)view(current.preview);},
   selectedDateLabels:current.preview?.snapshot.dates.map(displayDate).join("، ")||"",
   bookProofHref:current.preview?`/api/v1${workspace.companyPath(`accounting/statements/${current.preview.native_statement_id}/export`)}`:undefined,
   bankEvidenceRefs:current.preview?.snapshot.banks.map(row=>row.source_row_id),
   historyRows:(history.data?.items||[]).map(item=>({...item,label:`${persian(item.snapshot.bank_ids.length)} بانک / ${persian(item.snapshot.ledger_ids.length)} دفتر دیدبان · ${amount(item.snapshot.bank_total)} ریال`})),
 };
}
export type NativeBankController=ReturnType<typeof useNativeBankMatches>;
