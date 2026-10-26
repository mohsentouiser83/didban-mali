"use client";
import { useState, type FormEvent } from "react";
import type { Schema } from "@didban/api-client";
import { message } from "@/lib/api";
import { MappingView } from "./mapping-view";
import { useConfigure } from "./use-interpretation";
import { fields as fieldLabels, kinds } from "./labels";
export function MappingController({
  company,
  session,
  file,
  data,
  version,
  open,
  onOpenChange,
}: {
  company: string;
  session: string;
  file: string;
  data: Schema<"SessionInterpretation">;
  version: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const first = data.previews[0];
  const [sheet, setSheet] = useState(first?.sheet_name ?? ""),
    [kind, setKind] = useState(
      first?.selected_kind ??
        (first?.source_kinds.length === 1 ? first.source_kinds[0] : ""),
    ),
    [mapping, setMapping] = useState<Record<string, string>>(
      Object.fromEntries(
        (first?.mapping ?? []).map((m) => [m.target_field, m.source_column]),
      ),
    ),
    [header, setHeader] = useState(String(first?.header_row ?? 1)),
    [unit, setUnit] = useState(first?.unit ?? "source"),
    [calendar, setCalendar] = useState(first?.calendar ?? "source"),
    [reason, setReason] = useState(first?.reason ?? ""),
    [error, setError] = useState<string>();
  const command = useConfigure(company, session, file, () =>
    onOpenChange(false),
  );
  const preview = data.previews.find((s) => s.sheet_name === sheet),
    profile = data.profiles.find((p) => p.source_kind === kind);
  const options = (
    preview?.header_candidates.find((r) => r.row_number === Number(header))
      ?.columns ??
    preview?.columns ??
    []
  ).map((v, i) => ({
    value: String(i + 1),
    label: `${i + 1} · ${v || "ستون بدون نام"}`,
  }));
  const fields = profile
    ? [...profile.required_fields, ...profile.optional_fields].map((key) => ({
        key,
        label: `${fieldLabels[key] ?? key}${profile.required_fields.includes(key) ? " *" : ""}`,
        value: mapping[key] ?? "none",
        validate: (value: string) => {
          if (profile.required_fields.includes(key) && value === "none")
            return "ستون ضروری را انتخاب کنید.";
          if (
            kind === "bank" &&
            key === "amount" &&
            value === "none" &&
            !(
              mapping.deposit &&
              mapping.deposit !== "none" &&
              mapping.withdrawal &&
              mapping.withdrawal !== "none"
            )
          )
            return "ستون مبلغ یا هر دو ستون واریز و برداشت لازم است.";
          if (
            value !== "none" &&
            Object.entries(mapping).some(
              ([other, v]) =>
                other !== key &&
                v === value &&
                (profile.required_fields.includes(other) ||
                  profile.optional_fields.includes(other)),
            )
          )
            return "این ستون به فیلد دیگری هم متصل شده است.";
          return null;
        },
        options: [{ value: "none", label: "انتخاب نشده" }, ...options],
      }))
    : [];
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(undefined);
    const selected = Object.entries(mapping).filter(
      ([k, v]) =>
        v !== "none" &&
        !!v &&
        (profile?.required_fields.includes(k) ||
          profile?.optional_fields.includes(k)),
    );
    if (!reason.trim()) {
      setError("دلیل تنظیم را وارد کنید.");
      return;
    }
    if (
      kind !== "ignore" &&
      (!profile ||
        profile.required_fields.some((k) => !selected.some(([s]) => s === k)))
    ) {
      setError("ستون‌های ضروری را کامل کنید.");
      return;
    }
    if (new Set(selected.map(([, v]) => v)).size !== selected.length) {
      setError("یک ستون را به چند فیلد متصل نکنید.");
      return;
    }
    command.mutate({
      version,
      body: {
        sheet_name: sheet,
        header_row: Number(header),
        source_kind:
          kind as Schema<"SessionInterpretationSettings">["source_kind"],
        unit: unit === "source" ? null : (unit as "IRR" | "IRT"),
        calendar:
          calendar === "source" ? null : (calendar as "jalali" | "gregorian"),
        mapping: selected.map(([target_field, source_column]) => ({
          target_field,
          source_column,
        })),
        reason,
      },
    });
  };
  return (
    <MappingView
      open={open}
      onOpenChange={onOpenChange}
      sheets={data.previews.map((p) => ({
        value: p.sheet_name,
        label: p.sheet_name,
      }))}
      sheet={sheet}
      onSheet={(value) => {
        setSheet(value);
        const p = data.previews.find((p) => p.sheet_name === value);
        setHeader(String(p?.header_row ?? 1));
        setUnit(p?.unit ?? "source");
        setCalendar(p?.calendar ?? "source");
        setReason(p?.reason ?? "");
        setMapping(
          Object.fromEntries(
            (p?.mapping ?? []).map((m) => [m.target_field, m.source_column]),
          ),
        );
        setKind(p?.source_kinds.length === 1 ? p.source_kinds[0] : "");
      }}
      kinds={Object.entries(kinds).map(([value, label]) => ({ value, label }))}
      kind={kind}
      onKind={setKind}
      header={header}
      onHeader={setHeader}
      unit={unit}
      onUnit={setUnit}
      calendar={calendar}
      onCalendar={setCalendar}
      fields={fields}
      onColumn={(key, value) =>
        setMapping((current) => ({ ...current, [key]: value }))
      }
      reason={reason}
      onReason={setReason}
      busy={command.isPending}
      error={error || (command.error ? message(command.error) : undefined)}
      onSubmit={submit}
    />
  );
}
