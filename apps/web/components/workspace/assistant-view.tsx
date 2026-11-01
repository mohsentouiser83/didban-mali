"use client";
import { ChatCircleDotsIcon as HeaderIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Textarea } from "@/components/ui/input";
import { useCommand } from "@/hooks/use-command";
import { useFinancialView } from "@/hooks/use-financial-view";
import { amount, displayDate } from "@/lib/utils";
import { ChatCircleDotsIcon } from "@phosphor-icons/react";
import type { Metric } from "@/lib/api";
import { Drawer } from "@/components/ui/drawer";
import { EvidenceList } from "./evidence-list";
import { useState } from "react";
import { NoCompany, NoResult, PageHeader, Panel } from "./page-parts";

export function AssistantView() {
  const view = useFinancialView();
  const command = useCommand();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{
    explanation?: string;
    answer?: string;
    facts?: Metric[];
    evidence_refs?: string[];
    as_of_date?: string;
    [key: string]: unknown;
  }>();
  const [evidence, setEvidence] = useState<{
    title: string;
    refs: string[];
  } | null>(null);
  if (!view.workspace.company) return <NoCompany />;
  return (
    <>
      <PageHeader icon={HeaderIcon}
        title="دستیار مالی"
      />
      {view.loading ? (
        <LoadingState />
      ) : view.error ? (
        <ErrorState message={view.error.message} onRetry={view.refresh} />
      ) : !view.manifest ? (
        <NoResult />
      ) : (
        <Panel title="پرسش درباره این نسخه">
          <Form
            fieldErrors={command.error?.fields}
            onSubmit={(event) => {
              event.preventDefault();
              void command.run(
                view.workspace.companyPath("assistant/questions"),
                {
                  body: {
                    manifest_id: view.manifest!.id,
                    question: question.trim(),
                  },
                },
                setAnswer,
              );
            }}
          >
            <Field
              id="assistant-question"
              label="پرسش شما"
              icon={ChatCircleDotsIcon}
            >
              <Textarea
                id="assistant-question"
                required
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
              />
            </Field>
            <FormMessage error>{command.error?.message}</FormMessage>
            <Button type="submit" busy={command.busy}>
              نمایش اطلاعات این نسخه
            </Button>
          </Form>
          {answer && (
            <div className="mt-6 space-y-4 border-t border-border pt-5">
              <p className="whitespace-pre-wrap leading-8">
                {answer.explanation ||
                  answer.answer ||
                  "اطلاعات ثبت‌شده این نسخه"}
              </p>
              {answer.as_of_date && (
                <p className="text-xs text-muted">
                  تا {displayDate(answer.as_of_date)}
                </p>
              )}
              {Array.isArray(answer.facts) &&
                answer.facts.map((fact, index) => (
                  <div
                    key={index}
                    className="flex flex-wrap items-start justify-between gap-4 border-b border-border py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p>
                        {fact.label ||
                          view.metrics[fact.metric_key]?.label ||
                          "شاخص"}
                      </p>
                      {fact.value == null && (
                        <p className="mt-1 text-sm text-warning">
                          {fact.reason ||
                            fact.action ||
                            "منبع کافی برای این شاخص موجود نیست."}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className="tabular-nums">
                        {amount(fact.value, view.workspace.unit)}{" "}
                        {view.workspace.unit === "IRR" ? "ریال" : "تومان"}
                      </span>
                      {!!fact.evidence_refs?.length && (
                        <Button
                          variant="ghost"
                          onClick={() =>
                            setEvidence({
                              title: fact.label || "شواهد شاخص",
                              refs: fact.evidence_refs || [],
                            })
                          }
                        >
                          شواهد
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </Panel>
      )}
      <Drawer
        title={evidence?.title || "شواهد پاسخ"}
        open={!!evidence}
        onOpenChange={(open) => {
          if (!open) setEvidence(null);
        }}
      >
        {evidence && <EvidenceList evidence={evidence.refs} />}
      </Drawer>
    </>
  );
}
