import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Field, Textarea, FormMessage } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/states";
export type QuestionModel = {
  id: string;
  question: string;
  answer: string | null;
  status: string;
  tone: "success" | "warning" | "neutral";
  time: string;
  manifestPath: string;
  relatedPath: string | null;
  canRetry: boolean;
  hasEvidence: boolean;
};
export function AssistantView({
  company,
  configured,
  manifests,
  manifest,
  question,
  questions,
  busy,
  error,
  more,
  busyMore,
  onManifest,
  onQuestion,
  onAsk,
  onRetry,
  onEvidence,
  onMore,
  onMoreManifests,
  moreManifests,
}: {
  company: string;
  configured: boolean;
  manifests: { value: string; label: string }[];
  manifest: string;
  question: string;
  questions: QuestionModel[];
  busy: boolean;
  error: string | null;
  more: boolean;
  busyMore: boolean;
  onManifest: (value: string) => void;
  onQuestion: (value: string) => void;
  onAsk: () => void;
  onRetry: (id: string) => void;
  onEvidence: (id: string) => void;
  onMore: () => void;
  onMoreManifests: () => void;
  moreManifests: boolean;
}) {
  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-[26px] font-medium">دستیار مالی</h1>
        <Badge>فقط‌خواندنی</Badge>
      </header>
      {!manifests.length ? (
        <EmptyState
          title="نتیجه‌ای آماده نیست"
          action={
            <Link
              className="text-primary"
              href={`/companies/${company}/uploads`}
            >
              بارگذاری فایل
            </Link>
          }
        />
      ) : (
        <section className="rounded-summary border border-border bg-surface p-5 sm:p-7">
          <Form
            onSubmit={(e) => {
              e.preventDefault();
              onAsk();
            }}
            className="space-y-5"
          >
            <Field id="assistant-manifest" label="نسخه نتایج">
              <Select
                id="assistant-manifest"
                value={manifest}
                onValueChange={onManifest}
                options={manifests}
                label="نسخه نتایج"
                validate={(value) =>
                  value ? null : "نسخه مبنا را انتخاب کنید."
                }
              />
            </Field>
            {moreManifests ? (
              <Button type="button" variant="ghost" onClick={onMoreManifests}>
                نسخه‌های بیشتر
              </Button>
            ) : null}
            <Field id="assistant-question" label="پرسش">
              <Textarea
                id="assistant-question"
                required
                maxLength={4000}
                value={question}
                onChange={(e) => onQuestion(e.target.value)}
                disabled={busy}
              />
            </Field>
            {!configured ? (
              <FormMessage>مدل تنظیم نشده؛ پرسش در انتظار می‌ماند.</FormMessage>
            ) : null}
            <FormMessage>{error}</FormMessage>
            <Button disabled={busy || !manifest} type="submit">
              {busy ? "در حال ثبت پرسش…" : "ارسال پرسش"}
            </Button>
          </Form>
        </section>
      )}
      <div className="space-y-5">
        {questions.map((q) => (
          <article
            key={q.id}
            className="space-y-4 rounded-panel border border-border bg-surface p-5 motion-safe:animate-reveal sm:p-7"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge tone={q.tone}>{q.status}</Badge>
              <span className="text-xs text-muted">{q.time}</span>
            </div>
            <h2 className="text-sm font-medium leading-7">{q.question}</h2>
            {q.answer ? (
              <p className="whitespace-pre-line leading-8">{q.answer}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <Link
                className="min-h-11 content-center text-xs text-primary focus-visible:outline-2 focus-visible:outline-primary"
                href={q.manifestPath}
              >
                نسخه مبنا
              </Link>
              {q.relatedPath ? (
                <Link
                  className="min-h-11 content-center text-xs text-primary focus-visible:outline-2 focus-visible:outline-primary"
                  href={q.relatedPath}
                >
                  بخش مرتبط
                </Link>
              ) : null}
              {q.hasEvidence ? (
                <Button variant="secondary" onClick={() => onEvidence(q.id)}>
                  شواهد پاسخ
                </Button>
              ) : null}
              {q.canRetry ? (
                <Button
                  variant="secondary"
                  onClick={() => onRetry(q.id)}
                  disabled={busy}
                >
                  تلاش دوباره
                </Button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {more ? (
        <Button onClick={onMore} disabled={busyMore}>
          پرسش‌های بیشتر
        </Button>
      ) : null}
    </div>
  );
}
