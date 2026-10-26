"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/product-api";
import type { ReviewPreviewData } from "@/lib/review";

export type ProposalDecision = "confirm" | "reject";
export type ProposalBusy = { id: string; decision: ProposalDecision } | null;
export type ReviewPreviewOptions = {
  request?: typeof api;
  onChanged?: () => void;
  onDetailChange?: (detail: ReviewPreviewData) => void;
  onBusyChange?: (busy: boolean) => void;
};

export function useReviewPreview(companyId: string, itemId: string, {
  request = api, onChanged, onDetailChange, onBusyChange,
}: ReviewPreviewOptions = {}) {
  const [detail, setDetail] = useState<ReviewPreviewData | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState<ProposalBusy>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const mounted = useRef(true);
  const path = `/companies/${companyId}/findings/${itemId}`;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    setFailed(false); setDetail(null);
    request<ReviewPreviewData>(path).then(result => { if (active) setDetail(result); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [path, request, retry]);

  async function decide(proposalId: string, decision: ProposalDecision) {
    if (submitting.current || !detail?.can_review_proposals) return;
    submitting.current = true;
    setBusy({ id: proposalId, decision }); setMessage(""); setError("");
    onBusyChange?.(true);
    try {
      try {
        const result = await request<{ status: string }>(`${path}/proposals/${proposalId}/decision`, { method: "POST", body: JSON.stringify({ decision }) });
        if (result?.status !== (decision === "confirm" ? "confirmed" : "rejected")) throw Error("نتیجه ثبت دریافت نشد؛ جزئیات را به‌روز کنید.");
      } catch (cause) {
        if (mounted.current) setError(cause instanceof TypeError || cause instanceof SyntaxError ? "نتیجه ثبت دریافت نشد؛ جزئیات را به‌روز کنید." : cause instanceof Error ? cause.message : "نتیجه ثبت دریافت نشد؛ جزئیات را به‌روز کنید.");
        return;
      }
      if (!mounted.current) return;
      setMessage(decision === "confirm" ? "تطبیق تأیید شد." : "پیشنهاد رد شد.");
      onChanged?.();
      // A successful write is never reported as failed when the subsequent refresh fails.
      setDetail(null); setFailed(false);
      try {
        const updated = await request<ReviewPreviewData>(path);
        if (mounted.current) { setDetail(updated); onDetailChange?.(updated); }
      } catch {
        if (mounted.current) setFailed(true);
      }
    } finally {
      submitting.current = false;
      if (mounted.current) { setBusy(null); onBusyChange?.(false); }
    }
  }
  return { detail, failed, busy, message, error, decide, retryLoad: () => { setError(""); setRetry(value => value + 1); onChanged?.(); } };
}
