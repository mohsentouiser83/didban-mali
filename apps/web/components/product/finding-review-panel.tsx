"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { FormEvent, useMemo, useState } from "react";

import { api } from "@/lib/product-api";
import type { Company, FindingNoteResponse, FindingWorkflowStatus, Member, ReviewDecisionResponse, ReviewDecisionType, ReviewTimelineItem } from "@/lib/product-types";

import { Icon } from "./icons";

const workflowLabels: Record<FindingWorkflowStatus, string> = { needs_review: "نیازمند بررسی", confirmed: "تأییدشده", dismissed: "ردشده", follow_up: "در پیگیری", resolved: "حل‌شده" };
const decisionMeta: Record<ReviewDecisionType, { label: string; description: string; icon: "check" | "alert" | "reconcile" }> = {
  confirmed: { label: "تأیید یافته", description: "شواهد برای پذیرش این مورد کافی است.", icon: "check" },
  dismissed: { label: "رد یافته", description: "مورد پس از بررسی قابل اتکا نیست.", icon: "alert" },
  follow_up: { label: "ارسال به پیگیری", description: "برای نتیجه نهایی اطلاعات بیشتری لازم است.", icon: "reconcile" },
  resolved: { label: "پایان پیگیری", description: "اقدام لازم انجام شده و پرونده بسته می‌شود.", icon: "check" },
};
const allowedTransitions: Record<FindingWorkflowStatus, ReviewDecisionType[]> = {
  needs_review: ["confirmed", "dismissed", "follow_up"],
  confirmed: ["dismissed", "follow_up"],
  dismissed: ["confirmed", "follow_up"],
  follow_up: ["confirmed", "dismissed", "resolved"],
  resolved: ["follow_up"],
};

function faDateTime(value: string) { return new Intl.DateTimeFormat("fa-IR", { dateStyle: "long", timeStyle: "short" }).format(new Date(value)); }
function shortId(value: string) { return `${value.slice(0, 8)}…${value.slice(-4)}`; }

export function FindingReviewPanel({ company, currentUserId, findingId, currentStatus, items, members, nextCursor, onChanged, onLoadMore }: { company: Company; currentUserId: string; findingId: string; currentStatus: FindingWorkflowStatus; items: ReviewTimelineItem[]; members: Member[]; nextCursor: string | null; onChanged: () => Promise<void>; onLoadMore: () => Promise<void> }) {
  const [decision, setDecision] = useState<ReviewDecisionType | "">("");
  const [decisionNote, setDecisionNote] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [supersedesId, setSupersedesId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"decision" | "note" | "more" | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const canReview = company.role === "advisor" || company.role === "finance_manager";
  const memberById = useMemo(() => new Map(members.map((member) => [member.user_id, member])), [members]);
  const replacedNoteIds = useMemo(() => new Set(items.map((item) => item.supersedes_id).filter((id): id is string => Boolean(id))), [items]);
  const availableDecisions = allowedTransitions[currentStatus];

  function actorName(actorId: string) {
    const member = memberById.get(actorId);
    if (actorId === currentUserId) return `${member?.full_name ?? "شما"} (شما)`;
    return member?.full_name ?? `کاربر ${shortId(actorId)}`;
  }

  async function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess("");
    if (!decision) { setError("یکی از تصمیم‌های مجاز را انتخاب کنید."); return; }
    setBusy("decision");
    try {
      await api<ReviewDecisionResponse>(`/companies/${company.id}/findings/${findingId}/decisions`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ decision, note: decisionNote.trim() || null }) });
      await onChanged(); setDecision(""); setDecisionNote(""); setSuccess("تصمیم ثبت شد و وضعیت پرونده به‌روز شد.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تصمیم ثبت نشد."); }
    finally { setBusy(null); }
  }

  async function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess("");
    if (!noteBody.trim()) { setError("متن یادداشت را وارد کنید."); return; }
    setBusy("note");
    try {
      await api<FindingNoteResponse>(`/companies/${company.id}/findings/${findingId}/notes`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ body: noteBody, supersedes_id: supersedesId }) });
      await onChanged(); setNoteBody(""); setSupersedesId(null); setSuccess(supersedesId ? "نسخه جدید یادداشت ثبت شد؛ نسخه قبلی در تاریخچه باقی ماند." : "یادداشت به تاریخچه پرونده اضافه شد.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "یادداشت ثبت نشد."); }
    finally { setBusy(null); }
  }

  function replaceNote(item: ReviewTimelineItem) { setSupersedesId(item.id); setNoteBody(item.body ?? ""); document.getElementById("finding-note-body")?.focus(); }
  function cancelReplacement() { setSupersedesId(null); setNoteBody(""); }

  return <section className="finding-review" aria-labelledby="finding-review-title">
    <header className="review-header"><div><span><Icon name="users" />گردش بررسی انسانی</span><h3 id="finding-review-title">تصمیم مشاور روی پرونده</h3><p>هر اقدام به نام ثبت‌کننده و بدون حذف سابقه نگهداری می‌شود.</p></div><div className={`review-current status-${currentStatus}`}><small>وضعیت جاری</small><strong>{workflowLabels[currentStatus]}</strong></div></header>

    <div className="review-layout">
      <div className="review-compose">
        {canReview ? <>
          <form className="decision-form" onSubmit={(event) => void submitDecision(event)}><fieldset disabled={busy !== null}><legend>تصمیم بعدی</legend><p>فقط گذارهای مجاز برای وضعیت فعلی نمایش داده شده‌اند.</p><div className="decision-options">{availableDecisions.map((value) => <label key={value} className={decision === value ? "selected" : ""}><Input type="radio" name="review-decision" value={value} checked={decision === value} onChange={() => setDecision(value)} /><span><Icon name={decisionMeta[value].icon} /><strong>{decisionMeta[value].label}</strong><small>{decisionMeta[value].description}</small></span></label>)}</div><label className="decision-note">توضیح همراه تصمیم <span>اختیاری · حداکثر ۲۰۰۰ نویسه</span><Textarea value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} maxLength={2000} rows={3} placeholder="دلیل تصمیم یا اقدام بعدی را کوتاه و روشن بنویسید…" /></label><div className="review-form-footer"><small>{new Intl.NumberFormat("fa-IR").format(decisionNote.length)} / ۲۰۰۰</small><Button className="primary-button" disabled={!decision || busy !== null}>{busy === "decision" ? "در حال ثبت…" : "ثبت تصمیم"}</Button></div></fieldset></form>

          <form className="note-form" onSubmit={(event) => void submitNote(event)}><fieldset disabled={busy !== null}><legend>{supersedesId ? "ثبت نسخه جایگزین یادداشت" : "یادداشت مستقل"}</legend><p>{supersedesId ? "نسخه قبلی حذف نمی‌شود و این متن به‌عنوان جایگزین آن ثبت خواهد شد." : "مشاهده یا قراری را بدون تغییر وضعیت پرونده ثبت کنید."}</p>{supersedesId ? <div className="replacement-banner"><Icon name="evidence" /><span>در حال جایگزینی یادداشت {shortId(supersedesId)}</span><Button type="button" onClick={cancelReplacement}>انصراف</Button></div> : null}<label htmlFor="finding-note-body" className="sr-only">متن یادداشت</label><Textarea id="finding-note-body" value={noteBody} onChange={(event) => setNoteBody(event.target.value)} maxLength={4000} rows={4} placeholder="مثلاً: تصویر رسید بانکی از واحد خزانه‌داری دریافت شود…" /><div className="review-form-footer"><small>{new Intl.NumberFormat("fa-IR").format(noteBody.length)} / ۴۰۰۰</small><Button className="secondary-button" disabled={!noteBody.trim() || busy !== null}><Icon name="evidence" />{busy === "note" ? "در حال ثبت…" : supersedesId ? "ثبت نسخه جدید" : "افزودن یادداشت"}</Button></div></fieldset></form>
        </> : <div className="review-readonly"><Icon name="shield" /><div><strong>دسترسی شما فقط برای مشاهده است</strong><p>بر اساس کنترل داخلی، ثبت تصمیم و یادداشت فقط برای مشاور و مدیر مالی فعال است. سابقه کامل همچنان در دسترس شماست.</p></div></div>}
        <div className="review-feedback" aria-live="polite">{error ? <p className="form-error" role="alert">{error}</p> : success ? <p className="form-success"><Icon name="check" />{success}</p> : null}</div>
      </div>

      <section className="review-timeline" aria-labelledby="review-timeline-title"><div className="timeline-heading"><div><h4 id="review-timeline-title">تاریخچه بررسی</h4><p>{items.length ? `${new Intl.NumberFormat("fa-IR").format(items.length)} رویداد ثبت‌شده` : "هنوز اقدامی ثبت نشده است"}</p></div><Icon name="activity" /></div>{items.length ? <ol>{items.map((item) => <li key={item.id} className={`timeline-${item.kind}${replacedNoteIds.has(item.id) ? " superseded" : ""}`}><span className="timeline-marker"><Icon name={item.kind === "decision" ? "check" : "evidence"} /></span><article><header><div><strong>{item.kind === "decision" && item.decision ? decisionMeta[item.decision].label : replacedNoteIds.has(item.id) ? "نسخه قبلی یادداشت" : item.supersedes_id ? "نسخه جایگزین یادداشت" : "یادداشت"}</strong><small>{actorName(item.actor_id)}</small></div><time dateTime={item.created_at}>{faDateTime(item.created_at)}</time></header>{item.kind === "decision" ? <><div className="status-transition"><span>{item.previous_status ? workflowLabels[item.previous_status] : "—"}</span><Icon name="chevron" /><strong>{item.resulting_status ? workflowLabels[item.resulting_status] : "—"}</strong></div>{item.note ? <p>{item.note}</p> : null}</> : <><p>{item.body}</p>{item.supersedes_id ? <small className="supersedes-label">جایگزین {shortId(item.supersedes_id)}</small> : null}{canReview && !replacedNoteIds.has(item.id) ? <Button className="replace-note" onClick={() => replaceNote(item)}>ثبت نسخه جایگزین</Button> : null}</>}</article></li>)}</ol> : <div className="timeline-empty"><Icon name="evidence" /><strong>نخستین بررسی را ثبت کنید</strong><p>تصمیم‌ها و یادداشت‌ها به‌ترتیب زمان در این بخش ظاهر می‌شوند.</p></div>}{nextCursor ? <Button className="secondary-button review-load-more" disabled={busy !== null} onClick={() => { setBusy("more"); void onLoadMore().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "ادامه تاریخچه دریافت نشد.")).finally(() => setBusy(null)); }}>{busy === "more" ? "در حال دریافت…" : "نمایش ادامه تاریخچه"}</Button> : null}</section>
    </div>
  </section>;
}
