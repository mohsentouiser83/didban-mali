"use client";
import {useState} from "react";
import {useResource} from "./use-resource";
import {useWorkspace} from "./workspace";
import { useCommand } from "./use-command";

interface BotIntake {
  id: string;
  version: number;
}

export function useBotIntakeImport(onRefresh: () => void) {
  const workspace = useWorkspace();
  const command = useCommand();
  const period = workspace.periodId;

  function importFile(item: BotIntake) {
    if (!period) return;
    void command.run(
      workspace.companyPath(`bot-intakes/${item.id}/import`),
      { body: { period_id: period }, version: item.version },
      onRefresh,
      "فایل آمادهٔ پردازش شد.",
    );
  }

  return { command, period, importFile, canImport: workspace.canWrite };
}

interface ExtractionRow{date:string|null;reference:string|null;party_id:string|null;account:string|null;amount:string|null;evidence_refs:string[]}
interface ExtractionProposal{id:string;proposal:{text?:string;family:string;unit:string;calendar:string;rows:ExtractionRow[];evidence_refs:string[];unresolved_fields:string[]}}
export function useBotExtraction(onRefresh:()=>void){
 const workspace=useWorkspace();const base=workspace.companyPath("bot-intakes");const command=useCommand();
 const status=useResource<{enabled:boolean;vision:boolean;voice:boolean;max_pages:number}>(base?base+"/extraction-status":null);
 const [selected,setSelected]=useState<BotIntake>();const [proposal,setProposal]=useState<ExtractionProposal>();
 const [formState,setForm]=useState({period_id:"",family:"unknown",unit:"unknown",calendar:"unknown",rows:[] as ExtractionRow[]});
 const form={...formState,period_id:workspace.periodId};
 function load(item:BotIntake,value:ExtractionProposal){setSelected(item);setProposal(value);setForm({period_id:"",family:value.proposal.family,unit:value.proposal.unit,calendar:value.proposal.calendar,rows:value.proposal.rows});}
 function extract(item:BotIntake){void command.run<ExtractionProposal>(base+`/${item.id}/extract`,{version:item.version},result=>{load({...item,version:item.version+1},result);onRefresh();},"پیشنهاد استخراج آمادهٔ بازبینی است.");}
 function open(item:BotIntake){void command.run<{items:ExtractionProposal[]}>(base+`/${item.id}/extractions`,{method:"GET"},result=>{if(result.items[0])load(item,result.items[0]);});}
 function save(){if(!selected||!proposal||!form.period_id||!form.rows.length)return;void command.run(base+`/extractions/${proposal.id}/review`,{version:selected.version,body:form},()=>{setSelected(undefined);setProposal(undefined);onRefresh();},"بازبینی ذخیره و پروندهٔ پردازش ساخته شد.");}
 return {status,command,selected,proposal,form,extract,open,save,unresolved:proposal?.proposal.unresolved_fields.join("، ")||"",amountLabel:form.family==="bank"?"مبلغ بانک؛ برداشت با علامت منفی":"مبلغ مطابق اصل سند",originalLink:selected?`/api/v1${base}/${selected.id}/download`:undefined,close:()=>setSelected(undefined),change:(patch:Partial<typeof form>)=>setForm(old=>({...old,...patch})),
 line:(index:number,field:keyof Omit<ExtractionRow,"evidence_refs">,value:string)=>setForm(old=>({...old,rows:old.rows.map((row,i)=>i===index?{...row,[field]:value||null}:row)})),
 add:()=>setForm(old=>({...old,rows:[...old.rows,{date:null,reference:null,party_id:null,account:null,amount:null,evidence_refs:proposal?.proposal.evidence_refs||[]}]})),
 remove:(index:number)=>setForm(old=>({...old,rows:old.rows.filter((_,i)=>i!==index)})),periodOptions:workspace.periods.map(item=>({value:item.id,label:item.name})),canWrite:workspace.canWrite};
}
