import { test } from "node:test";
import assert from "node:assert/strict";
import type { Schema } from "@didban/api-client";
import {
  processingProgress,
  processingFileState,
} from "../apps/web/features/intake/processing-progress";

const session = (changes: Partial<Schema<"ProcessingSession">> = {}) =>
  ({
    status: "processing",
    purpose: "upload",
    preparation_finished_at: "2026-10-26T12:00:00Z",
    interpretation_finished_at: null,
    financial_finished_at: null,
    analysis_finished_at: null,
    report_id: null,
    steps: [],
    ...changes,
  }) as Schema<"ProcessingSession">;
const step = (file: string, status: Schema<"Step">["status"]) =>
  ({
    id: file,
    kind: `interpret:${file}`,
    status,
    completed_items: status === "succeeded" ? 1 : 0,
    total_items: 1,
    dependency_code: null,
  }) as Schema<"Step">;
const files = ["first", "second", "third"].map((id) => ({
  id,
  original_name: `${id}.xlsx`,
  status: "ready",
  interpretation_summary: null,
  preparation_summary: { nonempty_rows: 4 },
})) as Schema<"File">[];

test("file counts use committed interpretation, not receiving/preparation or partial model work", () => {
  const stages = processingProgress(
    session({
      steps: [
        step("first", "succeeded"),
        step("second", "running"),
        step("third", "pending"),
      ],
    }),
    files,
  );
  assert.deepEqual(
    stages.map((s) => s.state),
    ["done", "done", "active", "pending", "pending", "pending"],
  );
  assert.deepEqual(stages[2].items, { completed: 1, total: 3, unit: "فایل" });
  assert.match(stages[2].detail!, /second.xlsx/);
  assert.equal(stages.filter((s) => s.state === "done").length, 2);
});
test("all files interpreted still waits at the question barrier until milestone commits", () => {
  const current = session({
    status: "waiting_input",
    steps: files.map((f) => step(f.id, "succeeded")),
  });
  const stages = processingProgress(current, files);
  assert.equal(stages[2].items?.completed, 3);
  assert.equal(stages[2].state, "question");
  assert.equal(stages[3].state, "pending");
  assert.equal(
    processingFileState(files[1], {
      ...current,
      steps: [step("second", "running")],
    }).busy,
    false,
  );
});
test("waiting and cancelled states do not imply active work or future completion", () => {
  const blocked = session({
    status: "waiting_dependency",
    steps: [
      {
        ...step("second", "waiting_dependency"),
        dependency_code: "budget_exhausted",
      },
    ],
  });
  assert.match(processingProgress(blocked, files)[2].detail!, /سقف هزینه/);
  assert.equal(processingProgress(blocked, files)[2].state, "waiting");
  const cancelled = session({
    status: "cancelled",
    steps: [step("second", "running")],
  });
  assert.equal(processingProgress(cancelled, files)[2].state, "cancelled");
  assert.equal(processingProgress(cancelled, files)[3].state, "pending");
  assert.equal(processingFileState(files[1], cancelled).busy, false);
});
test("report creation and ready outputs do not announce session completion before server does", () => {
  const current = session({
    analysis_finished_at: "2026-10-26T12:01:00Z",
    report_id: "report",
  });
  const jobs = ["ready", "ready", "failed"].map((status) => ({
    status,
  })) as Schema<"ExportJob">[];
  const stages = processingProgress(current, files, jobs);
  assert.equal(stages[5].state, "failed");
  assert.equal(stages[5].items?.completed, 2);
  assert.equal(stages.filter((s) => s.state === "done").length, 5);
  const ready = jobs.map((job) => ({ ...job, status: "ready" as const }));
  assert.equal(processingProgress(current, files, ready)[5].state, "active");
  const final = processingProgress(
    { ...current, status: "completed_limited" },
    files,
    ready,
  );
  assert.equal(
    final.every((s) => s.state === "done"),
    true,
  );
  assert.match(final[5].detail!, /دامنه محدود/);
});
test("empty receiving batch has no invented denominator or completed stage", () => {
  const stages = processingProgress(
    session({ status: "receiving", preparation_finished_at: null }),
    [],
  );
  assert.equal(stages.filter((s) => s.state === "done").length, 0);
  assert.equal(stages[0].state, "active");
  assert.equal(stages[1].items, undefined);
});

test("new upload sessions show human review before financial work, never a service wait", () => {
  const stages = processingProgress(
    session({
      status: "waiting_dependency",
      input_review_required: true,
      input_review_confirmed: false,
      interpretation_finished_at: "2026-10-29T12:00:00Z",
    }),
    files,
  );
  assert.equal(stages.length, 7);
  assert.equal(stages[3].id, "review");
  assert.equal(stages[3].state, "review");
  assert.match(stages[3].detail!, /بازبینی شما/);
  assert.equal(stages[4].id, "financial");
  assert.equal(stages[4].state, "pending");
  assert.equal(
    stages.some((s) => s.state === "active" || s.state === "waiting"),
    false,
  );
  const confirmed = processingProgress(
    session({
      status: "sealed",
      input_review_required: true,
      input_review_confirmed: true,
      interpretation_finished_at: "2026-10-29T12:00:00Z",
    }),
    files,
  );
  assert.equal(confirmed[3].state, "done");
  assert.equal(confirmed[4].state, "queued");
});
