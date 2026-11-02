import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, type ReconciliationCandidate, type ReconciliationRun } from "@/lib/api";
import { useReconciliation } from "./use-reconciliation";

const workspace=vi.hoisted(()=>({company:{id:"company"},canWrite:true,companyPath:(path:string)=>`/companies/${workspace.company.id}/${path}`}));
vi.mock("./workspace",()=>({useWorkspace:()=>workspace}));
vi.mock("@/lib/api",async original=>({...await original<typeof import("@/lib/api")>(),api:vi.fn()}));
vi.mock("@/components/ui/sonner",()=>({notify:{success:vi.fn()}}));
const candidate:ReconciliationCandidate={id:"candidate",bank_id:"bank",ledger_ids:["ledger"],bank_account:"A",ledger_account:"1101",reference:"R",date:"2026-09-05",amount:"30",status:"needs_review",reason_codes:[],evidence_refs:[],version:1};
let run:ReconciliationRun;
beforeEach(()=>{
  workspace.company={id:"company"};workspace.canWrite=true;
  run={id:"run",manifest_id:"manifest",version:1,bank_to_ledger:{A:"1101"},candidates:[candidate],created_at:"2026-11-02"};
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async(path,options)=>{
    if(path.endsWith("/reconciliations/latest"))return run;
    if(path.endsWith("/reconciliation-options"))return {manifest_id:"manifest",bank_accounts:["A"],ledger_accounts:[{account:"1101",role:"bank"}]};
    if(options?.method==="POST")return {id:"decision"};
    return {};
  });
});
it("uses refreshed group projection to block stale individual acceptance and clears on release",async()=>{
  const {result}=renderHook(()=>useReconciliation());
  await waitFor(()=>expect(result.current.candidates).toHaveLength(1));
  const oldSelection=result.current.candidates[0];
  run={...run,candidates:[{...candidate,status:"accepted_in_group",group_state:"accepted",group_decision_id:"group"}]};
  act(()=>result.current.latest.refresh());
  await waitFor(()=>expect(result.current.candidates[0].status).toBe("accepted_in_group"));
  expect(result.current.isGrouped(oldSelection)).toBe(true);
  act(()=>result.current.decide(oldSelection,"accepted","بررسی تکی",vi.fn()));
  expect(vi.mocked(api).mock.calls.some(([,options])=>options?.method==="POST")).toBe(false);
  run={...run,candidates:[candidate]};act(()=>result.current.latest.refresh());
  await waitFor(()=>expect(result.current.candidates[0].status).toBe("needs_review"));
  expect(result.current.isGrouped(oldSelection)).toBe(false);
  const done=vi.fn();await act(async()=>{await result.current.decide(oldSelection,"accepted","پس از برگشت گروه",done);});
  await waitFor(()=>expect(done).toHaveBeenCalledTimes(1));
});
it("a stale callback cannot submit after company change or role downgrade",async()=>{
  const {result,rerender}=renderHook(()=>useReconciliation());
  await waitFor(()=>expect(result.current.candidates).toHaveLength(1));
  const decide=result.current.decide;
  workspace.canWrite=false;rerender();act(()=>decide(candidate,"accepted","بررسی",vi.fn()));
  expect(vi.mocked(api).mock.calls.some(([,options])=>options?.method==="POST")).toBe(false);
  workspace.canWrite=true;workspace.company={id:"other"};rerender();
  act(()=>decide(candidate,"accepted","بررسی",vi.fn()));
  expect(vi.mocked(api).mock.calls.some(([,options])=>options?.method==="POST")).toBe(false);
});
