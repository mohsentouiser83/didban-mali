"use client";
import { useState } from "react";
import { Form, FormMessage } from "@/components/ui/form";
import { ControlLabel, fieldIcon } from "@/components/ui/field-layout";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SelectField, SelectOption } from "./select-field";
import type { ComparisonItem } from "@/lib/moadian";

export function ComparisonReviewForm({ item, busy, error, onSave }: {
  item: ComparisonItem; busy: boolean; error: string;
  onSave: (note: string, decision: "open" | "resolved") => void;
}) {
  const [note, setNote] = useState(item.note ?? "");
  const [decision, setDecision] = useState<"open" | "resolved">(item.decision ?? "open");
  return <Form className="grid gap-4 border-t border-border pt-5" onSubmit={(event) => { event.preventDefault(); onSave(note, decision); }}>
    <h3 className="font-medium">ثبت رسیدگی</h3>
    <div className="grid gap-2"><ControlLabel htmlFor="comparison-decision" icon={fieldIcon("وضعیت رسیدگی")}>وضعیت رسیدگی</ControlLabel><SelectField id="comparison-decision" value={decision} onValueChange={(value) => setDecision(value as "open" | "resolved")} disabled={busy}><SelectOption value="open">در حال پیگیری</SelectOption><SelectOption value="resolved">رسیدگی‌شده</SelectOption></SelectField></div>
    <div className="grid gap-2"><ControlLabel htmlFor="comparison-review-note" icon={fieldIcon("شرح رسیدگی")}>شرح رسیدگی</ControlLabel><Textarea id="comparison-review-note" required maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} disabled={busy} /></div>
    {error && <FormMessage>{error}</FormMessage>}
    <Button type="submit" disabled={busy} className="justify-self-start">{busy ? "در حال ذخیره…" : "ذخیره رسیدگی"}</Button>
  </Form>;
}
