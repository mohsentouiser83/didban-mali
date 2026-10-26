"use client";
import { useEffect, useRef } from "react";
import { ErrorState, StatusMessage } from "@/components/ui/financial";
import type { ReviewItem } from "@/lib/review";
import { useReviewPreview, type ReviewPreviewOptions } from "./use-review-preview";
import { ReviewProposals } from "./review-proposals";
import { ReviewSummary } from "./review-summary";
import { ReviewPreviewLoading } from "./review-preview-loading";

export function ReviewPreview({ companyId, item, ...options }: { companyId: string; item: ReviewItem } & ReviewPreviewOptions) {
  const { detail, failed, retryLoad, busy, message, error, decide } = useReviewPreview(companyId, item.id, options);
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => { if (message || error) feedback.current?.focus(); }, [message, error]);
  const response = <div ref={feedback} tabIndex={-1} className="outline-none">{message && <StatusMessage tone="success">{message}</StatusMessage>}{error && <ErrorState variant="inline" onRetry={retryLoad} retryLabel="به‌روزرسانی جزئیات">{error}</ErrorState>}</div>;
  if (failed) return <>{response}<ErrorState onRetry={retryLoad} variant="compact"><p>{message ? "جزئیات به‌روز دریافت نشد." : "جزئیات دریافت نشد."}</p></ErrorState></>;
  if (!detail) return <>{response}<ReviewPreviewLoading /></>;
  return <>
    {(message || error) && response}
    <ReviewSummary detail={detail} item={item} />
    {!!detail.proposals?.length && <ReviewProposals proposals={detail.proposals} companyId={companyId} canReview={!!detail.can_review_proposals} busy={busy} onDecide={decide} />}

  </>;
}

