"use client";

import { AppIcon } from "@/components/ui/app-icon";
import { ForecastQuestion } from "@/features/cashflow/forecast-question";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import type { Schema } from "@didban/api-client";
import { usePeriods } from "@/features/periods/use-periods";
import { choiceLabels } from "@/features/interpretation/labels";
import { ErrorState } from "@/components/ui/states";
import { message } from "@/lib/api";
import { useIssues, useSessionCommands } from "./use-intake";
import { QuestionDialog } from "./session-view";
import {
  financialChoiceLabels,
  financialQuestionLabel,
  financialQuestionText,
} from "./presentation";

export function ProcessingQuestion({
  companyId,
  session,
  canOperate,
  requested = false,
  onClose,
  skipMapping = false,
  showTrigger = false,
}: {
  companyId: string;
  session: Schema<"ProcessingSession">;
  canOperate: boolean;
  requested?: boolean;
  onClose?: () => void;
  skipMapping?: boolean;
  showTrigger?: boolean;
}) {
  const issues = useIssues(
      companyId,
      session.id,
      session.status === "waiting_input",
    ),
    periods = usePeriods(companyId),
    commands = useSessionCommands(companyId, session.id);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const required = issues.data?.items.find(
    (i) =>
      i.status === "open" && session.open_required_issue_ids.includes(i.id),
  );
  if (session.status === "waiting_input" && issues.error)
    return (
      <ErrorState
        message={message(issues.error)}
        onRetry={() => {
          void issues.refetch();
        }}
      />
    );
  if (!required || (skipMapping && required.code === "interpretation_mapping"))
    return null;
  if (required.constraints.setting_key === "forecast")
    return (
      <ForecastQuestion
        key={required.id}
        companyId={companyId}
        session={session}
        issue={required}
        requested={requested}
        onClose={onClose}
        canOperate={canOperate}
        showTrigger={showTrigger}
      />
    );
  const field = required.constraints.setting_key;
  const financial = field === "financial";
  return (
    <>
      {showTrigger && dismissed === required.id && !requested ? (
        <Button variant="secondary" onClick={() => setDismissed(null)}>
          <AppIcon name="Eye" />
          مشاهده سؤال برای ادامه
        </Button>
      ) : null}
      <QuestionDialog
        key={required.id}
        issue={
          financial
            ? {
                ...required,
                question_fa: financialQuestionText(required.question_fa),
              }
            : required
        }
        label={
          financial
            ? financialQuestionLabel(required.constraints.financial_key ?? "")
            : required.code === "csv_encoding"
              ? "کدگذاری فایل"
              : field === "unit"
                ? "واحد مبلغ"
                : field === "period_id"
                  ? "دوره مالی"
                  : field === "coverage"
                    ? "پوشش دوره"
                    : field === "account_role"
                      ? "نقش حساب"
                      : "انتخاب پاسخ"
        }
        options={
          field === "period_id"
            ? (periods.data?.pages.flatMap((p) => p.items) ?? []).map((p) => ({
                value: p.id,
                label: p.name,
              }))
            : (required.constraints.choices ?? []).map((value) => ({
                value,
                label:
                  (financial ? financialChoiceLabels[value] : undefined) ??
                  choiceLabels[value] ??
                  value,
              }))
        }
        mappingHref={
          required.code === "interpretation_mapping"
            ? `/companies/${companyId}/uploads/${session.id}/files/${required.constraints.file_id}`
            : undefined
        }
        periodsHref={
          field === "period_id" ? `/companies/${companyId}/periods` : undefined
        }
        open={requested || dismissed !== required.id}
        onOpenChange={(open) => {
          if (!open) {
            setDismissed(required.id);
            onClose?.();
          }
        }}
        canAnswer={canOperate}
        busy={commands.answer.isPending}
        error={
          commands.answer.variables?.issue === required.id &&
          commands.answer.error
            ? message(commands.answer.error)
            : undefined
        }
        onSubmit={(e) => {
          e.preventDefault();
          commands.answer.mutate({
            issue: required.id,
            version: session.session_version,
            value: String(new FormData(e.currentTarget).get("value")),
          });
        }}
      />
    </>
  );
}
