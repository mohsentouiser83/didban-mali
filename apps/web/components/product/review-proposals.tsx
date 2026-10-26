"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, GitBranch } from "@/components/ui/icons";
import { toPersianDigits } from "@/components/ui/financial";
import type { ReviewProposal } from "@/lib/review";
import type { ProposalBusy, ProposalDecision } from "./use-review-preview";
import { ReviewProposalComparison } from "./review-proposal-comparison";

export function ReviewProposals({ proposals, companyId, canReview, busy, onDecide }: {
  proposals: ReviewProposal[];
  companyId: string;
  canReview: boolean;
  busy: ProposalBusy;
  onDecide: (proposalId: string, decision: ProposalDecision) => void;
}) {
  return <section aria-label="پیشنهادهای تطبیق" className="grid min-w-0 gap-5">
    <h3 className="flex items-center gap-2.5 text-base font-semibold"><GitBranch size={21} aria-hidden="true" className="text-primary" />پیشنهادهای تطبیق{" "}<Badge variant="secondary">{toPersianDigits(proposals.length)}</Badge></h3>
    {proposals.map((proposal, index) => <article key={proposal.id} aria-label={`پیشنهاد ${toPersianDigits(index + 1)}`} aria-busy={busy?.id === proposal.id} className="grid min-w-0 gap-5">
      {proposals.length > 1 && <h4 className="text-sm font-semibold">پیشنهاد {toPersianDigits(index + 1)}</h4>}
      <ReviewProposalComparison payload={proposal.payload} companyId={companyId} />
      {canReview && <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 bg-background py-3">
        <Button type="button" variant="ghost" className="min-h-11 text-destructive hover:text-destructive" disabled={!!busy} loading={busy?.id === proposal.id && busy.decision === "reject"} loadingText="در حال ثبت…" aria-label={`رد پیشنهاد ${toPersianDigits(index + 1)}`} onClick={() => onDecide(proposal.id, "reject")}><X aria-hidden="true" />رد پیشنهاد</Button>
        <Button type="button" className="min-h-11" disabled={!!busy} loading={busy?.id === proposal.id && busy.decision === "confirm"} loadingText="در حال ثبت…" aria-label={`تأیید تطبیق پیشنهاد ${toPersianDigits(index + 1)}`} onClick={() => onDecide(proposal.id, "confirm")}><Check aria-hidden="true" />تأیید تطبیق</Button>
      </div>}
    </article>)}
  </section>;
}
