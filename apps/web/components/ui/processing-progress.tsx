import {
  Check,
  Circle,
  Clock3,
  CircleHelp,
  Pause,
  XCircle,
} from "lucide-react";
import { cx } from "./button";
import { Spinner } from "./states";

export type ProcessingStage = {
  id: string;
  label: string;
  state:
    | "done"
    | "active"
    | "queued"
    | "waiting"
    | "review"
    | "question"
    | "failed"
    | "cancelled"
    | "pending";
  detail?: string;
  items?: { completed: number; total: number; unit: string };
};
const labels: Record<ProcessingStage["state"], string> = {
  done: "انجام شد",
  active: "در حال انجام",
  queued: "در صف",
  waiting: "در انتظار سرویس",
  question: "نیازمند پاسخ",
  review: "در انتظار تأیید شما",
  failed: "ناموفق",
  cancelled: "لغوشده",
  pending: "در انتظار",
};
const number = (value: number) => new Intl.NumberFormat("fa-IR").format(value);

export function ProcessingProgress({ stages }: { stages: ProcessingStage[] }) {
  const completed = stages.filter((stage) => stage.state === "done").length;
  return (
    <section
      aria-label="پیشرفت پردازش"
      className="rounded-panel border border-border bg-surface p-5 shadow-panel sm:p-7"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">پیشرفت پردازش</h2>
        <p className="text-xs tabular-nums text-muted">
          {number(completed)} از {number(stages.length)} مرحله انجام شد
        </p>
      </div>
      <ol role="list" className="space-y-2">
        {stages.map((stage, index) => {
          const current = !["done", "pending"].includes(stage.state);
          const warning = ["waiting", "question", "review"].includes(
            stage.state,
          );
          const Icon =
            stage.state === "done"
              ? Check
              : ["question", "review"].includes(stage.state)
                ? CircleHelp
                : stage.state === "failed"
                  ? XCircle
                  : stage.state === "cancelled"
                    ? Pause
                    : stage.state === "queued" || stage.state === "waiting"
                      ? Clock3
                      : Circle;
          return (
            <li
              key={stage.id}
              aria-current={current ? "step" : undefined}
              className={cx(
                "rounded-control border p-3 transition-colors duration-200 motion-reduce:transition-none",
                current
                  ? "border-primary/15 bg-accent/40"
                  : "border-transparent",
                stage.state === "pending" && "text-muted",
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cx(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                    stage.state === "done"
                      ? "bg-success/10 text-success"
                      : stage.state === "failed"
                        ? "bg-danger/10 text-danger"
                        : warning
                          ? "bg-warning/10 text-warning"
                          : current
                            ? "bg-accent text-primary"
                            : "bg-background text-muted",
                  )}
                >
                  {stage.state === "active" ? (
                    <Spinner />
                  ) : (
                    <Icon size={17} aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <p className="font-medium">
                      <span className="sr-only">
                        مرحله {number(index + 1)}:{" "}
                      </span>
                      {stage.label}
                    </p>
                    <span
                      className={cx(
                        "text-xs",
                        stage.state === "failed"
                          ? "text-danger"
                          : warning
                            ? "text-warning"
                            : stage.state === "done"
                              ? "text-success"
                              : current
                                ? "text-primary"
                                : "text-muted",
                      )}
                    >
                      {labels[stage.state]}
                    </span>
                  </div>
                  {stage.items && stage.state !== "pending" ? (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs tabular-nums text-muted">
                        {number(stage.items.completed)} از{" "}
                        {number(stage.items.total)} {stage.items.unit} انجام شد
                      </p>
                      <div
                        role="progressbar"
                        aria-label={stage.label}
                        aria-valuemin={0}
                        aria-valuemax={stage.items.total}
                        aria-valuenow={stage.items.completed}
                        aria-valuetext={`${number(stage.items.completed)} از ${number(stage.items.total)} ${stage.items.unit} انجام شد`}
                        className="flex gap-1"
                        dir="rtl"
                      >
                        {Array.from(
                          { length: stage.items.total },
                          (_, item) => (
                            <span
                              key={item}
                              aria-hidden
                              className={cx(
                                "h-1.5 min-w-0 flex-1 rounded-full transition-colors duration-200 motion-reduce:transition-none",
                                item < stage.items!.completed
                                  ? "bg-primary"
                                  : "bg-border",
                              )}
                            />
                          ),
                        )}
                      </div>
                    </div>
                  ) : null}
                  {stage.detail ? (
                    <p className="mt-1 break-words text-xs text-muted">
                      {stage.detail}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <p role="status" aria-live="polite" className="sr-only">
        {stages
          .filter((stage) => !["done", "pending"].includes(stage.state))
          .map(
            (stage) =>
              `${stage.label}: ${labels[stage.state]}${stage.items ? `، ${number(stage.items.completed)} از ${number(stage.items.total)} ${stage.items.unit}` : ""}${stage.detail ? `، ${stage.detail}` : ""}`,
          )
          .join(". ") || "مراحل پردازش انجام شدند"}
      </p>
    </section>
  );
}
