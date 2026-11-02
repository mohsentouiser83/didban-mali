"use client";
import { Button,ButtonLink } from "@/components/ui/button";
import { Field,FormMessage } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { SearchSelect } from "@/components/ui/search-select";
import { CursorPagination,Pagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/badge";
import { LoadingState,ErrorState,EmptyState,StatusMessage } from "@/components/ui/content-states";
import { useNativeBankMatches,type NativeBankController } from "@/hooks/use-native-bank-matches";
import { persian,displayDate } from "@/lib/utils";
import { Panel } from "./page-parts";
import { GroupPreviewReview } from "./manual-group-matches";
import { ReconciliationSelectedRows } from "./reconciliation-selected-rows";

function Selection({view,side}:{view:NativeBankController;side:"bank"|"ledger"}){
 const bank=side==="bank";const options=bank?view.bankOptions:view.ledgerOptions;const rows=bank?view.current.banks:view.current.ledgers;const page=bank?view.bankPage:view.ledgerPage;const account=bank?view.current.bankAccount:view.current.ledgerAccount;const label=bank?"گردش بانک واردشده":"ردیف بانکی دفتر دیدبان";
 return <section className="space-y-3"><h3 className="font-medium">{label} · {persian(rows.length)} انتخاب</h3>
 {view.workspace.canWrite&&account&&<><Field id={`native-match-${side}`} label={`افزودن ${label}`}><SearchSelect id={`native-match-${side}`} value="" query={view.queries[side]} onQueryChange={q=>view.queryChange(side,q)} onValueChange={id=>view.add(side,id)} options={bank?view.bankChoices:view.ledgerChoices} loading={options.loading} error={options.error?.message} hasMore={(options.data?.total||0)>(page+1)*25} disabled={view.command.busy||rows.length>=100} searchLabel={`جستجوی ${label}`}/></Field><Pagination page={page} total={options.data?.total||0} onPrevious={()=>view.pageChange(side,page-1)} onNext={()=>view.pageChange(side,page+1)}/></>}
 <ReconciliationSelectedRows rows={rows} canRemove={view.workspace.canWrite} busy={view.command.busy} onRemove={id=>view.remove(side,id)}/></section>;
}
export function NativeBankMatchesPanel(){
 const view=useNativeBankMatches();
 return <><Panel title="بانک و نسخهٔ ثابت دفتر دیدبان" action={<ButtonLink href="/reports/native" variant="secondary">صورت مالی دفتر دیدبان</ButtonLink>}>
 {view.statements.loading?<LoadingState label="در حال دریافت نسخه‌های دفتر دیدبان"/>:view.statements.error?<ErrorState message={view.statements.error.message} onRetry={view.statements.refresh}/>:!view.statementChoices.length?<EmptyState title="نسخهٔ ثابت دفتر دیدبان موجود نیست" action={<ButtonLink href="/reports/native">ساخت نسخهٔ گزارش</ButtonLink>}/>:<><Field id="native-bank-statement" label="نسخهٔ دفتر دیدبان"><Select id="native-bank-statement" value={view.current.statementId} onValueChange={view.selectStatement} options={view.statementChoices} disabled={view.command.busy}/></Field><CursorPagination {...view.statements}/>
 {view.sources.loading?<LoadingState label="در حال بررسی مبنای بانک و دفتر"/>:view.sources.error?<ErrorState message={view.sources.error.message} onRetry={view.sources.refresh}/>:!view.sources.data?.bank_accounts.length?<EmptyState title="گردش بانکی برای تطبیق موجود نیست" action={<ButtonLink href="/uploads">ورود گردش بانک</ButtonLink>}/>:view.current.statementId&&<div className="space-y-5">
 {!view.ledgerAccountChoices.length?<StatusMessage>این نسخه ردیف حساب بانکی ندارد؛ نقش حساب‌ها و گزارش را بررسی کنید.</StatusMessage>:<><div className="grid gap-4 sm:grid-cols-2"><Field id="native-match-bank-account" label="حساب گردش بانک"><Select id="native-match-bank-account" value={view.current.bankAccount} onValueChange={value=>view.selectAccount("bank",value)} options={view.bankAccountChoices} disabled={view.command.busy}/></Field><Field id="native-match-ledger-account" label="حساب متناظر در دفتر دیدبان"><Select id="native-match-ledger-account" value={view.current.ledgerAccount} onValueChange={value=>view.selectAccount("ledger",value)} options={view.ledgerAccountChoices} disabled={view.command.busy}/></Field></div><Selection view={view} side="bank"/><Selection view={view} side="ledger"/>{view.workspace.canWrite&&<Button onClick={view.preview} disabled={!view.canPreview} busy={view.command.busy}>ساخت پیش‌نمایش همین انتخاب‌ها</Button>}</>}
 </div>}
 </>}
 {!view.current.preview&&<FormMessage error>{view.command.error?.message}</FormMessage>}
 </Panel>
 {view.current.preview&&<Panel title="بررسی تطبیق با دفتر دیدبان" className="mt-5"><p className="mb-4 text-sm text-muted">دفتر دیدبان تا {displayDate(view.current.preview.snapshot.statement_as_of)} · گردش بانک واردشده</p><GroupPreviewReview key={view.current.preview.id} view={view} ledgerLabel="جمع دفتر دیدبان (ریال)" bookProofHref={view.bookProofHref} evidenceRefs={view.bankEvidenceRefs}/></Panel>}
 <Panel title="تطبیق‌های دفتر دیدبان" className="mt-5">{view.history.loading?<LoadingState label="در حال دریافت تطبیق‌های دفتر دیدبان"/>:view.history.error?<ErrorState message={view.history.error.message} onRetry={view.history.refresh}/>:!view.historyRows.length?<EmptyState compact title="تطبیقی ذخیره نشده"/>:<div className="space-y-2">{view.historyRows.map(item=><Button key={item.id} variant="secondary" className="w-full justify-between" disabled={view.command.busy} onClick={()=>view.view(item)}><span>{item.label}</span><StatusBadge status={item.status}/></Button>)}</div>}<CursorPagination {...view.history}/></Panel>
 </>;
}
