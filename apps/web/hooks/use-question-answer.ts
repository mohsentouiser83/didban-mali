"use client";
import { notify } from "@/components/ui/sonner";
import { api, type Issue, type ProcessingSession } from "@/lib/api";
import { requiredFields } from "@/lib/import-fields";
import { useState } from "react";
import { useWorkspace } from "./workspace";
function existingMapping(issue: Issue): Record<string, string> {
  const value = issue.evidence.mapping;
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      )
    : {};
}
export function useQuestionAnswer(
  issue: Issue,
  session: ProcessingSession,
  onComplete: () => void,
) {
  const workspace = useWorkspace();
  const [value, setValue] = useState("");
  const [family, setFamily] = useState(
    typeof issue.evidence.family === "string" &&
      issue.evidence.family !== "unknown"
      ? issue.evidence.family
      : "",
  );
  const [mapping, setMapping] = useState<Record<string, string>>(() =>
    existingMapping(issue),
  );
  const [coverage, setCoverage] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isMapping = [
    "interpretation",
    "mapping",
    "unknown_source",
    "unknown_family",
    "missing_mapping",
  ].some((code) => issue.code.includes(code));
  const isCoverage = issue.code === "coverage";
  const isDate = ["date", "expected_date"].includes(
    String(issue.evidence.kind),
  );
  const allowUnknownDate =
    isDate && issue.choices.some((choice) => choice.value === "unknown");
  async function submit() {
    setError("");
    if (!isCoverage && !isMapping && !value.trim()) {
      setError(
        issue.evidence.kind === "text"
          ? "پاسخ را وارد کنید."
          : "پاسخ را انتخاب کنید.",
      );
      return;
    }
    if (
      isMapping &&
      (!family ||
        (requiredFields[family] || []).some((field) => !mapping[field]))
    ) {
      setError("نوع منبع و ستون‌های لازم را مشخص کنید.");
      return;
    }
    setBusy(true);
    try {
      await api(
        workspace.companyPath(`processing-issues/${issue.id}/answers`)!,
        {
          method: "POST",
          body: {
            value: isCoverage
              ? coverage
              : isMapping
                ? { family, mapping }
                : value.trim(),
            expected_version: issue.version,
          },
          version: session.version,
        },
      );
      onComplete();
      notify.success("پاسخ ثبت شد.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "پاسخ ثبت نشد.");
    } finally {
      setBusy(false);
    }
  }
  return {
    value,
    setValue,
    family,
    setFamily,
    mapping,
    setMapping,
    coverage,
    setCoverage,
    busy,
    error,
    isMapping,
    isCoverage,
    isDate,
    allowUnknownDate,
    submit,
  };
}
