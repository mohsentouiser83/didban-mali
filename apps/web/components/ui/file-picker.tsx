"use client";
import { cn } from "@/lib/utils";
import { UploadSimpleIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { Button } from "./button";
export function FilePicker({
  onFiles,
  disabled,
  busy,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled && !busy) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!disabled && !busy) onFiles(Array.from(event.dataTransfer.files));
      }}
      className={cn(
        "group flex min-h-64 flex-col items-center justify-center gap-4 rounded-panel border border-dashed px-5 py-8 text-center transition-colors duration-200 ease-interface motion-reduce:transition-none",
        dragging
          ? "border-primary bg-primary-soft"
          : "border-primary/30 bg-canvas/50",
        !disabled && !busy && "hover:border-primary/60 hover:bg-primary-soft/30 focus-within:border-primary/60 focus-within:bg-primary-soft/30",
      )}
    >
      <span className={cn("grid size-16 place-items-center rounded-panel bg-surface text-primary shadow-action transition-transform duration-200 ease-interface motion-reduce:transition-none", dragging && "motion-safe:-translate-y-1")}>
        <UploadSimpleIcon size={30} weight="duotone" aria-hidden />
      </span>
      <div>
        <p className="font-medium">اسناد را اینجا رها کنید</p>
        <p className="mt-1 text-xs text-muted">
          Excel و CSV · تا ۱۰ فایل · مجموع ۲۰ هزار ردیف
        </p>
      </div>
      <input
        ref={input}
        type="file"
        disabled={disabled || busy}
        multiple
        hidden
        accept=".xlsx,.xls,.csv"
        onChange={(event) => {
          onFiles(Array.from(event.target.files || []));
          event.target.value = "";
        }}
      />
      <Button
        variant="secondary"
        busy={busy}
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        {!busy && <UploadSimpleIcon size={18} aria-hidden />}
        انتخاب فایل
      </Button>
    </div>
  );
}
