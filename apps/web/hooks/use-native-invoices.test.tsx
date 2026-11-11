import { act,renderHook,waitFor } from "@testing-library/react";
import { beforeEach,expect,it,vi } from "vitest";
import { api } from "@/lib/api";
import { useNativeInvoices } from "./use-native-invoices";
import { tehranToday, type NativeInvoice } from "@/lib/native-invoices";
const workspace=vi.hoisted(()=>({user:{id:"u"},company:{id:"c"},periodId:"period",canWrite:true,companyPath:(path:string)=>`/companies/${workspace.company.id}/${path}`}));
vi.mock("./workspace",()=>({useWorkspace:()=>workspace}));
vi.mock("@/lib/api",async original=>({...await original<typeof import("@/lib/api")>(),api:vi.fn()}));
vi.mock("@/components/ui/sonner",()=>({notify:{success:vi.fn()}}));
const candidate={operation_id:"op",journal_id:"j",journal_digest:"digest",approved_draft_version:1,reference:"INV",party_id:"P",date:"2026-09-05",amount:"100",unit:"IRR",remaining_capacity:"100"};
const payment={...candidate,operation_id:"receipt",journal_id:"r",journal_digest:"receipt-digest",reference:"RCPT",amount:"40",remaining_capacity:"40"};
const invoice:NativeInvoice={id:"invoice",version:4,direction:"sale",reference:"INV",party_id:"P",date:"2026-09-05",amount:"100",remaining:"100",status:"available",reason:null,unit:"IRR",source:candidate,terms:{id:"terms",version:1,due_date:null,due_unknown:true,expected_date:null,expected_unknown:true,effective_date:"2026-09-05"},allocations:[],terms_history:[]};
beforeEach(()=>{
 workspace.canWrite=true;workspace.company={id:"c"};vi.mocked(api).mockReset();
 vi.mocked(api).mockImplementation(async(path,options)=>{
  if(path.includes("/candidates?"))return {items:[path.includes("kind=receipt")?payment:candidate]};
  if(path.includes("/preview?"))return {metrics:[{metric_key:"trade_receivable_balance",value:"100",status:"available",unit:"IRR",basis:"native_book",reason_codes:[]}]};
  if(path.includes("/reminder"))return {digest:"reminder-digest",text:"متن یادآوری"};
  if(path.endsWith("/allocations"))return {...invoice,version:5,remaining:"60"};
  if(path.endsWith("/terms")||path.endsWith("native-invoices")&&options?.method==="POST")return invoice;
  if(path.includes("/invoice?"))return invoice;
  if(path.includes("/snapshots"))return {items:[],next_cursor:null};
  return {basis:"native_invoice",as_of:"2026-09-30",items:[invoice]};
 });
});
it("requires explicit known-or-unknown dates and links the exact already approved operation",async()=>{
 const {result}=renderHook(()=>useNativeInvoices("sale"));
 await waitFor(()=>expect(result.current.candidateOptions).toHaveLength(1));
 act(()=>result.current.openTerms());act(()=>result.current.selectCandidate("op"));
 expect(result.current.canSaveTerms).toBe(false);
 act(()=>result.current.changeTerms({due_unknown:true,expected_unknown:true,expected_mode:"unknown"}));
 expect(result.current.canSaveTerms).toBe(true);
 act(()=>result.current.saveTerms());await waitFor(()=>expect(result.current.editor).toBeNull());
 const request=vi.mocked(api).mock.calls.find(([path,options])=>path.endsWith("native-invoices")&&options?.method==="POST");
 expect(request?.[1]?.body).toEqual({operation_id:"op",journal_digest:"digest",reference:"INV",due_date:null,due_unknown:true,expected_date:null,expected_unknown:true});
 expect(vi.mocked(api).mock.calls.some(([path])=>path.includes("/posting"))).toBe(false);
});
it("pins the invoice version reviewed when editing terms and requires a correction reason",async()=>{
 const {result}=renderHook(()=>useNativeInvoices("sale"));
 act(()=>result.current.select("invoice"));await waitFor(()=>expect(result.current.detail.data?.id).toBe("invoice"));
 act(()=>result.current.openTerms(invoice));expect(result.current.canSaveTerms).toBe(false);
 act(()=>result.current.changeTerms({effective_date:"2026-09-30",reason:"وعده مشتری اصلاح شد",expected_unknown:false,expected_mode:"date",expected_date:"2026-10-05"}));
 expect(result.current.canSaveTerms).toBe(true);
 act(()=>result.current.saveTerms());await waitFor(()=>expect(result.current.editor).toBeNull());
 const request=vi.mocked(api).mock.calls.find(([path])=>path.endsWith("/terms"));
 expect(request?.[1]?.version).toBe(4);expect(request?.[1]?.body).toMatchObject({reason:"وعده مشتری اصلاح شد",effective_date:"2026-09-30",expected_date:"2026-10-05"});
});
it("allocates only after explicit receipt selection, retaining its immutable proof and invoice version",async()=>{
 const {result}=renderHook(()=>useNativeInvoices("sale"));
 act(()=>result.current.select("invoice"));await waitFor(()=>expect(result.current.detail.data?.id).toBe("invoice"));
 act(()=>result.current.openAllocation());expect(result.current.canSettle).toBe(false);
 act(()=>result.current.changeAllocation({operationId:"receipt",journalId:"r",amount:"40"}));expect(result.current.canSettle).toBe(true);
 act(()=>result.current.settle());await waitFor(()=>expect(result.current.allocation).toBeNull());
 const request=vi.mocked(api).mock.calls.find(([path])=>path.endsWith("/allocations"));
 expect(request?.[1]?.version).toBe(4);expect(request?.[1]?.body).toEqual({operation_id:"receipt",journal_id:"r",journal_digest:"receipt-digest",amount:"40"});
});
it("revoked write permission blocks a previously prepared invoice mutation",async()=>{
 const {result,rerender}=renderHook(()=>useNativeInvoices("sale"));
 act(()=>result.current.select("invoice"));await waitFor(()=>expect(result.current.detail.data?.id).toBe("invoice"));
 act(()=>result.current.openAllocation());act(()=>result.current.changeAllocation({operationId:"receipt",journalId:"r",amount:"40"}));
 workspace.canWrite=false;rerender();act(()=>result.current.settle());
 expect(vi.mocked(api).mock.calls.some(([path])=>path.endsWith("/allocations"))).toBe(false);
});
it("keeps native ledger and invoice amounts separate without adding them",async()=>{
 const {result}=renderHook(()=>useNativeInvoices("sale"));
 await waitFor(()=>expect(result.current.metrics[1].value).toBe("100"));
 expect(result.current.metrics.map(row=>[row.metric_key,row.value])).toEqual([["ar_invoice","100"],["ar_ledger","100"]]);
});
it("revalidates reminder proof before copying edited text and blocks a changed balance",async()=>{
 let reads=0;const original=vi.mocked(api).getMockImplementation()!;
 const copy=vi.fn().mockResolvedValue(undefined);Object.defineProperty(navigator,"clipboard",{value:{writeText:copy},configurable:true});
 vi.mocked(api).mockImplementation(async(path,options)=>path.includes("/reminder")?{digest:++reads===1?"old":"changed",text:"پیش‌نویس"}:original(path,options));
 const {result}=renderHook(()=>useNativeInvoices("sale"));
 act(()=>result.current.select("invoice"));await waitFor(()=>expect(result.current.detail.data?.id).toBe("invoice"));
 act(()=>result.current.prepareReminder());await waitFor(()=>expect(result.current.reminder?.digest).toBe("old"));
 act(()=>result.current.changeReminder("متن ویرایش‌شده"));await act(async()=>{await result.current.copyReminder();});
 expect(copy).not.toHaveBeenCalled();expect(result.current.reminder?.error).toContain("نسخه تغییر کرده");
});
it("allows reversing an allocation whose payment source became unavailable",async()=>{
 const original=vi.mocked(api).getMockImplementation()!;
 vi.mocked(api).mockImplementation(async(path,options)=>path.includes("/invoice?")?{...invoice,status:"unavailable",remaining:null,reason:"native_invoice_allocation_source_invalid"}:original(path,options));
 const {result}=renderHook(()=>useNativeInvoices("sale"));
 act(()=>result.current.select("invoice"));await waitFor(()=>expect(result.current.detail.data?.status).toBe("unavailable"));
 act(()=>result.current.openAllocation("old-allocation"));act(()=>result.current.changeAllocation({reason:"سند دریافت مرجع برگشت شده است"}));
 expect(result.current.canSettle).toBe(true);
 act(()=>result.current.settle());await waitFor(()=>expect(result.current.allocation).toBeNull());
 const request=vi.mocked(api).mock.calls.find(([path])=>path.endsWith("/old-allocation/reversal"));
 expect(request?.[1]?.version).toBe(4);expect(request?.[1]?.body).toEqual({reason:"سند دریافت مرجع برگشت شده است"});
});

it("requires an explicit estimate selection and sends null/false without opting out of D09",async()=>{
 const {result}=renderHook(()=>useNativeInvoices("sale"));
 await waitFor(()=>expect(result.current.candidateOptions).toHaveLength(1));
 act(()=>result.current.openTerms());act(()=>result.current.selectCandidate("op"));
 act(()=>result.current.changeTerms({due_date:"2026-09-30"}));
 expect(result.current.editor?.terms.expected_mode).toBe("");expect(result.current.canSaveTerms).toBe(false);
 act(()=>result.current.selectExpectedMode("history"));expect(result.current.canSaveTerms).toBe(true);
 act(()=>result.current.saveTerms());await waitFor(()=>expect(result.current.editor).toBeNull());
 const request=vi.mocked(api).mock.calls.find(([path,options])=>path.endsWith("native-invoices")&&options?.method==="POST");
 expect(request?.[1]?.body).toMatchObject({expected_date:null,expected_unknown:false,due_date:"2026-09-30",due_unknown:false});
});
it("requests the explicit history priority without estimating receipt statistics in the browser",async()=>{
 const original=vi.mocked(api).getMockImplementation()!;
 vi.mocked(api).mockImplementation(async(path,options)=>path.includes("&priority=")?{basis:"native_invoice",as_of:"2026-11-01",priority_formula:"سابقه سپس تأخیر و مانده",items:[{...invoice,history_event_count:3,history_lag_days:9,history_reason:null,overdue_days:null}]}:original(path,options));
 const {result}=renderHook(()=>useNativeInvoices("sale",true));
 act(()=>result.current.setPriority("history"));await waitFor(()=>expect(result.current.rows[0]?.history_lag_days).toBe(9));
 expect(vi.mocked(api).mock.calls.some(([path])=>path.includes("direction=sale")&&path.includes("&priority=history"))).toBe(true);
 expect(result.current.rows[0].history_event_count).toBe(3);expect(result.current.rows[0].overdue_days).toBeNull();
});
it("adopts only the explicitly reviewed approved replacement with its exact digest and version",async()=>{
 const original=vi.mocked(api).getMockImplementation()!;
 const replacement={...candidate,journal_id:"replacement",journal_digest:"replacement-digest",approved_draft_version:3,replacement_of:"j",amount:"90"};
 vi.mocked(api).mockImplementation(async(path,options)=>path.endsWith("/source-candidates")?{items:[replacement]}:path.endsWith("/source-revisions")?{...invoice,version:5,source:replacement}:original(path,options));
 const {result}=renderHook(()=>useNativeInvoices("sale"));
 act(()=>result.current.select("invoice"));await waitFor(()=>expect(result.current.detail.data?.id).toBe("invoice"));
 act(()=>result.current.openSourceRevision());await waitFor(()=>expect(result.current.sourceCandidates.data?.items).toHaveLength(1));
 expect(result.current.canAdoptSource).toBe(false);
 act(()=>result.current.changeSourceRevision({journalId:"replacement",reason:"جایگزین تأییدشده بررسی شد"}));expect(result.current.canAdoptSource).toBe(true);
 act(()=>result.current.adoptSource());await waitFor(()=>expect(result.current.sourceRevision).toBeNull());
 const request=vi.mocked(api).mock.calls.find(([path])=>path.endsWith("/source-revisions"));
 expect(request?.[1]?.version).toBe(4);expect(request?.[1]?.body).toEqual({journal_id:"replacement",journal_digest:"replacement-digest",approved_draft_version:3,reason:"جایگزین تأییدشده بررسی شد"});
 expect(vi.mocked(api).mock.calls.some(([path])=>path.includes("/posting"))).toBe(false);
});
it("requires explicit release of active allocations before adopting the replacement source",async()=>{
 const original=vi.mocked(api).getMockImplementation()!;
 vi.mocked(api).mockImplementation(async(path,options)=>path.endsWith("/source-candidates")?{items:[candidate]}:path.includes("/invoice?")?{...invoice,allocations:[{id:"old",journal_id:"r",operation_id:"receipt",journal_digest:"r",amount:"10",date:"2026-10-01",status:"available",reversed:false}]}:original(path,options));
 const {result}=renderHook(()=>useNativeInvoices("sale"));
 act(()=>result.current.select("invoice"));await waitFor(()=>expect(result.current.detail.data?.allocations).toHaveLength(1));
 act(()=>result.current.openSourceRevision());await waitFor(()=>expect(result.current.sourceCandidates.data?.items).toHaveLength(1));
 act(()=>result.current.changeSourceRevision({journalId:"j",reason:"بررسی"}));
 expect(result.current.hasActiveAllocations).toBe(true);expect(result.current.canAdoptSource).toBe(false);
 act(()=>result.current.adoptSource());expect(vi.mocked(api).mock.calls.some(([path])=>path.endsWith("/source-revisions"))).toBe(false);
});
it("distinguishes replacement receipt journals sharing an operation identity",async()=>{
 const original=vi.mocked(api).getMockImplementation()!;
 const replacement={...payment,journal_id:"replacement-r",journal_digest:"replacement-receipt-digest",replacement_of:"r"};
 vi.mocked(api).mockImplementation(async(path,options)=>path.includes("kind=receipt")?{items:[payment,replacement]}:original(path,options));
 const {result}=renderHook(()=>useNativeInvoices("sale"));
 act(()=>result.current.select("invoice"));await waitFor(()=>expect(result.current.paymentOptions).toHaveLength(2));
 expect(result.current.paymentOptions.map(row=>row.value)).toEqual(["r","replacement-r"]);
 act(()=>result.current.openAllocation());act(()=>result.current.changeAllocation({journalId:"replacement-r",amount:"40"}));act(()=>result.current.settle());
 await waitFor(()=>expect(result.current.allocation).toBeNull());
 const request=vi.mocked(api).mock.calls.find(([path])=>path.endsWith("/allocations"));
 expect(request?.[1]?.body).toEqual({operation_id:"receipt",journal_id:"replacement-r",journal_digest:"replacement-receipt-digest",amount:"40"});
});

it("shows the exact returned terms history immediately while the background detail refresh is pending",async()=>{
 const original=vi.mocked(api).getMockImplementation()!;
 const first={...invoice,as_of:tehranToday(),terms_history:[invoice.terms!]};
 const secondTerms={...invoice.terms!,id:"terms-2",version:2,expected_date:null,expected_unknown:false};
 const updated={...first,version:5,terms:secondTerms,terms_history:[invoice.terms!,secondTerms]};
 let detailReads=0;
 vi.mocked(api).mockImplementation(async(path,options)=>{
   if(path.endsWith("/terms"))return updated;
   if(path.includes("/invoice?"))return ++detailReads===1?first:new Promise(()=>{});
   return original(path,options);
 });
 const {result}=renderHook(()=>useNativeInvoices("sale"));
 act(()=>result.current.select("invoice"));await waitFor(()=>expect(result.current.detail.data?.terms_history).toHaveLength(1));
 act(()=>result.current.openTerms(first));act(()=>result.current.changeTerms({reason:"اصلاح تاریخ مورد انتظار",effective_date:tehranToday(),expected_mode:"history"}));
 act(()=>result.current.saveTerms());await waitFor(()=>expect(result.current.editor).toBeNull());
 expect(result.current.detail.data?.version).toBe(5);
 expect(result.current.detail.data?.terms_history.map(row=>row.version)).toEqual([1,2]);
 expect(result.current.detail.data?.terms?.expected_unknown).toBe(false);
});
it("does not replace a historical detail with the mutation response for today's scope",async()=>{
 const original=vi.mocked(api).getMockImplementation()!;
 const historical={...invoice,as_of:"2026-09-30",terms_history:[invoice.terms!]};
 const latest={...historical,as_of:tehranToday(),version:5,terms_history:[invoice.terms!,{...invoice.terms!,id:"new",version:2}]};
 let reads=0;
 vi.mocked(api).mockImplementation(async(path,options)=>path.endsWith("/terms")?latest:path.includes("/invoice?")?++reads===1?historical:new Promise(()=>{}):original(path,options));
 const {result}=renderHook(()=>useNativeInvoices("sale"));
 act(()=>result.current.setAsOf("2026-09-30"));act(()=>result.current.select("invoice"));
 await waitFor(()=>expect(result.current.detail.data?.terms_history).toHaveLength(1));
 act(()=>result.current.openTerms(historical));act(()=>result.current.changeTerms({reason:"اصلاح جاری",effective_date:tehranToday(),expected_mode:"history"}));
 act(()=>result.current.saveTerms());await waitFor(()=>expect(result.current.editor).toBeNull());
 expect(result.current.detail.data?.as_of).toBe("2026-09-30");expect(result.current.detail.data?.terms_history).toHaveLength(1);
});

it("selects a linked stock operation from the combined invoice candidates of the current company", async () => {
  const stock = { ...candidate, operation_id: "stock-op", journal_digest: "stock-digest", reference: "STOCK-01" };
  const request = vi.mocked(api).getMockImplementation()!;
  vi.mocked(api).mockImplementation(async (path, options) =>
    path.endsWith("/candidates?kind=purchase") ? { items: [candidate, stock] } : request(path, options),
  );
  const { result } = renderHook(() => useNativeInvoices("purchase", false, "stock-op"));
  await waitFor(() => expect(result.current.preferredCandidate).toEqual(stock));
  act(() => result.current.openTerms());
  expect(result.current.editor?.operationId).toBe("stock-op");
  expect(result.current.canSaveTerms).toBe(false);
  act(() => result.current.changeTerms({ due_unknown: true, expected_unknown: true, expected_mode: "unknown" }));
  act(() => result.current.saveTerms());
  await waitFor(() => expect(result.current.editor).toBeNull());
  expect(vi.mocked(api).mock.calls.find(([, options]) => options?.method === "POST")?.[1]?.body).toMatchObject({
    operation_id: "stock-op", journal_digest: "stock-digest", reference: "STOCK-01",
  });
});
