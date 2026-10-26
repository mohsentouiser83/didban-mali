"use client";
import { DetailSection, DetailGroup, DetailField, fieldIcon, ControlLabel } from "@/components/ui/field-layout";
import { Form } from "@/components/ui/form";
import { ActionTooltip } from "@/components/ui/tooltip";
import { EmptyState, LoadingState, ErrorState, MoneyDisplay, toJalaliDate, toPersianDigits } from "@/components/ui/financial";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

import { Textarea } from "@/components/ui/textarea";
import { formatFinancialNumber } from "@/components/ui/financial/money-display";
import { Sparkles, X, ArrowUp, RefreshCcw, FileText } from "@/components/ui/icons";
import { api } from "@/lib/product-api";
import styles from "./financial-assistant.module.css";

export type AssistantAnswer = {
  request_id: string;
  conversation_id?: string | null;
  sources?: { title: string; path: string }[];
  facts?: { key: string; label: string; display: string }[];
  mode: "rules" | "model" | "fallback";
  status: "answered" | "no_data" | "unsupported";
  answer_fa: string;
  as_of_date: string;
  latest_invoice_date: string | null;
  latest_imported_at: string | null;
  total_outstanding_irr: string | null;
  total_overdue_irr: string | null;
  customer_count: number;
  caveats_fa: string[];
  priorities: {
    customer_id: string;
    customer_name: string;
    overdue_amount_irr: string;
    max_delay_days: number;
    overdue_invoice_count: number;
    omitted_evidence_count: number;
    evidence: {
      invoice_id: string;
      invoice_no: string;
      remaining_amount_irr: string;
      due_date: string | null;
      delay_days: number;
      import_batch_id: string | null;
      filename: string | null;
      sheet: string | null;
      row_number: number | null;
    }[];
  }[];
};

const suggestions = ["وضعیت نقدینگی شرکت چطور است؟", "چه بدهی‌هایی باید پیگیری کنیم؟", "کدام مطالبات را امروز پیگیری کنیم؟"];

function AssistantMoney({ amount }: { amount: string }) {
  return <MoneyDisplay amount={amount} currency="ریال" title={`${formatFinancialNumber(amount)} ریال`} size="sm" direction="neutral" />;
}

type ChatTurn = { id: number; question: string; answer?: AssistantAnswer; errorMessage?: string; status: "pending" | "answered" | "error" | "cancelled" };

type AssistantProps = { companyId: string; companyName: string; onOpenChange?: (open: boolean) => void; request?: typeof api };

export function FinancialAssistant(props: AssistantProps) {
  return <AssistantPanel key={props.companyId} {...props} />;
}

function AssistantPanel({ companyId, companyName, onOpenChange, request = api }: AssistantProps) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const conversationId = useRef<string | null>(null);
  const nextTurn = useRef(0);
  const transcript = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) input.current?.focus({ preventScroll: true });
    else if (wasOpen.current) launcher.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);
  const pending = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  useEffect(() => () => { requestVersion.current += 1; pending.current?.abort(); }, []);

  useEffect(() => {
    if (open && transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [open, turns]);

  async function ask(value: string, retryId?: number) {
    const text = value.trim();
    if (pending.current || text.length < 1) return;
    const controller = new AbortController();
    pending.current = controller;
    const version = ++requestVersion.current;
    const id = retryId ?? ++nextTurn.current;
    setBusy(true);
    setQuestion("");
    setTurns((previous) => retryId === undefined
      ? [...previous, { id, question: text, status: "pending" }]
      : previous.map((turn) => turn.id === id ? { ...turn, status: "pending" } : turn));
    try {
      const result = await request<AssistantAnswer>(`/companies/${companyId}/assistant/ask`, {
        method: "POST", body: JSON.stringify({ question: text, ...(conversationId.current ? { conversation_id: conversationId.current } : {}) }), signal: controller.signal,
      });
      if (!controller.signal.aborted && version === requestVersion.current) {
        conversationId.current = result.conversation_id ?? null;
        setTurns((previous) => previous.map((turn) => turn.id === id ? { ...turn, answer: result, status: "answered" } : turn));
      }
    } catch (error) {
      const errorMessage = error instanceof Error && (error.message.includes("این گفتگو پایان یافته") || error.message.includes("سهمیه مدل موقتاً پر شده")) ? error.message : undefined;
      if (!controller.signal.aborted && version === requestVersion.current) setTurns((previous) => previous.map((turn) => turn.id === id ? { ...turn, status: "error", errorMessage } : turn));
    } finally {
      if (version === requestVersion.current) { pending.current = null; setBusy(false); input.current?.focus({ preventScroll: true }); }
    }
  }

  function changeOpen(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
    if (!next) { requestVersion.current += 1; pending.current?.abort(); pending.current = null; setBusy(false); setTurns((previous) => previous.map((turn) => turn.status === "pending" ? { ...turn, status: "cancelled" } : turn)); }
  }

  return <>
    <ActionTooltip content="دستیار مالی"><Button ref={launcher} className={styles.launcher} aria-label="دستیار مالی" aria-expanded={open} aria-controls={`financial-assistant-${companyId}`} onClick={() => changeOpen(!open)} hidden={open}><Sparkles size={24} aria-hidden="true" /></Button></ActionTooltip>
    <aside data-state={open ? "open" : "closed"} inert={!open} aria-hidden={!open} id={`financial-assistant-${companyId}`} className={styles.panel} aria-labelledby={`assistant-title-${companyId}`} dir="rtl" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); changeOpen(false); } }}>
      <header className={styles.header}>
        <div><h2 id={`assistant-title-${companyId}`}>دستیار مالی</h2><p className={styles.caption}>{companyName}</p></div>
        <div className={styles.headerActions}><ActionTooltip content="گفتگوی جدید"><Button variant="ghost" size="icon" aria-label="گفتگوی جدید" onClick={() => { requestVersion.current += 1; pending.current?.abort(); pending.current = null; conversationId.current = null; setBusy(false); setTurns([]); setQuestion(""); input.current?.focus({ preventScroll: true }); }}><RefreshCcw size={18} aria-hidden="true" /></Button></ActionTooltip>
        <Button variant="ghost" size="icon" aria-label="بستن دستیار مالی" onClick={() => changeOpen(false)}><X size={20} aria-hidden="true" /></Button></div>
      </header>
      <div ref={transcript} className={styles.body} role="log" aria-label="گفتگو با دستیار مالی" aria-live="polite" aria-relevant="additions text">
        {turns.length === 0 && <div className={styles.welcome}>
          <span className={styles.welcomeIcon}><Sparkles size={28} aria-hidden="true" /></span>
          <h3>از کجا شروع کنیم؟</h3>
          <div className={styles.suggestions} role="group" aria-label="پرسش‌های پیشنهادی">{suggestions.map((text) => <Button key={text} variant="outline" onClick={() => void ask(text)}>{text}</Button>)}</div>
        </div>}
        {turns.map((turn) => {
          const answer = turn.answer;
          return <div className={styles.turn} key={turn.id}>
            <div className={styles.userMessage}><span className={styles.messageLabel}>شما</span><p className={styles.question}>{turn.question}</p></div>
            <div className={styles.assistantMessage}>
              <span className={styles.messageLabel}><Sparkles size={14} aria-hidden="true" />دستیار مالی</span>
              {turn.status === "pending" && <LoadingState  variant="inline" aria-label="در حال بررسی پرسش">در حال بررسی پرسش…</LoadingState>}
              {(turn.status === "error" || turn.status === "cancelled") && <ErrorState onRetry={() => void ask(turn.question, turn.id)} retrying={busy} variant="compact" ><p>{turn.status === "error" ? (turn.errorMessage ?? "پاسخ دریافت نشد. دوباره تلاش کنید.") : "بررسی این پیام متوقف شد."}</p></ErrorState>}
        {answer && <div className={styles.answer} aria-label="پاسخ دستیار">
          <p>{answer.answer_fa}</p>
          <section className="grid gap-5 border-t border-border pt-5"><h3 className="text-sm font-medium">جزئیات و منابع پاسخ</h3>
          <div className="grid min-w-0 gap-5">
          {answer.facts && <DetailGroup>{answer.facts.map((fact) => <DetailField key={fact.key} icon={fieldIcon(fact.label)} label={<>{fact.label}</>}>{fact.display}</DetailField>)}</DetailGroup>}
          {answer.sources && <div className={styles.sources}>{answer.sources.map((source) => <Link key={source.path} className={styles.sourceLink} href={`/companies/${companyId}/${source.path}`}>{source.title}</Link>)}</div>}
          <DetailGroup>
            <DetailField icon={fieldIcon("تاریخ مبنا")} label="تاریخ مبنا">{toJalaliDate(answer.as_of_date)}</DetailField>
            {answer.latest_imported_at && <DetailField icon={fieldIcon("آخرین دریافت فایل منبع")} label="آخرین دریافت فایل منبع">{toJalaliDate(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(answer.latest_imported_at)))}</DetailField>}
            {answer.latest_invoice_date && <DetailField icon={fieldIcon("جدیدترین تاریخ فاکتور")} label="جدیدترین تاریخ فاکتور">{toJalaliDate(answer.latest_invoice_date)}</DetailField>}
            {answer.total_outstanding_irr !== null && <DetailField icon={fieldIcon("کل مطالبات")} label="کل مطالبات"><AssistantMoney amount={answer.total_outstanding_irr} /></DetailField>}
            {answer.total_overdue_irr !== null && <DetailField icon={fieldIcon("مطالبات سررسیدگذشته")} label="مطالبات سررسیدگذشته"><AssistantMoney amount={answer.total_overdue_irr} /></DetailField>}
          </DetailGroup>
          {answer.priorities.map((customer, index) => <DetailSection title={`${toPersianDigits(index + 1)}. ${customer.customer_name}`} key={customer.customer_id}>
            <DetailGroup><DetailField icon={fieldIcon("مبلغ سررسیدگذشته")} label="مبلغ سررسیدگذشته"><AssistantMoney amount={customer.overdue_amount_irr} /></DetailField><DetailField icon={fieldIcon("بیشترین تأخیر")} label="بیشترین تأخیر">{toPersianDigits(customer.max_delay_days)} روز</DetailField></DetailGroup>
            <section className="grid min-w-0 gap-4"><h4 className="text-sm font-medium">فاکتورها و شواهد</h4>
              {customer.evidence.map((item) => <DetailSection key={item.invoice_id}><DetailGroup>
                <DetailField icon={fieldIcon("شماره فاکتور")} label="شماره فاکتور">{toPersianDigits(item.invoice_no)}</DetailField>
                <DetailField icon={fieldIcon("مانده فاکتور")} label="مانده فاکتور"><AssistantMoney amount={item.remaining_amount_irr} /></DetailField>
                <DetailField icon={fieldIcon("سررسید")} label="سررسید">{item.due_date ? toJalaliDate(item.due_date) : "نامشخص"}</DetailField>
                <DetailField icon={fieldIcon("تأخیر")} label="تأخیر">{toPersianDigits(item.delay_days)} روز</DetailField>
                <DetailField icon={fieldIcon("فایل منبع")} label="فایل منبع">{item.filename ?? "در دسترس نیست"}</DetailField>
                <DetailField icon={fieldIcon("شیت")} label="شیت">{item.sheet ?? "—"}</DetailField>
                <DetailField icon={fieldIcon("ردیف منبع")} label="ردیف منبع">{item.row_number == null ? "—" : toPersianDigits(item.row_number)}</DetailField>
              </DetailGroup>{item.import_batch_id && <Button variant="outline" size="sm" asChild><Link href={`/companies/${companyId}/imports/${item.import_batch_id}`} onClick={() => changeOpen(false)}><FileText size={16} aria-hidden="true" />مشاهده فایل منبع</Link></Button>}</DetailSection>)}
              {customer.omitted_evidence_count > 0 && <p className={styles.caption}>{toPersianDigits(customer.omitted_evidence_count)} فاکتور دیگر در مبلغ این مشتری لحاظ شده است.</p>}
            </section>
          </DetailSection>)}
          {answer.caveats_fa.length > 0 && <div className={styles.notice}><strong>ملاحظات پاسخ</strong><ul>{answer.caveats_fa.map((text) => <li key={text}>{text}</li>)}</ul></div>}
          </div></section>
          {answer.status === "no_data" && <Button variant="outline" asChild><Link href={`/companies/${companyId}/imports`} onClick={() => changeOpen(false)}>افزودن فایل فروش</Link></Button>}
        </div>}
            </div>
          </div>;
        })}
      </div>
      <Form className="shrink-0 space-y-2 border-t border-border bg-background px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3.5" onSubmit={(event) => { event.preventDefault(); void ask(question); }}>
        <ControlLabel htmlFor={`assistant-question-${companyId}`} icon={fieldIcon("پرسش شما")}>پرسش شما</ControlLabel>
        <div className={styles.composer}>
          <Textarea ref={input} id={`assistant-question-${companyId}`} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(question); }
          }} minLength={1} maxLength={1200} rows={2} placeholder="پیامتان را بنویسید…" disabled={busy} />
          <Button type="submit" size="icon" aria-label={busy ? "در حال بررسی…" : "ارسال پیام"} disabled={busy || question.trim().length < 1}><ArrowUp size={20} aria-hidden="true" /></Button>
        </div>
        <p className={styles.composerHint}>Enter برای ارسال · Shift + Enter برای خط جدید</p>
      </Form>
    </aside>
  </>;
}
