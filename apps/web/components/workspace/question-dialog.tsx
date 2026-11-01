"use client";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConditionalRegion } from "@/components/ui/conditional-region";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useQuestionAnswer } from "@/hooks/use-question-answer";
import { useWorkspace } from "@/hooks/workspace";
import { type Issue, type ProcessingSession } from "@/lib/api";
import {
  familyOptions,
  fieldLabels,
  requiredFields,
  optionalFields,
} from "@/lib/import-fields";
import {
  ArrowsLeftRightIcon,
  CalendarBlankIcon,
  CheckIcon,
  ChatsCircleIcon,
  CurrencyCircleDollarIcon,
  FilesIcon,
  HashIcon,
  ReceiptIcon,
  UsersThreeIcon,
  WalletIcon,
  type Icon,
} from "@phosphor-icons/react";
import { useState } from "react";

function mappingIcon(field: string): Icon {
  if (["date", "due_date", "paid_on"].includes(field)) return CalendarBlankIcon;
  if (
    ["amount", "debit", "credit", "total_obligation", "paid_as_of"].includes(
      field,
    )
  )
    return CurrencyCircleDollarIcon;
  if (field === "party_id") return UsersThreeIcon;
  if (["account", "bank_account", "role"].includes(field)) return WalletIcon;
  if (field === "direction") return ArrowsLeftRightIcon;
  if (field === "confirmed") return CheckIcon;
  if (["kind", "entry_type"].includes(field)) return ReceiptIcon;
  return HashIcon;
}

export function QuestionDialog({
  issue,
  session,
  onDone,
}: {
  issue: Issue;
  session: ProcessingSession;
  onDone: () => void;
}) {
  const workspace = useWorkspace();
  const [open, setOpen] = useState(true);
  const {
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
  } = useQuestionAnswer(issue, session, () => {
    setOpen(false);
    onDone();
  });
  return (
    <>
      <Button variant="soft" onClick={() => setOpen(true)}>
        <ChatsCircleIcon size={18} aria-hidden />
        پاسخ به سؤال
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={issue.question}
        description="کل نوبت تا ثبت پاسخ معتبر متوقف است."
      >
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {issue.evidence.sheet && <Badge>{issue.evidence.sheet}</Badge>}
          {(issue.evidence.sample?.length || 0) > 0 && (
            <div className="max-w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    {Object.keys(issue.evidence.sample![0])
                      .slice(0, 4)
                      .map((header) => (
                        <TableHead key={header}>{header}</TableHead>
                      ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issue.evidence.sample!.slice(0, 2).map((row, index) => (
                    <TableRow key={index}>
                      {Object.keys(issue.evidence.sample![0])
                        .slice(0, 4)
                        .map((header) => (
                          <TableCell key={header}>
                            {row[header] || "—"}
                          </TableCell>
                        ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {isCoverage ? (
            <div className="space-y-1">
              {issue.evidence.fields?.map((field) => (
                <Checkbox
                  key={field.key}
                  id={`coverage-${field.key}`}
                  checked={coverage[field.key] || false}
                  onCheckedChange={(checked) =>
                    setCoverage((previous) => ({
                      ...previous,
                      [field.key]: checked,
                    }))
                  }
                  label={field.label}
                />
              ))}
            </div>
          ) : isMapping ? (
            <div className="space-y-4">
              <Field id="issue-family" label="نوع منبع" icon={FilesIcon}>
                <Select
                  id="issue-family"
                  value={family}
                  onValueChange={setFamily}
                  options={familyOptions}
                />
              </Field>
              <ConditionalRegion key={family} className="space-y-4">
                {(requiredFields[family] || []).map((field) => (
                  <Field
                    key={field}
                    id={`mapping-${field}`}
                    label={fieldLabels[field] || field}
                    icon={mappingIcon(field)}
                  >
                    <Select
                      id={`mapping-${field}`}
                      value={mapping[field] || ""}
                      onValueChange={(header) =>
                        setMapping((previous) => ({
                          ...previous,
                          [field]: header,
                        }))
                      }
                      options={(issue.evidence.headers || []).map((header) => ({
                        value: header,
                        label: header,
                      }))}
                    />
                  </Field>
                ))}
                {(optionalFields[family] || []).map((field) => (
                  <Field
                    key={field}
                    id={`mapping-${field}`}
                    label={`${fieldLabels[field] || field} (اختیاری)`}
                    icon={mappingIcon(field)}
                  >
                    <Select
                      id={`mapping-${field}`}
                      value={mapping[field] || "none"}
                      onValueChange={(header) =>
                        setMapping((previous) => {
                          const next = { ...previous };
                          if (header === "none") delete next[field];
                          else next[field] = header;
                          return next;
                        })
                      }
                      options={[
                        { value: "none", label: "بدون ستون" },
                        ...(issue.evidence.headers || []).map((header) => ({
                          value: header,
                          label: header,
                        })),
                      ]}
                    />
                  </Field>
                ))}
              </ConditionalRegion>
            </div>
          ) : (
            <Field
              id="issue-answer"
              icon={isDate ? CalendarBlankIcon : ChatsCircleIcon}
              label={
                typeof issue.evidence.label === "string"
                  ? issue.evidence.label
                  : "پاسخ"
              }
            >
              {issue.evidence.kind === "text" ? (
                <Input
                  id="issue-answer"
                  required
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                />
              ) : isDate ? (
                <PersianDatePicker
                  id="issue-answer"
                  value={value === "unknown" ? "" : value}
                  onChange={setValue}
                  disabled={value === "unknown"}
                  minExclusive={
                    typeof issue.evidence.as_of_date === "string"
                      ? issue.evidence.as_of_date
                      : undefined
                  }
                />
              ) : (
                <Select
                  id="issue-answer"
                  value={value}
                  onValueChange={setValue}
                  options={
                    issue.choices.length
                      ? issue.choices
                      : workspace.periods.map((period) => ({
                          value: period.id,
                          label: period.name,
                        }))
                  }
                />
              )}
            </Field>
          )}
          <ConditionalRegion show={allowUnknownDate}>
            <Checkbox
              id="expected-date-unknown"
              checked={value === "unknown"}
              onCheckedChange={(checked) => setValue(checked ? "unknown" : "")}
              label="زمان نامعلوم"
            />
          </ConditionalRegion>
          {issue.code === "period" && !workspace.periods.length && (
            <ButtonLink href="/settings/periods" variant="secondary">
              <CalendarBlankIcon
                size={18}
                className="text-primary"
                aria-hidden
              />
              تعریف دوره مالی
            </ButtonLink>
          )}
          <FormMessage error>{error}</FormMessage>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              بعداً پاسخ می‌دهم
            </Button>
            <Button type="submit" busy={busy}>
              <CheckIcon size={18} aria-hidden />
              ثبت پاسخ و ادامه
            </Button>
          </div>
        </Form>
      </Dialog>
    </>
  );
}
