import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { useManualGroups, type ManualGroupPreview } from "./use-manual-groups";
const workspace=vi.hoisted(()=>({
  user:{id:"user"},company:{id:"company"},canWrite:true,
  companyPath:(path:string)=>`/companies/${workspace.company.id}/${path}`,
}));
vi.mock("./workspace",()=>({useWorkspace:()=>workspace}));
vi.mock("@/lib/api",async original=>({...await original<typeof import("@/lib/api")>(),api:vi.fn()}));
vi.mock("@/components/ui/sonner",()=>({notify:{success:vi.fn()}}));
const row=(id:string,amount:string)=>({id,source_row_id:id,account:"A",date:"2026-09-05",reference:id,party_id:"",amount});
const banks=[row("b1","10"),row("b2","20")],ledgers=[row("l1","10"),row("l2","20")];
const preview:ManualGroupPreview={id:"preview",digest:"a".repeat(64),version:1,status:"needs_review",current:true,reason:null,
  snapshot:{banks,ledgers,bank_ids:["b1","b2"],ledger_ids:["l1","l2"],bank_total:"30",ledger_total:"30",difference:"0",can_accept:true,dates:["2026-09-05"],reason_codes:["party_missing"],evidence_refs:["b1","b2","l1","l2"]}};
beforeEach(()=>{
  workspace.user={id:"user"};workspace.company={id:"company"};workspace.canWrite=true;
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async(path,options)=>{
    if(path.includes("/options?"))return {items:path.includes("side=bank")?banks:ledgers,next_cursor:null};
    if(path.endsWith("/previews")&&options?.method==="POST")return preview;
    if(path.endsWith("/decisions"))return {...preview,status:"accepted",version:2};
    if(path.endsWith("/previews/preview"))return preview;
    return {items:[],next_cursor:null};
  });
});
it("requires explicit selection and exact stored preview before acceptance",async()=>{
  const decided=vi.fn();const {result}=renderHook(()=>useManualGroups("run",decided));
  act(()=>result.current.openPanel());
  await waitFor(()=>expect(result.current.bankOptions.data?.items).toHaveLength(2));
  act(()=>{result.current.add("bank","b1");result.current.add("bank","b2");result.current.add("ledger","l1");result.current.add("ledger","l2");});
  expect(result.current.current.banks).toHaveLength(2);
  expect(result.current.canPreview).toBe(true);
  act(()=>result.current.decide("accepted"));
  expect(vi.mocked(api).mock.calls.some(([path])=>path.endsWith("/decisions"))).toBe(false);
  act(()=>result.current.preview());
  await waitFor(()=>expect(result.current.current.preview?.digest).toBe(preview.digest));
  act(()=>result.current.setReason("روابط انتخاب‌ها بررسی شد"));
  act(()=>result.current.decide("accepted"));
  await waitFor(()=>expect(result.current.current.preview?.status).toBe("accepted"));
  const call=vi.mocked(api).mock.calls.find(([path])=>path.endsWith("/decisions"));
  expect(call?.[1]?.body).toEqual({expected_digest:preview.digest,expected_version:1,decision:"accepted",reason:"روابط انتخاب‌ها بررسی شد"});
  expect(call?.[1]?.version).toBe(1);expect(decided).toHaveBeenCalledTimes(1);
});
it("editing selected rows invalidates preview and clears approval reason",async()=>{
  const {result}=renderHook(()=>useManualGroups("run"));
  act(()=>result.current.openPanel());
  act(()=>result.current.view(preview));
  await waitFor(()=>expect(result.current.current.preview?.id).toBe("preview"));
  act(()=>result.current.setReason("بررسی قدیمی"));
  act(()=>result.current.remove("bank","b1"));
  expect(result.current.current.preview).toBeNull();expect(result.current.current.reason).toBe("");
  act(()=>result.current.decide("accepted"));
  expect(vi.mocked(api).mock.calls.some(([path])=>path.endsWith("/decisions"))).toBe(false);
});
it("stale previews cannot accept, but an explicit reason can release old acceptance",async()=>{
  vi.mocked(api).mockImplementation(async path=>path.endsWith("/previews/preview")?{...preview,current:false,status:"accepted"}:path.endsWith("/decisions")?{...preview,current:false,status:"rejected",version:2}:{items:[],next_cursor:null});
  const {result}=renderHook(()=>useManualGroups("new-run"));
  act(()=>result.current.openPanel());act(()=>result.current.view(preview));
  await waitFor(()=>expect(result.current.current.preview?.current).toBe(false));
  act(()=>result.current.setReason("برگشت تصمیم قبلی"));
  expect(result.current.canAccept).toBe(false);expect(result.current.canDecide).toBe(true);
  act(()=>result.current.decide("accepted"));
  expect(vi.mocked(api).mock.calls.some(([path])=>path.endsWith("/decisions"))).toBe(false);
  act(()=>result.current.decide("rejected"));
  await waitFor(()=>expect(result.current.current.preview?.status).toBe("rejected"));
});
it("role downgrade and company change discard mutation authority and old selections",async()=>{
  const {result,rerender}=renderHook(()=>useManualGroups("run"));
  act(()=>result.current.openPanel());act(()=>result.current.view(preview));
  await waitFor(()=>expect(result.current.current.preview?.id).toBe("preview"));
  act(()=>result.current.setReason("تأیید"));
  workspace.canWrite=false;rerender();act(()=>result.current.decide("accepted"));
  expect(vi.mocked(api).mock.calls.some(([path])=>path.endsWith("/decisions"))).toBe(false);
  workspace.company={id:"other"};rerender();expect(result.current.open).toBe(false);expect(result.current.current.preview).toBeNull();
});
