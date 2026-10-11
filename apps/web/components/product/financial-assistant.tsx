"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DrawerDetails, DrawerSection } from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/textarea";
import { MoneyDisplay, toJalaliDate, toPersianDigits } from "@/components/ui/financial";
import { formatFinancialNumber } from "@/components/ui/financial/money-display";
import { Sparkles, X, ArrowUp, RefreshCcw } from "@/components/ui/icons";
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

type AssistantProps = { companyId: string; companyName: string; onOpenChange?: (open: boolean) => void };

export function FinancialAssistant(props: AssistantProps) {
  return <AssistantPanel key={props.companyId} {...props} />;
}

function AssistantPanel({ companyId, companyName, onOpenChange }: AssistantProps) {
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
      const result = await api<AssistantAnswer>(`/companies/${companyId}/assistant/ask`, {
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
    <Button ref={launcher} className={styles.launcher} aria-label="دستیار مالی" title="دستیار مالی" aria-expanded={open} aria-controls={`financial-assistant-${companyId}`} onClick={() => changeOpen(!open)} hidden={open}><Sparkles size={24} aria-hidden="true" /></Button>
    <aside data-state={open ? "open" : "closed"} inert={!open} aria-hidden={!open} id={`financial-assistant-${companyId}`} className={styles.panel} aria-labelledby={`assistant-title-${companyId}`} dir="rtl" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); changeOpen(false); } }}>
      <header className={styles.header}>
        <div><h2 id={`assistant-title-${companyId}`}>دستیار مالی</h2><p className={styles.caption}>{companyName}</p></div>
        <div className={styles.headerActions}><Button variant="ghost" size="icon" aria-label="گفتگوی جدید" title="گفتگوی جدید" onClick={() => { requestVersion.current += 1; pending.current?.abort(); pending.current = null; conversationId.current = null; setBusy(false); setTurns([]); setQuestion(""); input.current?.focus({ preventScroll: true }); }}><RefreshCcw size={18} aria-hidden="true" /></Button>
        <Button variant="ghost" size="icon" aria-label="بستن دستیار مالی" onClick={() => changeOpen(false)}><X size={20} aria-hidden="true" /></Button></div>
      </header>
      <div ref={transcript} className={styles.body} role="log" aria-label="گفتگو با دستیار مالی" aria-live="polite" aria-relevant="additions text">
        {turns.length === 0 && <div className={styles.welcome}>
          <span className={styles.welcomeIcon}><Sparkles size={28} aria-hidden="true" /></span>
          <h3>از کجا شروع کنیم؟</h3>
          <p>درباره نقدینگی، بدهی‌ها و مطالبات گفتگو کنیم.</p>
          <div className={styles.suggestions} role="group" aria-label="پرسش‌های پیشنهادی">{suggestions.map((text) => <Button key={text} variant="outline" onClick={() => void ask(text)}>{text}</Button>)}</div>
        </div>}
        {turns.map((turn) => {
          const answer = turn.answer;
          return <div className={styles.turn} key={turn.id}>
            <div className={styles.userMessage}><span className={styles.messageLabel}>شما</span><p className={styles.question}>{turn.question}</p></div>
            <div className={styles.assistantMessage}>
              <span className={styles.messageLabel}><Sparkles size={14} aria-hidden="true" />دستیار مالی</span>
              {turn.status === "pending" && <div className={styles.typing} role="status" aria-label="در حال بررسی پرسش"><span /><span /><span /><span className="sr-only">در حال بررسی…</span></div>}
              {(turn.status === "error" || turn.status === "cancelled") && <div role="alert" className={styles.error}><p>{turn.status === "error" ? (turn.errorMessage ?? "پاسخ دریافت نشد. دوباره تلاش کنید.") : "بررسی این پیام متوقف شد."}</p><Button variant="ghost" disabled={busy} onClick={() => void ask(turn.question, turn.id)}>تلاش دوباره</Button></div>}
        {answer && <div className={styles.answer} aria-label="پاسخ دستیار">
          <p>{answer.answer_fa}</p>
          <details className={styles.responseDetails}><summary>جزئیات و منابع پاسخ</summary>
          <div className={styles.responseDetailContent}>
          {answer.facts && <DrawerDetails>{answer.facts.map((fact) => <div key={fact.key}><dt>{fact.label}</dt><dd>{fact.display}</dd></div>)}</DrawerDetails>}
          {answer.sources && <div className={styles.sources}>{answer.sources.map((source) => <Link key={source.path} className={styles.sourceLink} href={`/companies/${companyId}/${source.path}`}>{source.title}</Link>)}</div>}
          <DrawerDetails>
            <div><dt>تاریخ مبنا</dt><dd>{toJalaliDate(answer.as_of_date)}</dd></div>
            {answer.latest_imported_at && <div><dt>آخرین دریافت فایل منبع</dt><dd>{toJalaliDate(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(answer.latest_imported_at)))}</dd></div>}
            {answer.latest_invoice_date && <div><dt>جدیدترین تاریخ فاکتور</dt><dd>{toJalaliDate(answer.latest_invoice_date)}</dd></div>}
            {answer.total_outstanding_irr !== null && <div><dt>کل مطالبات</dt><dd><AssistantMoney amount={answer.total_outstanding_irr} /></dd></div>}
            {answer.total_overdue_irr !== null && <div><dt>مطالبات سررسیدگذشته</dt><dd><AssistantMoney amount={answer.total_overdue_irr} /></dd></div>}
          </DrawerDetails>
          {answer.priorities.map((customer, index) => <DrawerSection title={`${toPersianDigits(index + 1)}. ${customer.customer_name}`} key={customer.customer_id}>
            <DrawerDetails><div><dt>مبلغ سررسیدگذشته</dt><dd><AssistantMoney amount={customer.overdue_amount_irr} /></dd></div><div><dt>بیشترین تأخیر</dt><dd>{toPersianDigits(customer.max_delay_days)} روز</dd></div></DrawerDetails>
            <details className={styles.evidence}><summary>مشاهده فاکتورها و شواهد</summary>
              {customer.evidence.map((item) => <div className={styles.invoice} key={item.invoice_id}>
                <strong>فاکتور <bdi>{toPersianDigits(item.invoice_no)}</bdi></strong>
                <AssistantMoney amount={item.remaining_amount_irr} />
                <p className={styles.caption}>سررسید: {item.due_date ? toJalaliDate(item.due_date) : "نامشخص"} · {toPersianDigits(item.delay_days)} روز تأخیر</p>
                {item.import_batch_id ? <Link className={styles.sourceLink} href={`/companies/${companyId}/imports/${item.import_batch_id}`} onClick={() => changeOpen(false)}><bdi>{item.filename}</bdi> · شیت <bdi>{item.sheet}</bdi> · ردیف {toPersianDigits(item.row_number ?? 0)}</Link> : <p className={styles.caption}>نشانی ردیف منبع در دسترس نیست.</p>}
              </div>)}
              {customer.omitted_evidence_count > 0 && <p className={styles.caption}>{toPersianDigits(customer.omitted_evidence_count)} فاکتور دیگر در مبلغ این مشتری لحاظ شده است.</p>}
            </details>
          </DrawerSection>)}
          {answer.caveats_fa.length > 0 && <div className={styles.notice}><strong>ملاحظات پاسخ</strong><ul>{answer.caveats_fa.map((text) => <li key={text}>{text}</li>)}</ul></div>}
          </div></details>
          {answer.status === "no_data" && <Button variant="outline" asChild><Link href={`/companies/${companyId}/imports`} onClick={() => changeOpen(false)}>افزودن فایل فروش</Link></Button>}
        </div>}
            </div>
          </div>;
        })}
      </div>
      <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void ask(question); }}>
        <label className="sr-only" htmlFor={`assistant-question-${companyId}`}>پرسش شما</label>
        <div className={styles.composer}>
          <Textarea ref={input} id={`assistant-question-${companyId}`} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(question); }
          }} minLength={1} maxLength={1200} rows={2} placeholder="پیامتان را بنویسید…" disabled={busy} />
          <Button type="submit" size="icon" aria-label={busy ? "در حال بررسی…" : "ارسال پیام"} disabled={busy || question.trim().length < 1}><ArrowUp size={20} aria-hidden="true" /></Button>
        </div>
        <p className={styles.composerHint}>Enter برای ارسال · Shift + Enter برای خط جدید</p>
      </form>
    </aside>
  </>;
}
