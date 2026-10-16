"use client";
import { Button } from "@/components/ui/button";
import { Check } from "@/components/ui/icons";
export function OverdueFilter({ value, onChange, label = "وضعیت سررسید" }: { value: boolean; onChange: (value: boolean) => void; label?: string }) {
  return <div className="flex gap-1 rounded-lg border border-border p-1" role="group" aria-label={label}>{[{ value: false, label: "همه" }, { value: true, label: "سررسیدگذشته" }].map((option) => <Button key={String(option.value)} variant={value === option.value ? "secondary" : "ghost"} className="min-h-11 transition-[background-color,transform] active:scale-[0.97] motion-reduce:transition-none" aria-pressed={value === option.value} onClick={() => onChange(option.value)}><Check size={15} aria-hidden="true" className={value === option.value ? "opacity-100 transition-opacity motion-reduce:transition-none" : "opacity-0 transition-opacity motion-reduce:transition-none"} />{option.label}</Button>)}</div>;
}
