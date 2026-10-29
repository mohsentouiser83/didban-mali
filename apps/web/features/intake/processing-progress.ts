import type { Schema } from "@didban/api-client";
import { count, dependencies } from "./presentation";
import type { ProcessingStage } from "@/components/ui/processing-progress";

type Session = Schema<"ProcessingSession">;
type File = Schema<"File">;
const successful = (status: string) =>
  ["succeeded", "limited"].includes(status);

/** Milestones are server facts, not equally weighted estimates of remaining time. */
export function processingProgress(
  session: Session,
  files: File[],
  exports?: Schema<"ExportJob">[],
): ProcessingStage[] {
  const terminal = ["completed", "completed_limited"].includes(session.status);
  const started = (prefix: string) =>
    session.steps.some((step) => step.kind.startsWith(prefix));
  const done = [
    !!session.preparation_finished_at ||
      started("prepare:") ||
      session.status === "sealed",
    !!session.preparation_finished_at,
    !!session.interpretation_finished_at,
    !!session.financial_finished_at,
    !!session.analysis_finished_at,
    terminal,
  ];
  const reviewRequired =
    session.purpose !== "forecast" && session.input_review_required;
  if (reviewRequired) done.splice(3, 0, !!session.input_review_confirmed);
  // A later durable milestone also proves that earlier pipeline gates passed.
  for (let i = done.length - 1; i > 0; i--) if (done[i]) done[i - 1] = true;
  let current = done.findIndex((value) => !value);
  if (current < 0) current = done.length - 1;
  const definitions = [
    { id: "receiving", label: "دریافت فایل‌ها", prefix: "" },
    { id: "preparation", label: "بررسی فایل‌ها", prefix: "prepare:" },
    { id: "interpretation", label: "تفسیر اطلاعات", prefix: "interpret:" },
    { id: "financial", label: "محاسبات مالی", prefix: "financial:" },
    {
      id: "analysis",
      label:
        session.purpose === "forecast"
          ? "بازبینی پیش‌بینی"
          : "تحلیل حوزه‌های مالی",
      prefix: "analysis:",
    },
    { id: "reports", label: "تولید گزارش و خروجی‌ها", prefix: "" },
  ];
  if (reviewRequired)
    definitions.splice(3, 0, {
      id: "review",
      label: "بازبینی و تأیید اطلاعات",
      prefix: "",
    });
  const stages = definitions.map(
    ({ id, label, prefix }, index): ProcessingStage => {
      const steps = prefix
        ? session.steps.filter((s) => s.kind.startsWith(prefix))
        : [];
      let state: ProcessingStage["state"] = done[index]
        ? "done"
        : index === current
          ? "active"
          : "pending";
      if (index === current && !terminal) {
        if (session.status === "waiting_input") state = "question";
        else if (id === "review" && session.status === "waiting_dependency")
          state = "review";
        else if (session.status === "waiting_dependency") state = "waiting";
        else if (session.status === "failed") state = "failed";
        else if (session.status === "cancelled") state = "cancelled";
        else if (session.status === "sealed") state = "queued";
      }
      let detail: string | undefined;
      let items: ProcessingStage["items"];
      if (index === 1 || index === 2) {
        const completed = files.filter((file) =>
          index === 1
            ? !!file.preparation_summary && file.status !== "rejected"
            : successful(
                steps.find((step) => step.kind === `interpret:${file.id}`)
                  ?.status ?? "",
              ) || !!file.interpretation_summary,
        ).length;
        if (files.length)
          items = { completed, total: files.length, unit: "فایل" };
        if (index === current && state === "active") {
          const names = files
            .filter((file) =>
              steps.some(
                (step) =>
                  step.kind === `${prefix}${file.id}` &&
                  step.status === "running",
              ),
            )
            .map((file) => file.original_name);
          if (names.length) detail = `در حال بررسی: ${names.join("، ")}`;
          else detail = "در انتظار اجرای مرحله";
        }
      }
      if (index === 0 && files.length)
        detail = `${count(files.length)} فایل دریافت شد`;
      if (id === "reports" && exports?.length) {
        items = {
          completed: exports.filter((job) => job.status === "ready").length,
          total: exports.length,
          unit: "خروجی",
        };
        const failed = exports.filter((job) => job.status === "failed");
        if (failed.length && !terminal) {
          state = "failed";
          detail =
            "تولید بعضی خروجی‌ها ناموفق بود؛ از گزارش و خروجی‌ها دوباره تلاش کنید.";
        }
      }
      if (id === "review" && state === "review")
        detail = "اطلاعات استخراج‌شده منتظر بازبینی شماست.";
      if (index === current && state === "question")
        detail = "ادامه بسته منتظر پاسخ شماست.";
      if (index === current && state === "waiting") {
        const code = steps.find(
          (step) => step.status === "waiting_dependency",
        )?.dependency_code;
        detail = code
          ? (dependencies[code] ?? "مرحله منتظر سرویس است.")
          : "مرحله منتظر سرویس یا ادامه پردازش است.";
      }
      if (id === "reports" && session.status === "completed_limited")
        detail = "گزارش با دامنه محدود آماده است.";
      return { id, label, state, detail, items };
    },
  );
  return session.purpose === "forecast" ? stages.slice(4) : stages;
}

export function processingFileState(file: File, session: Session) {
  const step = session.steps.find((s) => s.kind === `interpret:${file.id}`);
  if (file.status === "excluded_overlap")
    return { status: "خارج از مجموعه مالی", busy: false, prepared: false };
  if (file.status === "rejected" || step?.status === "failed")
    return { status: "نیازمند بررسی", busy: false, prepared: false };
  if (file.interpretation_summary)
    return {
      status: file.interpretation_summary.rejected_rows
        ? "تفسیر شد؛ دارای ردیف ردشده"
        : "تفسیر شد",
      busy: false,
      prepared: true,
    };
  const paused = [
    "waiting_input",
    "waiting_dependency",
    "failed",
    "cancelled",
  ].includes(session.status);
  if (step && !successful(step.status))
    return {
      status:
        session.status === "cancelled"
          ? "لغوشده"
          : session.status === "waiting_input"
            ? "تفسیر متوقف؛ منتظر پاسخ"
            : step.status === "running" && !paused
              ? "در حال تفسیر"
              : "در انتظار تفسیر",
      busy: step.status === "running" && !paused,
      prepared: false,
    };
  return {
    status: file.preparation_summary ? "ساختار بررسی شد" : "دریافت شد",
    busy: file.status === "scanning" && !paused,
    prepared: !!file.preparation_summary,
  };
}
