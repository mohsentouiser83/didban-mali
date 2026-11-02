import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { useNativeBankMatches } from "./use-native-bank-matches";
const workspace=vi.hoisted(()=>({user:{id:"u"},company:{id:"c"},canWrite:true,companyPath:(path:string)=>`/companies/${workspace.company.id}/${path}`}));
vi.mock("./workspace",()=>({useWorkspace:()=>workspace}));
vi.mock("@/lib/api",async original=>({...await original<typeof import("@/lib/api")>(),api:vi.fn()}));
vi.mock("@/components/ui/sonner",()=>({notify:{success:vi.fn()}}));
const row=(id:string)=>({id,source_row_id:id,account:"A",date:"2026-09-05",reference:id,party_id:"",amount:"10"});
const banks=[row("b")],ledgers=[row("l")];
const preview={id:"p",native_statement_id:"s",digest:"a".repeat(64),version:1,status:"needs_review",current:true,reason:null,snapshot:{basis:"native_book" as const,native_statement_id:"s",statement_as_of:"2026-09-30",statement_period:{name:"شهریور"},bank_account:"A",ledger_account:"001",banks,ledgers,bank_ids:["b"],ledger_ids:["l"],bank_total:"10",ledger_total:"10",difference:"0",can_accept:true,dates:["2026-09-05"],reason_codes:[],evidence_refs:["b"]}};
beforeEach(()=>{
 workspace.company={id:"c"};workspace.canWrite=true;vi.mocked(api).mockReset();
 vi.mocked(api).mockImplementation(async(path,options)=>{
  if(path.includes("/sources"))return {bank_manifest_id:"m",bank_accounts:["A"],ledger_accounts:["001"]};
  if(path.includes("/options?"))return {items:path.includes("side=bank")?banks:ledgers,page:0,total:1,page_size:25};
  if(path.endsWith("/decisions"))return {...preview,version:2,status:"accepted"};
  if(path.endsWith("/previews/p")||path.endsWith("/previews")&&options?.method==="POST")return preview;
  return {items:[],next_cursor:null};
 });
});
it("requires explicit two-source mapping and exact server snapshot before native acceptance",async()=>{
 const {result}=renderHook(()=>useNativeBankMatches());
 act(()=>result.current.selectStatement("s"));
 act(()=>{result.current.selectAccount("bank","A");result.current.selectAccount("ledger","001");});
 await waitFor(()=>expect(result.current.bankOptions.data?.items).toHaveLength(1));
 act(()=>{result.current.add("bank","b");result.current.add("ledger","l");});
 expect(result.current.canPreview).toBe(true);
 act(()=>result.current.preview());await waitFor(()=>expect(result.current.current.preview?.id).toBe("p"));
 const request=vi.mocked(api).mock.calls.find(([path,options])=>path.endsWith("/previews")&&options?.method==="POST");
 expect(request?.[1]?.body).toEqual({bank_manifest_id:"m",native_statement_id:"s",bank_account:"A",ledger_account:"001",bank_ids:["b"],ledger_ids:["l"]});
 act(()=>result.current.setReason("اصل دو مبنا بررسی شد"));act(()=>result.current.decide("accepted"));
 await waitFor(()=>expect(result.current.current.preview?.status).toBe("accepted"));
 const accepted=vi.mocked(api).mock.calls.find(([path])=>path.endsWith("/decisions"));
 expect(accepted?.[1]?.body).toEqual({expected_digest:preview.digest,expected_version:1,decision:"accepted",reason:"اصل دو مبنا بررسی شد"});
});
it("changing selected evidence or company clears the exact-review authority",async()=>{
 const {result,rerender}=renderHook(()=>useNativeBankMatches());
 act(()=>result.current.view(preview));await waitFor(()=>expect(result.current.current.preview?.id).toBe("p"));
 act(()=>result.current.setReason("قبلی"));act(()=>result.current.remove("bank","b"));
 expect(result.current.current.preview).toBeNull();expect(result.current.current.reason).toBe("");
 act(()=>result.current.decide("accepted"));expect(vi.mocked(api).mock.calls.some(([path])=>path.endsWith("/decisions"))).toBe(false);
 workspace.company={id:"other"};rerender();expect(result.current.current.statementId).toBe("");
});
