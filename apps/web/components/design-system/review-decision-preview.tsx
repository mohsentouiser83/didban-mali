"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { ReviewPreview } from "@/components/product/review-preview";
import type { api } from "@/lib/product-api";
import type { ReviewItem, ReviewPreviewData } from "@/lib/review";

type Mode = "success" | "error" | "refresh_error";
const item: ReviewItem = { id: "sample", title_fa: "مقایسه و تصمیم تطبیق — نمونه", summary_fa: "پیشنهاد تأییدنشده", status: "new", severity: "medium", assigned_to_name: null, due_date: null, affected_amount_irr: "2000000000" };
const sample: ReviewPreviewData = {
  title_fa: item.title_fa, status: "new", summary_fa: "پیشنهاد تطبیق هنوز تأیید نشده است.",
  financial_impact_irr: "2000000000", assigned_to_name: null, due_date: null, can_review_proposals: true,
  reconciliation_state: "suggested", evidence: [], proposals: [{ id: "proposal", score: "85", match_type: "one_to_one", payload: {
    bank: { account_name: "بانک نمونه — جاری", amount_irr: "2000000000", date: "2026-09-12", reference: "B-14", description: "واریز مشتری آفتاب", source: { source_file_id: "", source_filename: "bank-sample.csv", sheet_name: "گردش", row_number: 14 } },
    accounting: { account_name: "بانک نمونه — جاری", amount_irr: "2000000000", date: "2026-09-12", document_number: "JV-42", description: "وصول حساب مشتری آفتاب", source: { source_file_id: "", source_filename: "ledger-sample.xlsx", sheet_name: "روزنامه", row_number: 42 } },
  } }],
};

function previewTransport(mode: Mode): typeof api {
  let decided = false;
  let decision = "";
  // Delayed, local-only transport allows testing pending/disabled controls without financial writes.
  return async <T,>(_path: string, options?: RequestInit): Promise<T> => {
    if (options?.method === "POST") {
      await new Promise(resolve => setTimeout(resolve, 1500));
      if (mode === "error") throw Error("ثبت تصمیم انجام نشد. دوباره تلاش کنید.");
      decided = true;
      decision = JSON.parse(String(options.body)).decision;
      return { status: decision === "confirm" ? "confirmed" : "rejected" } as T;
    }
    if (decided && mode === "refresh_error") throw Error("خطای دریافت نمونه");
    return (decided ? { ...sample, summary_fa: decision === "confirm" ? "تطبیق تأیید شده است." : "پیشنهاد رد شده است.", title_fa: decision === "confirm" ? "تطبیق تأییدشده — نمونه" : "بدون پیشنهاد — نمونه", proposals: [], status: decision === "confirm" ? "resolved" : "new", reconciliation_state: decision === "confirm" ? "matched" : "no_candidate" } : sample) as T;
  };
}

export function ReviewDecisionPreview() {
  const [mode, setMode] = useState<Mode>("success");
  const [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(item.title_fa);
  const request = useMemo(() => previewTransport(mode), [mode, revision]);
  function show(next: Mode) { setMode(next); setRevision(value => value + 1); setTitle(item.title_fa); setOpen(true); }
  return <section id="review-decisions" aria-label="نمونه تصمیم تطبیق" className="space-y-4">
    <h2 className="text-[22px] font-medium">تصمیم تطبیق</h2>
    <p className="text-sm text-muted-foreground">نمونه؛ داده‌ای ثبت نمی‌شود.</p>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => show("success")}>آزمایش تأیید و رد تطبیق</Button>
      <Button variant="outline" onClick={() => show("error")}>آزمایش خطای تصمیم</Button>
      <Button variant="outline" onClick={() => show("refresh_error")}>آزمایش خطای دریافت پس از ثبت</Button>
    </div>
    <Drawer size="wide" className="md:!w-[min(960px,88vw)] [&>div:last-child]:gap-7" closeDisabled={busy} title={title} open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      {open && <ReviewPreview key={revision} companyId="preview" item={item} request={request} onBusyChange={setBusy} onDetailChange={detail => setTitle(detail.title_fa ?? item.title_fa)} />}
    </Drawer>
  </section>;
}
