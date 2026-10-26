"use client";

import { BookOpen, Landmark } from "@/components/ui/icons";
import { EmptyState, toPersianDigits } from "@/components/ui/financial";
import type { EvidencePayload } from "@/lib/review";
import { ReviewRecordDetails } from "./review-evidence-sources";

export function ReviewProposalComparison({ payload, companyId }: { payload: EvidencePayload; companyId: string }) {
  const journals = payload.ledger_items?.length ? payload.ledger_items : payload.accounting ? [payload.accounting] : [];
  return <section className="grid min-w-0 grid-cols-1 gap-6 sm:grid-cols-2" aria-label="مقایسه اسناد دو طرف">
    <section aria-label="طرف بانک" className="grid min-w-0 content-start gap-5">
      <h4 className="flex items-center gap-2.5 text-base font-semibold text-foreground"><Landmark size={22} aria-hidden="true" className="text-primary" />بانک</h4>
      {payload.bank ? <div className="grid min-w-0 gap-4">{journals.length > 1 && <h5 className="text-sm font-medium">تراکنش بانک</h5>}<ReviewRecordDetails record={payload.bank} companyId={companyId} showMissing showSign /></div> : <EmptyState variant="inline">سند بانک موجود نیست.</EmptyState>}
    </section>
    <section aria-label="طرف حسابداری" className="grid min-w-0 content-start gap-5">
      <h4 className="flex items-center gap-2.5 text-base font-semibold text-foreground"><BookOpen size={22} aria-hidden="true" className="text-primary" />حسابداری</h4>
      {journals.length ? journals.map((record, index) => <div key={record.source?.row_number ?? index} className="grid min-w-0 gap-4 pb-5 last:pb-0">
        {journals.length > 1 && <h5 className="text-sm font-medium">سطر {toPersianDigits(index + 1)}</h5>}
        <ReviewRecordDetails record={record} companyId={companyId} showMissing showSign />
      </div>) : <EmptyState variant="inline">سند حسابداری موجود نیست.</EmptyState>}
    </section>
  </section>;
}
