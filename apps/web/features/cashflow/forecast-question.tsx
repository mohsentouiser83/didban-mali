"use client";

import { AppIcon } from "@/components/ui/app-icon";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Schema } from "@didban/api-client";
import { Dialog } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { api, message } from "@/lib/api";
import { useCommand } from "@/lib/use-command";
import { persianDigits } from "@/lib/dates";
import { financialQuestionText } from "@/features/intake/presentation";

export function ForecastQuestion({
  companyId,
  session,
  issue,
  requested = false,
  onClose,
  canOperate,
  showTrigger = true,
}: {
  companyId: string;
  session: Schema<"ProcessingSession">;
  issue: Schema<"ProcessingIssue">;
  requested?: boolean;
  onClose?: () => void;
  canOperate: boolean;
  showTrigger?: boolean;
}) {
  const [dismissed, setDismissed] = useState<string | null>(null),
    [choice, setChoice] = useState("");
  const cache = useQueryClient();
  const answer = useCommand<
    Schema<"AnswerRequest">["answer"],
    Schema<"AnswerReceipt">
  >(
    (value, key) =>
      api.mutate(
        `/api/v1/companies/${companyId}/processing-issues/${issue.id}/answers`,
        "POST",
        { answer: value },
        key,
        session.session_version,
      ),
    async () => {
      setDismissed(issue.id);
      setChoice("");
      onClose?.();
      await Promise.all([
        cache.invalidateQueries({
          queryKey: ["session", companyId, session.id],
        }),
        cache.invalidateQueries({
          queryKey: ["issues", companyId, session.id],
        }),
        cache.invalidateQueries({ queryKey: ["sessions", companyId] }),
        cache.invalidateQueries({ queryKey: ["forecast", companyId] }),
      ]);
    },
  );
  const close = () => {
    setDismissed(issue.id);
    onClose?.();
  };
  return (
    <>
      {showTrigger && dismissed === issue.id && !requested ? (
        <Button variant="secondary" onClick={() => setDismissed(null)}>
          <AppIcon name="Eye" />
          مشاهده سؤال پیش‌بینی
        </Button>
      ) : null}
      <Dialog
        icon="TrendingUp"
        open={dismissed !== issue.id || requested}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title="برای ادامه پیش‌بینی، پاسخ لازم است"
      >
        <p className="mb-5 leading-7">
          {financialQuestionText(issue.question_fa).replace(
            /\b\d+\b/g,
            persianDigits,
          )}
        </p>
        {canOperate ? (
          <Form
            key={issue.id}
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (issue.answer_kind === "date") {
                const value = String(
                  new FormData(e.currentTarget).get("expected_on") ?? "",
                );
                if (value) answer.mutate({ kind: "date", value });
              } else if (choice)
                answer.mutate({ kind: "choice", value: choice });
            }}
          >
            {issue.answer_kind === "date" ? (
              <Field
                icon="CalendarRange"
                label="تاریخ مورد انتظار"
                id="forecast-date"
              >
                <PersianDatePicker
                  id="forecast-date"
                  name="expected_on"
                  label="تاریخ مورد انتظار"
                  required
                  disabled={answer.isPending}
                />
              </Field>
            ) : (
              <Field icon="MessageCircle" label="پاسخ" id="forecast-choice">
                <Select
                  id="forecast-choice"
                  label="پاسخ"
                  value={choice}
                  onValueChange={setChoice}
                  options={(issue.constraints.choices ?? []).map((value) => ({
                    value,
                    label: value === "affirmed" ? "تأیید می‌کنم" : "مشخص نیست",
                  }))}
                  disabled={answer.isPending}
                />
              </Field>
            )}
            {answer.error ? (
              <FormMessage>{message(answer.error)}</FormMessage>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                disabled={
                  answer.isPending || (issue.answer_kind !== "date" && !choice)
                }
              >
                <AppIcon name="Save" />
                {answer.isPending ? "در حال ثبت…" : "ثبت پاسخ و ادامه"}
              </Button>
              {issue.constraints.allow_unknown ? (
                <Button
                  variant="secondary"
                  disabled={answer.isPending}
                  onClick={() => answer.mutate({ kind: "unknown" })}
                >
                  <AppIcon name="TrendingUp" />
                  زمان یا فرض مشخص نیست
                </Button>
              ) : null}
            </div>
          </Form>
        ) : (
          <p className="text-sm text-muted">
            پاسخ مسئول مالی یا حسابدار لازم است.
          </p>
        )}
      </Dialog>
    </>
  );
}
