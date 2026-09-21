"use client";

import { Alert } from "@/components/ui/alert";

import { ProductCard } from "./product-card";

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

  return (
    <ProductCard className="finding-review p-5 sm:p-6 bg-card border border-border/80 rounded-2xl shadow-sm space-y-6" aria-labelledby="finding-review-title">
      <header className="review-header flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-border/70">
        <div className="space-y-1">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full"><Icon name="users" />بررسی و کارشناسی</span>
          <h3 id="finding-review-title" className="text-lg font-bold text-foreground">ثبت تصمیم و تعیین وضعیت پرونده</h3>
        </div>
        <div className={`review-current status-${currentStatus} flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
          currentStatus === "confirmed" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60" :
          currentStatus === "dismissed" ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60" :
          currentStatus === "follow_up" ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60" :
          currentStatus === "resolved" ? "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-800/60" :
          "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800/60"
        }`}>
          <small className="text-[11px] opacity-80">وضعیت جاری:</small>
          <strong>{workflowLabels[currentStatus]}</strong>
        </div>
      </header>

      <div className="review-layout grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="review-compose lg:col-span-6 space-y-5">
          {canReview ? (
            <>
              <form className="decision-form p-4 rounded-xl border border-border/70 bg-card/60 space-y-4" onSubmit={(event) => void submitDecision(event)}>
                <fieldset disabled={busy !== null} className="space-y-4">
                  <div>
                    <legend className="text-sm font-bold text-foreground">انتخاب اقدام و وضعیت جدید</legend>
                  </div>
                  <div className="decision-options grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {availableDecisions.map((value) => (
                      <label key={value} className={`flex items-start gap-2.5 p-3 rounded-xl border transition-all cursor-pointer text-xs ${
                        decision === value
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border/70 hover:bg-muted/40"
                      }`}>
                        <Input type="radio" name="review-decision" value={value} checked={decision === value} onChange={() => setDecision(value)} className="mt-0.5 h-4 w-4" />
                        <span className="flex flex-col gap-0.5">
                          <strong className="inline-flex items-center gap-1.5 font-semibold text-foreground"><Icon name={decisionMeta[value].icon} />{decisionMeta[value].label}</strong>
                          <small className="text-muted-foreground text-[11px]">{decisionMeta[value].description}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                  <label className="decision-note flex flex-col gap-1.5 text-xs font-medium text-foreground">
                    <div className="flex justify-between">
                      <span>توضیح همراه تصمیم</span>
                      <span className="text-[11px] text-muted-foreground font-normal">اختیاری · حداکثر ۲۰۰۰ نویسه</span>
                    </div>
                    <Textarea value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} maxLength={2000} rows={3} placeholder="دلیل تصمیم یا اقدام بعدی را کوتاه و روشن بنویسید…" className="w-full text-xs" />
                  </label>
                  <div className="review-form-footer flex items-center justify-between pt-1">
                    <small className="text-xs text-muted-foreground">{new Intl.NumberFormat("fa-IR").format(decisionNote.length)} / ۲۰۰۰</small>
                    <Button className="primary-button" disabled={!decision || busy !== null}>{busy === "decision" ? "در حال ثبت…" : "ثبت تصمیم"}</Button>
                  </div>
                </fieldset>
              </form>

              <form className="note-form p-4 rounded-xl border border-border/70 bg-card/60 space-y-4" onSubmit={(event) => void submitNote(event)}>
                <fieldset disabled={busy !== null} className="space-y-4">
                  <div>
                    <legend className="text-sm font-bold text-foreground">{supersedesId ? "ثبت نسخه جایگزین یادداشت" : "یادداشت مستقل"}</legend>
                    <p className="text-xs text-muted-foreground mt-0.5">{supersedesId ? "نسخه قبلی حذف نمی‌شود و این متن به‌عنوان جایگزین آن ثبت خواهد شد." : "مشاهده یا قراری را بدون تغییر وضعیت پرونده ثبت کنید."}</p>
                  </div>
                  {supersedesId ? (
                    <div className="replacement-banner flex items-center justify-between p-2.5 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800/60 text-xs">
                      <span className="inline-flex items-center gap-1.5"><Icon name="evidence" />در حال جایگزینی یادداشت {shortId(supersedesId)}</span>
                      <Button type="button" variant="outline" size="sm" onClick={cancelReplacement} className="h-7 px-2 text-xs">انصراف</Button>
                    </div>
                  ) : null}
                  <label htmlFor="finding-note-body" className="sr-only">متن یادداشت</label>
                  <Textarea id="finding-note-body" value={noteBody} onChange={(event) => setNoteBody(event.target.value)} maxLength={4000} rows={4} placeholder="مثلاً: تصویر رسید بانکی از واحد خزانه‌داری دریافت شود…" className="w-full text-xs" />
                  <div className="review-form-footer flex items-center justify-between pt-1">
                    <small className="text-xs text-muted-foreground">{new Intl.NumberFormat("fa-IR").format(noteBody.length)} / ۴۰۰۰</small>
                    <Button className="secondary-button inline-flex items-center gap-1.5" disabled={!noteBody.trim() || busy !== null}><Icon name="evidence" />{busy === "note" ? "در حال ثبت…" : supersedesId ? "ثبت نسخه جدید" : "افزودن یادداشت"}</Button>
                  </div>
                </fieldset>
              </form>
            </>
          ) : (
            <div className="review-readonly flex items-start gap-3 p-4 rounded-xl border border-border/80 bg-muted/30 text-xs text-muted-foreground">
              <Icon name="shield" />
              <div>
                <strong className="block text-foreground font-semibold mb-1">دسترسی شما فقط برای مشاهده است</strong>
                <p>بر اساس کنترل داخلی، ثبت تصمیم و یادداشت فقط برای مشاور و مدیر مالی فعال است. سابقه کامل همچنان در دسترس شماست.</p>
              </div>
            </div>
          )}
          <div className="review-feedback" aria-live="polite">
            {error ? <Alert className="form-error border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-900" role="alert">{error}</Alert> : success ? <Alert className="form-success border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-900 flex items-center gap-2"><Icon name="check" />{success}</Alert> : null}
          </div>
        </div>

        <section className="review-timeline lg:col-span-6 border border-border/70 rounded-xl p-4 bg-card/40 space-y-4" aria-labelledby="review-timeline-title">
          <div className="timeline-heading flex items-center justify-between pb-3 border-b border-border/70">
            <div>
              <h4 id="review-timeline-title" className="text-sm font-bold text-foreground">تاریخچه بررسی</h4>
              <p className="text-xs text-muted-foreground">{items.length ? `${new Intl.NumberFormat("fa-IR").format(items.length)} رویداد ثبت‌شده` : "هنوز اقدامی ثبت نشده است"}</p>
            </div>
            <span className="text-muted-foreground"><Icon name="activity" /></span>
          </div>
          {items.length ? (
            <ol className="relative border-r border-border/80 mr-3 space-y-4">
              {items.map((item) => (
                <li key={item.id} className={`relative pr-6 ${replacedNoteIds.has(item.id) ? "opacity-60" : ""}`}>
                  <span className={`absolute -right-[9px] top-1 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-card ${
                    item.kind === "decision" ? "bg-primary text-primary-foreground" : "bg-muted-foreground text-card"
                  }`}>
                    <Icon name={item.kind === "decision" ? "check" : "evidence"} />
                  </span>
                  <article className="rounded-xl border border-border/60 bg-card p-3 text-xs space-y-2">
                    <header className="flex items-center justify-between gap-2 pb-2 border-b border-border/40">
                      <div>
                        <strong className="block font-semibold text-foreground">
                          {item.kind === "decision" && item.decision ? decisionMeta[item.decision].label : replacedNoteIds.has(item.id) ? "نسخه قبلی یادداشت" : item.supersedes_id ? "نسخه جایگزین یادداشت" : "یادداشت"}
                        </strong>
                        <small className="text-[11px] text-muted-foreground">{actorName(item.actor_id)}</small>
                      </div>
                      <time className="text-[11px] text-muted-foreground" dateTime={item.created_at}>{faDateTime(item.created_at)}</time>
                    </header>
                    {item.kind === "decision" ? (
                      <>
                        <div className="status-transition inline-flex items-center gap-2 py-1 px-2 rounded-lg bg-muted/40 text-[11px]">
                          <span>{item.previous_status ? workflowLabels[item.previous_status] : "—"}</span>
                          <Icon name="chevron" />
                          <strong className="text-foreground">{item.resulting_status ? workflowLabels[item.resulting_status] : "—"}</strong>
                        </div>
                        {item.note ? <p className="text-xs text-foreground/90 whitespace-pre-wrap">{item.note}</p> : null}
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-foreground/90 whitespace-pre-wrap">{item.body}</p>
                        {item.supersedes_id ? <small className="block text-[10px] text-muted-foreground">جایگزین {shortId(item.supersedes_id)}</small> : null}
                        {canReview && !replacedNoteIds.has(item.id) ? (
                          <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-primary hover:text-primary hover:bg-primary/10" onClick={() => replaceNote(item)}>ثبت نسخه جایگزین</Button>
                        ) : null}
                      </>
                    )}
                  </article>
                </li>
              ))}
            </ol>
          ) : (
            <div className="timeline-empty flex flex-col items-center justify-center text-center p-8 rounded-xl border border-dashed border-border/70 text-xs text-muted-foreground gap-2">
              <span className="text-muted-foreground/60 text-lg"><Icon name="evidence" /></span>
              <strong className="text-foreground font-semibold">نخستین بررسی را ثبت کنید</strong>
              <p>تصمیم‌ها و یادداشت‌ها به‌ترتیب زمان در این بخش ظاهر می‌شوند.</p>
            </div>
          )}
          {nextCursor ? (
            <Button className="secondary-button w-full text-xs" disabled={busy !== null} onClick={() => { setBusy("more"); void onLoadMore().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "ادامه تاریخچه دریافت نشد.")).finally(() => setBusy(null)); }}>
              {busy === "more" ? "در حال دریافت…" : "نمایش ادامه تاریخچه"}
            </Button>
          ) : null}
        </section>
      </div>
    </ProductCard>
  );
}
