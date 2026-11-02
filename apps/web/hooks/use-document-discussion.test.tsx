import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import { useDocumentDiscussion } from "./use-document-discussion";
const workspace=vi.hoisted(()=>({user:{id:"user"},company:{id:"company"},canWrite:true,companyPath:(path:string)=>`/companies/${workspace.company.id}/${path}`}));
vi.mock("./workspace",()=>({useWorkspace:()=>workspace}));
vi.mock("@/lib/api",async original=>({...await original<typeof import("@/lib/api")>(),api:vi.fn()}));
vi.mock("@/components/ui/sonner",()=>({notify:{success:vi.fn()}}));
const source={subject:{kind:"draft",id:"draft",description:"خدمات",version:1,state:"draft",digest:"a".repeat(64)},thread:null,expected_version:1,can_write:true};
beforeEach(()=>{
  workspace.user={id:"user"};workspace.company={id:"company"};workspace.canWrite=true;
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async(path,options)=>{
    if(path.includes("/discussions?")||options?.method==="POST"||options?.method==="PATCH")return source;
    return {items:[],next_cursor:null};
  });
});
it("comments pin the visible document digest and thread version, without posting",async()=>{
  const {result}=renderHook(()=>useDocumentDiscussion("draft","draft",true));
  await waitFor(()=>expect(result.current.resource.data?.subject.digest).toBe(source.subject.digest));
  act(()=>result.current.commentChange({kind:"document_request",message:"اصل سند ارائه شود"}));
  act(()=>result.current.add());
  await waitFor(()=>expect(result.current.comment.message).toBe(""));
  const call=vi.mocked(api).mock.calls.find(([path,options])=>path.endsWith("/discussions/activities")&&options?.method==="POST");
  expect(call?.[1]?.body).toMatchObject({subject_kind:"draft",subject_id:"draft",expected_subject_digest:source.subject.digest,expected_version:1,kind:"document_request"});
  expect(vi.mocked(api).mock.calls.some(([path])=>path.includes("/postings"))).toBe(false);
});
it("source conflict preserves the typed request and requires explicit refresh",async()=>{
  vi.mocked(api).mockImplementation(async(_path,options)=>{if(options?.method==="POST")throw new ApiError(409,"نسخه تغییر کرده","document_context_changed");return source;});
  const {result}=renderHook(()=>useDocumentDiscussion("draft","draft",true));
  await waitFor(()=>expect(result.current.resource.data).toBeDefined());
  act(()=>result.current.commentChange({message:"درباره نسخه قدیمی"}));act(()=>result.current.add());
  await waitFor(()=>expect(result.current.blocked).toBe(true));
  expect(result.current.comment.message).toBe("درباره نسخه قدیمی");
  const mutations=()=>vi.mocked(api).mock.calls.filter(([,options])=>options?.method==="POST");
  act(()=>result.current.add());expect(mutations()).toHaveLength(1);
});
it("current role and company guards block stale callbacks",async()=>{
  const {result,rerender}=renderHook(()=>useDocumentDiscussion("draft","draft",true));
  await waitFor(()=>expect(result.current.resource.data).toBeDefined());
  act(()=>result.current.commentChange({message:"نظر"}));const add=result.current.add;
  workspace.canWrite=false;rerender();act(()=>add());
  expect(vi.mocked(api).mock.calls.some(([,options])=>options?.method==="POST")).toBe(false);
  workspace.canWrite=true;workspace.company={id:"other"};rerender();act(()=>add());
  expect(result.current.comment.message).toBe("");
  expect(vi.mocked(api).mock.calls.some(([,options])=>options?.method==="POST")).toBe(false);
});
