import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import { useCompanyComparison, type ComparisonRun } from "./use-company-comparison";
const workspace = vi.hoisted(() => ({
  user: {id:"user-a"},company: {id:"company-a",role:"owner"},canWrite:true,
  periods:[{id:"p",name:"دوره"}],periodId:"p",
  companyPath:(path:string)=>`/companies/${workspace.company.id}/${path}`,
}));
vi.mock("./workspace",()=>({useWorkspace:()=>workspace}));
vi.mock("@/lib/api",async original=>({...await original<typeof import("@/lib/api")>(),api:vi.fn()}));
vi.mock("@/components/ui/sonner",()=>({notify:{success:vi.fn()}}));
function run(id:string,metricCount=20):ComparisonRun {
  return {id,group_version:1,snapshot:{title:id,limitation:"مقایسه",period:{start:"2026-09-01",end:"2026-09-30"},companies:["company-a","company-b"].map(company_id=>({company_id,name:"نام یکسان",manifest_id:company_id,metrics:Array.from({length:metricCount},(_,index)=>({metric_key:String(index),basis:"ledger",scope:"company",label:"شاخص",value:index===0?"0":"9007199254740993123",unit:"IRR",status:"available",reason_codes:[]}))}))}};
}
beforeEach(()=>{
  workspace.company={id:"company-a",role:"owner"};workspace.user={id:"user-a"};workspace.canWrite=true;
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async path=>{
    if(path.includes("/runs/history"))return {items:[run("first")],next_cursor:null};
    if(path.endsWith("/runs/denied"))throw new ApiError(403,"دسترسی تغییر کرده است.","permission_denied");
    if(path.includes("/runs/"))return run(path.split("/").at(-1)!);
    return {items:[],next_cursor:null};
  });
});
it("paginates comparison rows and distinguishes companies with identical names",async()=>{
  const {result}=renderHook(()=>useCompanyComparison());
  act(()=>result.current.view(run("first")));
  await waitFor(()=>expect(result.current.run?.id).toBe("first"));
  expect(result.current.comparisonRows).toHaveLength(25);
  expect(result.current.comparisonTotal).toBe(40);
  expect(new Set(result.current.comparisonRows.map(row=>row.company_id)).size).toBe(2);
  expect(result.current.comparisonRows[0].value).toBe("0");
  act(()=>result.current.nextComparison());
  expect(result.current.comparisonRows).toHaveLength(15);
  act(()=>result.current.nextComparison());expect(result.current.comparisonPage).toBe(1);
  act(()=>result.current.view(run("second")));
  await waitFor(()=>expect(result.current.run?.id).toBe("second"));
  expect(result.current.comparisonPage).toBe(0);
});
it("rechecks a frozen run through API and clears the old snapshot on denied access",async()=>{
  const {result}=renderHook(()=>useCompanyComparison());
  act(()=>result.current.view(run("first")));
  await waitFor(()=>expect(result.current.run?.id).toBe("first"));
  act(()=>result.current.view(run("denied")));
  expect(result.current.run).toBeUndefined();
  await waitFor(()=>expect(result.current.command.error?.code).toBe("permission_denied"));
  expect(result.current.downloadPath).toBeUndefined();
  expect(vi.mocked(api).mock.calls.some(([path,options])=>path.endsWith("/runs/denied")&&options?.method==="GET")).toBe(true);
});
it("does not show an old company response after the selected company changes",async()=>{
  let resolveRun:(value:ComparisonRun)=>void=()=>{};
  vi.mocked(api).mockImplementation(async path=>path.endsWith("/runs/pending")?new Promise<ComparisonRun>(resolve=>{resolveRun=resolve;}):{items:[],next_cursor:null});
  const {result,rerender}=renderHook(()=>useCompanyComparison());
  act(()=>result.current.view(run("pending")));
  workspace.company={id:"company-b",role:"owner"};rerender();
  await act(async()=>resolveRun(run("pending")));
  expect(result.current.run).toBeUndefined();expect(result.current.comparisonRows).toEqual([]);
});
it("viewer cannot start comparison mutations",()=>{
  workspace.canWrite=false;
  const {result}=renderHook(()=>useCompanyComparison());
  act(()=>result.current.compare({id:"g",name:"گروه",company_ids:["company-a","company-b"],version:1}));
  expect(vi.mocked(api).mock.calls.some(([,options])=>options?.method==="POST")).toBe(false);
});
