"use client";
import { useRef, useState } from "react";
import { useWorkspace } from "./workspace";
import { useCommand } from "./use-command";
import { usePagedResource } from "./use-paged-resource";
import { useResource } from "./use-resource";
import type { NativeForecastPlan } from "@/lib/native-forecast";
import type { ScenarioEvaluation } from "@/lib/cash-scenarios";
export function useNativeForecasts() {
  const workspace = useWorkspace();
  const command = useCommand();
  const generation = useRef(0);
  const base = workspace.companyPath("native-forecasts");
  const statements = usePagedResource<{
    id: string;
    snapshot: { as_of: string };
  }>(workspace.companyPath("accounting/statements"));
  const plans = usePagedResource<{ id: string; as_of: string; state: string }>(
    base ? base + "/plans" : null,
  );
  const [statementId, setStatementId] = useState("");
  const [complete, setComplete] = useState(false);
  const [plan, setPlan] = useState<NativeForecastPlan | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [date, setDate] = useState("");
  const [unknown, setUnknown] = useState(false);
  const [choice, setChoice] = useState("");
  const [actualId, setActualId] = useState("");
  const [eventPage, setEventPage] = useState(0);
  const question = plan?.questions[0];
  const run = plan?.forecast;
  const forecast = run
    ? {
        ...run.snapshot,
        ...run.projection,
        ...(run.snapshot.status === "limited"
          ? {
              closing: null,
              minimum: null,
              known_dated_closing:
                run.projection?.known_dated_closing ??
                run.snapshot.known_dated_closing ??
                run.snapshot.closing,
              known_dated_minimum:
                run.projection?.known_dated_minimum ??
                run.snapshot.known_dated_minimum ??
                run.snapshot.minimum,
            }
          : {}),
      }
    : null;
  const evaluation = useResource<ScenarioEvaluation>(
    base && run && actualId
      ? `${base}/runs/${run.id}/evaluation?actual_statement_id=${encodeURIComponent(actualId)}`
      : null,
  );
  const receive = (item: NativeForecastPlan) => {
    setPlan(item);
    setDialogOpen(item.state === "waiting_input");
    setDate("");
    setUnknown(false);
    setChoice("");
    setActualId("");
    setEventPage(0);
  };
  const load = (id: string) => {
    const stamp = ++generation.current;
    void command.run<NativeForecastPlan>(
      base ? `${base}/plans/${id}` : null,
      { method: "GET" },
      (item) => {
        if (stamp === generation.current) receive(item);
      },
    );
  };
  const create = () => {
    if (!workspace.canWrite || !statementId) return;
    const stamp = ++generation.current;
    void command.run<NativeForecastPlan>(
      base ? base + "/plans" : null,
      {
        body: {
          native_statement_id: statementId,
          obligations_complete: complete,
        },
      },
      (item) => {
        if (stamp === generation.current) {
          receive(item);
          plans.refresh();
        }
      },
      "برنامهٔ پیش‌بینی ذخیره شد.",
    );
  };
  const canAnswer =
    !!question &&
    workspace.canWrite &&
    (question.kind === "choice" ? !!choice : unknown || !!date);
  const answer = () => {
    if (!canAnswer || !plan || !question) return;
    const stamp = ++generation.current;
    void command.run<NativeForecastPlan>(
      base ? `${base}/plans/${plan.id}/answers` : null,
      {
        version: plan.version,
        body:
          question.kind === "choice"
            ? { question_id: question.id, choice }
            : {
                question_id: question.id,
                unknown,
                expected_date: unknown ? null : date,
              },
      },
      (item) => {
        if (stamp === generation.current) {
          receive(item);
          plans.refresh();
        }
      },
    );
  };
  const events = run?.snapshot.events || [];
  return {
    workspace,
    command,
    statements,
    plans,
    statementId,
    setStatementId,
    complete,
    setComplete,
    plan,
    run,
    forecast,
    question,
    dialogOpen,
    setDialogOpen,
    date,
    setDate,
    unknown,
    setUnknown,
    choice,
    setChoice,
    canAnswer,
    answer,
    create,
    load,
    actualId,
    setActualId,
    evaluation,
    events: events.slice(eventPage * 15, (eventPage + 1) * 15),
    eventPage,
    eventTotal: events.length,
    previousEvents: () => setEventPage(Math.max(0, eventPage - 1)),
    nextEvents: () => setEventPage(eventPage + 1),
    exportHref: run
      ? `/api/v1${workspace.companyPath(`native-forecasts/runs/${run.id}/export?format=pdf`)}`
      : null,
    sourceHref: run
      ? `/api/v1${workspace.companyPath(`accounting/statements/${run.native_statement_id}/export?format=pdf`)}`
      : null,
  };
}
